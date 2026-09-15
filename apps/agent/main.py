"""Edu agent — Claude Agent SDK service.

Runs on the user's Claude subscription (CLAUDE_CODE_OAUTH_TOKEN from
`claude setup-token`). Tools are in-process MCP wrappers over the Edu API plus
the built-in WebSearch/WebFetch for looking things up; every other built-in
tool (Bash/files/etc.) is disallowed — the agent can see college data and the
web, never the machine. Read-only against the platforms, like Edu itself.
"""

import json
import os
from collections.abc import AsyncIterator

import httpx
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    create_sdk_mcp_server,
    query,
    tool,
)

try:  # location varies across SDK versions
    from claude_agent_sdk import StreamEvent
except ImportError:  # pragma: no cover
    from claude_agent_sdk.types import StreamEvent

from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

API_BASE = os.environ.get("API_BASE", "http://api:8000")

app = FastAPI(title="Edu Agent", version="0.1.0")


async def _get_json(path: str) -> dict | list:
    async with httpx.AsyncClient(base_url=API_BASE, timeout=30) as client:
        resp = await client.get(path)
        resp.raise_for_status()
        return resp.json()


async def _post_json(path: str, payload: dict) -> dict:
    async with httpx.AsyncClient(base_url=API_BASE, timeout=30) as client:
        resp = await client.post(path, json=payload)
        body = resp.json()
        if resp.is_error:
            detail = body.get("detail") if isinstance(body, dict) else None
            return {"error": detail or f"api returned {resp.status_code}"}
        return body


def _as_content(data) -> dict:
    return {
        "content": [
            {"type": "text", "text": json.dumps(data, ensure_ascii=False, default=str)}
        ]
    }


@tool(
    "get_tasks",
    "All tasks across every class plus the summary (overdue, due today, due this week, "
    "done in 7 days). Each task: id, title, course, kind (assignment/quiz/exam/manual), "
    "due date (UTC ISO), status (todo/done), source status (submitted/graded), link. "
    "Use for anything about homework, deadlines, tests or what's due — and to find the "
    "id of a task before delete_task.",
    {},
)
async def get_tasks(args):
    return _as_content(await _get_json("/tasks"))


@tool(
    "get_grades",
    "Grades for every class: per-course grade items (name, grade/max, percent, graded "
    "date, link) and the course total when the platform publishes one. Use for questions "
    "about grades, averages, how many points are still in play, or what's not graded yet.",
    {},
)
async def get_grades(args):
    return _as_content(await _get_json("/grades"))


@tool(
    "get_college",
    "The college picture: this semester's classes from the cowork workspace registry "
    "(code, name, credits, professor + contact, evaluation, schedule with rooms, links, "
    "workspace deliveries) and the full degree plan (curriculum by period with status "
    "dispensada/em_curso/a_cursar, prerequisites, credit summary, forward semesters, "
    "requirement progress). Use for questions about the timetable, professors, the "
    "fluxogram, prerequisites, credits or graduation planning.",
    {},
)
async def get_college(args):
    return _as_content(await _get_json("/college"))


@tool(
    "get_courses",
    "The raw platform course list (id, name, code, platform, hidden flag). Mostly "
    "useful to map course ids; prefer get_tasks/get_grades/get_college for real questions.",
    {},
)
async def get_courses(args):
    return _as_content(await _get_json("/courses"))


@tool(
    "get_connectors",
    "Status of the connectors (moodle UFRJ/Poli, classroom, compasso, cowork): "
    "connected accounts, last sync time and last error.",
    {},
)
async def get_connectors(args):
    return _as_content(await _get_json("/connectors"))


@tool(
    "sync_connector",
    "Trigger a fresh data sync of one connector type: moodle, classroom, compasso or cowork.",
    {"name": str},
)
async def sync_connector(args):
    name = str(args.get("name", "")).lower()
    if name not in ("moodle", "classroom", "compasso", "cowork"):
        return _as_content(
            {"error": "name must be moodle, classroom, compasso or cowork"}
        )
    async with httpx.AsyncClient(base_url=API_BASE, timeout=30) as client:
        resp = await client.post(f"/connectors/{name}/sync")
        return _as_content(resp.json())


def _match_course(courses: list[dict], wanted: str) -> int | None:
    """Resolve a class the way Lucas names it — 'EEL770', 'redes', part of a
    course name. Exact code/name wins; visible courses beat hidden ones."""
    want = wanted.strip().lower()
    if not want:
        return None
    pools = [[c for c in courses if not c.get("hidden")], courses]
    for pool in pools:
        for c in pool:
            if want in ((c.get("code") or "").lower(), (c.get("name") or "").lower()):
                return c["id"]
        for c in pool:
            if (
                want in (c.get("code") or "").lower()
                or want in (c.get("name") or "").lower()
            ):
                return c["id"]
    return None


async def _resolve_course(wanted: str) -> tuple[int | None, dict | None]:
    """Class code/name → course id, or (None, error payload) when nothing matches."""
    courses = await _get_json("/courses")
    course_id = _match_course(courses, wanted)
    if course_id is None:
        # The registry's canonical codes can differ from the platform's.
        college = await _get_json("/college")
        classes = [
            {
                "id": c["course_id"],
                "code": c.get("code"),
                "name": c.get("name"),
                "hidden": False,
            }
            for c in college.get("classes", [])
            if c.get("course_id") is not None
        ]
        course_id = _match_course(classes, wanted)
    if course_id is None:
        return None, {
            "error": f"No class matches {wanted!r} — ask which one, or omit it.",
            "classes": [
                {"code": c.get("code"), "name": c.get("name")}
                for c in courses
                if not c.get("hidden")
            ],
        }
    return course_id, None


@tool(
    "create_task",
    "Add a personal to-do to Edu's task list, optionally attached to one class. "
    "Edu-only: it lives in the dashboard and is never pushed to Moodle, Classroom or "
    "any platform. Use when Lucas asks to remember, add, note or schedule something — "
    "but NOT for a prova/exam/test: those go through create_test. "
    "due_at is LOCAL time (America/Sao_Paulo) as 'YYYY-MM-DDTHH:MM' — never UTC. "
    "'course' takes a class code or name (e.g. 'EEL770'); leave it out for a task "
    "that belongs to no class.",
    {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "What has to be done."},
            "due_at": {
                "type": "string",
                "description": "Local due date/time, ISO 'YYYY-MM-DDTHH:MM'. Omit if none.",
            },
            "course": {
                "type": "string",
                "description": "Class code or name to attach it to. Omit for a personal task.",
            },
            "description": {"type": "string", "description": "Optional extra notes."},
        },
        "required": ["title"],
    },
)
async def create_task(args):
    title = str(args.get("title") or "").strip()
    if not title:
        return _as_content({"error": "title is required"})

    course_id = None
    wanted = str(args.get("course") or "").strip()
    if wanted:
        course_id, error = await _resolve_course(wanted)
        if error:
            return _as_content(error)

    return _as_content(
        await _post_json(
            "/tasks",
            {
                "title": title,
                "description": str(args.get("description") or "").strip(),
                "due_at": str(args.get("due_at") or "").strip() or None,
                "course_id": course_id,
            },
        )
    )


@tool(
    "create_test",
    "Add a TEST (prova, exam, P1/P2, final) date to Edu's Tests tab for one class. "
    "Not a to-do: tests never go in the task list — use this, never create_task, when "
    "Lucas mentions a prova/exam/test. Edu-only, never pushed to any platform. "
    "due_at is LOCAL time (America/Sao_Paulo) as 'YYYY-MM-DDTHH:MM' — never UTC; when he "
    "gives only a day use that day at the class's usual time if you know it, else 23:59. "
    "'course' is the class code or name (e.g. 'COS242', 'grafos') and is required.",
    {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "The test's name as he'd call it, e.g. 'P1' or 'Prova final'.",
            },
            "due_at": {
                "type": "string",
                "description": "Local date/time, ISO 'YYYY-MM-DDTHH:MM'.",
            },
            "course": {
                "type": "string",
                "description": "Class code or name the test belongs to.",
            },
            "description": {
                "type": "string",
                "description": "Optional notes (room, topics).",
            },
        },
        "required": ["title", "due_at", "course"],
    },
)
async def create_test(args):
    title = str(args.get("title") or "").strip()
    due_at = str(args.get("due_at") or "").strip()
    wanted = str(args.get("course") or "").strip()
    if not title or not due_at or not wanted:
        return _as_content(
            {"error": "title, due_at and course are all required for a test"}
        )
    course_id, error = await _resolve_course(wanted)
    if error:
        return _as_content(error)
    return _as_content(
        await _post_json(
            "/tasks",
            {
                "title": title,
                "description": str(args.get("description") or "").strip(),
                "due_at": due_at,
                "course_id": course_id,
                "kind": "exam",
            },
        )
    )


@tool(
    "delete_task",
    "Remove one task or test from Edu by id (find it with get_tasks first; never guess "
    "an id). Rows Lucas added himself (to-dos, hand-added tests) are deleted for good; "
    "rows synced from a platform can't be deleted (Edu is read-only against the "
    "platforms) — they are dismissed instead, which hides them from Edu until he asks "
    "for them back. The result says which happened. Ask before acting when more than one "
    "task could be the one he means.",
    {
        "type": "object",
        "properties": {
            "id": {"type": "integer", "description": "The task id from get_tasks."},
        },
        "required": ["id"],
    },
)
async def delete_task(args):
    try:
        task_id = int(args.get("id"))
    except (TypeError, ValueError):
        return _as_content({"error": "id must be an integer from get_tasks"})
    async with httpx.AsyncClient(base_url=API_BASE, timeout=30) as client:
        resp = await client.delete(f"/tasks/{task_id}")
        if resp.status_code == 409:
            # Synced row — the read-only rule: hide it, don't delete it.
            resp = await client.patch(f"/tasks/{task_id}", json={"status": "dismissed"})
            if resp.is_error:
                return _as_content({"error": f"api returned {resp.status_code}"})
            task = resp.json()
            return _as_content(
                {
                    "result": "dismissed",
                    "note": "Synced from a platform, so it was hidden rather than deleted.",
                    "task": {
                        k: task.get(k) for k in ("id", "title", "course_code", "kind")
                    },
                }
            )
        if resp.is_error:
            body = resp.json()
            detail = body.get("detail") if isinstance(body, dict) else None
            return _as_content({"error": detail or f"api returned {resp.status_code}"})
        return _as_content({"result": "deleted", "id": task_id})


EDU_TOOLS = [
    get_tasks,
    get_grades,
    get_college,
    get_courses,
    get_connectors,
    sync_connector,
    create_task,
    create_test,
    delete_task,
]
edu_server = create_sdk_mcp_server(name="edu", version="1.0.0", tools=EDU_TOOLS)

SYSTEM_PROMPT = """You are Edu, Lucas's college copilot inside his self-hosted dashboard. \
Your replies are short briefings — a few lines, never a report. He studies Engenharia de \
Computação e Informação at UFRJ (POLI/COPPE). His classes live on Google Classroom, Moodle \
UFRJ (moodle.cos), Polimoodle (moodle.poli), a Compasso schedule page, and his Claude Cowork \
workspace (~/Desktop/UFRJ) — Edu unifies them into tasks, grades, the semester registry and \
his degree plan.

Data rules:
- ALWAYS fetch live data with your edu tools before stating any fact about his tasks, \
grades, classes, schedule or degree plan. Never invent or estimate values you didn't just \
read from a tool.
- Deadlines: get_tasks. Grades and points still in play: get_grades. Timetable, professors, \
prerequisites, credits, graduation: get_college. Stale/failing sources: get_connectors.
- Dates in the API are UTC ISO; Lucas lives in America/Sao_Paulo (UTC-3) — always convert \
before telling him a day or time, and say dates in English ("Mon, Aug 31 at 23:59").
- Use WebSearch/WebFetch only for genuinely external questions (a concept, a book, a UFRJ \
rule); his own data always comes from the tools.
- create_task adds a to-do to Edu (his list only — never the platform). Use it when he asks \
you to remember/add/note something, attach it to the class he named (code or name), and \
convert the date he says to LOCAL time 'YYYY-MM-DDTHH:MM'. Confirm in one line what you \
added (title, class, date). If the class is ambiguous, ask instead of guessing.
- create_test adds a TEST date (prova, exam, P1/P2, final) to the Tests tab. A test is never \
a to-do: whenever he mentions a prova/exam/test, use create_test, not create_task. It needs \
the class and the date; ask for whichever is missing.
- delete_task removes a to-do or test he no longer wants: get_tasks first to find the id, \
then delete. His own rows are deleted; platform rows can only be dismissed (hidden) — say \
which happened. If several tasks could match, list them and ask.

Advice rules:
- Be concrete and anchored in his actual data: which task, which class, how many points, \
which prerequisite. Point out risks he hasn't asked about when they matter (an overdue \
task, a class with many points still in play, a prerequisite chain).
- You inform decisions; Lucas makes them. Flag uncertainty plainly instead of hedging.

Style rules:
- Reply in the language the user wrote in (Portuguese or English).
- BE SHORT. Hard cap: ~120 words or one small table. Most answers fit in 3-6 lines. Go \
longer only when Lucas explicitly asks for depth ("explain", "details", "why", "explica").
- First line = the verdict (the number, the date, the yes/no). Everything after it must \
earn its place — never dump everything a tool returned.
- No greetings, no preamble, no recap of the question, no "in summary", no closing offers \
of help, no headers unless the answer genuinely needs structure.
- Never use emojis or decorative symbols. Plain text, short tables or bullet lists only.
- You are read-only against the platforms: you cannot submit work or change grades. You \
can trigger a data re-sync with sync_connector, add local to-dos with create_task and test \
dates with create_test, remove them with delete_task.
- If a connector shows an error or stale data, mention it so numbers are read with care."""

CHAT_OPTIONS = {
    "system_prompt": SYSTEM_PROMPT,
    "mcp_servers": {"edu": edu_server},
    "allowed_tools": [
        "mcp__edu__get_tasks",
        "mcp__edu__get_grades",
        "mcp__edu__get_college",
        "mcp__edu__get_courses",
        "mcp__edu__get_connectors",
        "mcp__edu__sync_connector",
        "mcp__edu__create_task",
        "mcp__edu__create_test",
        "mcp__edu__delete_task",
        "WebSearch",
        "WebFetch",
    ],
    "disallowed_tools": [
        "Bash",
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "NotebookEdit",
        "Task",
        "TodoWrite",
        "ToolSearch",
        "Skill",
        "SlashCommand",
    ],
    "include_partial_messages": True,
    # Some questions chain several tool reads (tasks + grades + college).
    "max_turns": 24,
}


VALID_EFFORTS = {"low", "medium", "high", "xhigh", "max"}


class ChatImage(BaseModel):
    media_type: str  # image/png, image/jpeg, image/webp, image/gif
    data: str  # base64 payload, no data: prefix


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    model: str | None = None
    effort: str | None = None
    images: list[ChatImage] | None = None


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.get("/health")
def health():
    return {"status": "ok", "authenticated": _has_credentials()}


def _has_credentials() -> bool:
    return bool(
        os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY")
    )


@app.post("/chat")
async def chat(body: ChatRequest):
    if not _has_credentials():
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Agent not authenticated — run `claude setup-token` on your machine, "
                "put the token in .env as CLAUDE_CODE_OAUTH_TOKEN and restart the agent container."
            },
        )

    async def events() -> AsyncIterator[str]:
        extra: dict = {}
        if body.model:
            extra["model"] = body.model
        if body.effort in VALID_EFFORTS:
            extra["effort"] = body.effort

        def make_prompt():
            """Plain string normally; a streamed user message when images ride along."""
            if not body.images:
                return body.message
            content: list[dict] = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": img.media_type,
                        "data": img.data,
                    },
                }
                for img in body.images
            ]
            content.append(
                {"type": "text", "text": body.message or "Analyze the image."}
            )

            async def gen():
                yield {"type": "user", "message": {"role": "user", "content": content}}

            return gen()

        # If resuming fails before any output (session file gone — e.g. a
        # rebuilt container), retry once with a fresh session instead of
        # erroring: the chat keeps working, `done` carries the new session_id.
        attempts = [body.session_id, None] if body.session_id else [None]
        for attempt_no, resume_id in enumerate(attempts):
            options = ClaudeAgentOptions(**CHAT_OPTIONS, resume=resume_id, **extra)
            session_id = resume_id
            emitted_any = False
            # Tool inputs stream as input_json_delta fragments per block index;
            # accumulate and emit the parsed params once the block closes.
            pending_tools: dict[int, dict] = {}
            streamed_text = False
            try:
                async for message in query(prompt=make_prompt(), options=options):
                    if isinstance(message, StreamEvent):
                        event = message.event or {}
                        etype = event.get("type")
                        if etype == "content_block_delta":
                            delta = event.get("delta", {})
                            if delta.get("type") == "text_delta" and delta.get("text"):
                                streamed_text = True
                                emitted_any = True
                                yield _sse({"type": "text", "delta": delta["text"]})
                            elif delta.get("type") == "input_json_delta":
                                idx = event.get("index")
                                if idx in pending_tools:
                                    pending_tools[idx]["json"] += delta.get(
                                        "partial_json", ""
                                    )
                        elif etype == "content_block_start":
                            block = event.get("content_block", {})
                            if block.get("type") == "tool_use":
                                name = str(block.get("name", "")).replace(
                                    "mcp__edu__", ""
                                )
                                pending_tools[event.get("index")] = {
                                    "name": name,
                                    "json": "",
                                }
                                emitted_any = True
                                yield _sse({"type": "tool", "name": name})
                            elif block.get("type") == "thinking":
                                # Content stays private; only a status signal goes out.
                                emitted_any = True
                                yield _sse({"type": "thinking"})
                        elif etype == "content_block_stop":
                            info = pending_tools.pop(event.get("index"), None)
                            if info is not None:
                                raw = info["json"].strip()
                                try:
                                    parsed = json.loads(raw) if raw else {}
                                except ValueError:
                                    parsed = {"raw": raw[:500]}
                                yield _sse(
                                    {
                                        "type": "tool_input",
                                        "name": info["name"],
                                        "input": parsed,
                                    }
                                )
                    elif isinstance(message, AssistantMessage) and not streamed_text:
                        # Fallback if partial streaming is unavailable in this SDK version.
                        for block in message.content:
                            text = getattr(block, "text", None)
                            if text:
                                emitted_any = True
                                yield _sse({"type": "text", "delta": text})
                    elif isinstance(message, ResultMessage):
                        session_id = message.session_id or session_id
                yield _sse({"type": "done", "session_id": session_id})
                return
            except Exception as exc:  # noqa: BLE001 — surface, never crash the stream
                is_last = attempt_no == len(attempts) - 1
                if not is_last and not emitted_any:
                    continue  # dead session — run again without resume
                yield _sse({"type": "error", "message": str(exc)[:400]})
                return

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"cache-control": "no-store", "x-accel-buffering": "no"},
    )
