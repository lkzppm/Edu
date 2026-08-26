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


def _as_content(data) -> dict:
    return {
        "content": [
            {"type": "text", "text": json.dumps(data, ensure_ascii=False, default=str)}
        ]
    }


@tool(
    "get_tasks",
    "All tasks across every class plus the summary (overdue, due today, due this week, "
    "done in 7 days). Each task: title, course, kind (assignment/quiz/exam/personal), "
    "due date (UTC ISO), status (todo/done), source status (submitted/graded), link. "
    "Use for anything about homework, deadlines, tests or what's due.",
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


EDU_TOOLS = [
    get_tasks,
    get_grades,
    get_college,
    get_courses,
    get_connectors,
    sync_connector,
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
can trigger a data re-sync with sync_connector when he asks for fresh data.
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
