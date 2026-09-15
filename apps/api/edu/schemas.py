from typing import Literal

from pydantic import BaseModel, Field

# ── connectors ────────────────────────────────────────────────


class MoodleConnectRequest(BaseModel):
    base_url: str = Field(min_length=8)
    display_name: str | None = None
    token: str | None = None
    username: str | None = None
    password: str | None = None


class MoodleReauthRequest(BaseModel):
    """New credential for an account that already exists — no base_url, it is
    the stored one (re-auth never re-points an account at a different site)."""

    token: str | None = None
    username: str | None = None
    password: str | None = None


class CompassoConnectRequest(BaseModel):
    page_url: str = Field(min_length=12)
    display_name: str | None = None


class ConnectorStatus(BaseModel):
    id: int
    name: str
    connected: bool
    institution: str | None
    display_name: str | None
    base_url: str | None
    sync_status: str  # never|syncing|ok|error|auth
    last_sync_at: str | None
    last_error: str | None
    courses: int
    tasks_pending: int
    demo: bool
    # Credential dead (sync_status == "auth"): the account needs a new one.
    needs_auth: bool
    # This account type can be re-authenticated in place (moodle, classroom).
    reauth: str | None  # "moodle" | "classroom" | None


class ConnectorsResponse(BaseModel):
    classroom_credentials_present: bool
    connectors: list[ConnectorStatus]


# ── courses ───────────────────────────────────────────────────


class CourseOut(BaseModel):
    id: int
    account_id: int
    connector: str
    name: str
    code: str | None
    url: str | None
    hidden: bool
    no_tests: bool
    pending: int


class CourseUpdateRequest(BaseModel):
    """Partial update — only the fields sent change (both are Edu-only toggles)."""

    hidden: bool | None = None
    no_tests: bool | None = None


# ── tasks ─────────────────────────────────────────────────────


class TaskOut(BaseModel):
    id: int
    course_id: int | None
    course_name: str | None
    course_code: str | None
    connector: str | None
    kind: str
    title: str
    description: str
    url: str | None
    due_at: str | None
    source_status: str | None
    grade: str | None
    max_grade: str | None
    status: str
    completed_at: str | None


class TasksSummary(BaseModel):
    overdue: int
    due_today: int
    due_week: int
    done_week: int


class TasksResponse(BaseModel):
    summary: TasksSummary
    tasks: list[TaskOut]


# ── grades ────────────────────────────────────────────────────


class GradeItemOut(BaseModel):
    name: str
    grade: str | None  # null → not graded yet
    max_grade: str | None
    pct: float | None
    graded_at: str | None
    url: str | None


class CourseGradesOut(BaseModel):
    course_id: int
    course_name: str
    course_code: str | None
    connector: str
    total: GradeItemOut | None  # source total, or computed from graded items
    items: list[GradeItemOut]


class GradesResponse(BaseModel):
    courses: list[CourseGradesOut]


class ManualTaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    due_at: str | None = None  # ISO 8601
    course_id: int | None = None
    # "manual" = a to-do; "exam" = a test date Lucas adds himself (Tests tab).
    kind: Literal["manual", "exam"] = "manual"


class TaskUpdateRequest(BaseModel):
    status: str  # todo|done|dismissed


# ── college ───────────────────────────────────────────────────


class ClassLink(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=1, max_length=500)


class ClassSlot(BaseModel):
    day: str = Field(min_length=3, max_length=3)  # mon…sun
    start: str = Field(pattern=r"^\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{2}:\d{2}$")
    room: str | None = None


class ClassUpdateRequest(BaseModel):
    """Edu-local edits layered over the registry mirror. Only the fields sent
    change; `reset` drops earlier edits so the workspace value shows again."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    turma: str | None = Field(default=None, max_length=20)
    credits: int | None = Field(default=None, ge=0, le=20)
    professor: str | None = Field(default=None, max_length=200)
    contact: str | None = Field(default=None, max_length=200)
    evaluation: str | None = None
    platform: str | None = Field(default=None, max_length=20)
    platform_url: str | None = Field(default=None, max_length=300)
    links: list[ClassLink] | None = None
    schedule: list[ClassSlot] | None = None
    reset: list[str] = Field(default_factory=list)


# ── degree plan ───────────────────────────────────────────────


class PlanCourseIn(BaseModel):
    """Upsert body for PUT /college/plan/courses/{code} — only the fields
    sent change; `name` is required when the course is new."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    credits: int | None = Field(default=None, ge=0, le=30)
    period: int | None = Field(default=None, ge=1, le=20)
    status: Literal["done", "current", "ahead"] | None = None
    planned: str | None = Field(default=None, pattern=r"^\d{4}/\d$")
    note: str | None = None
    at_risk: bool | None = None
    requires: list[str] | None = None
    counts_for: str | None = Field(default=None, max_length=40)
    role: str | None = Field(default=None, max_length=20)
    unlocks: str | None = Field(default=None, max_length=20)
    # Names of nullable fields to clear (period → becomes an extra, planned, note…).
    clear: list[str] = Field(default_factory=list)


class PlanRequirementIn(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    unit: str | None = Field(default=None, max_length=8)
    required: int | None = Field(default=None, ge=0)
    done: int | None = Field(default=None, ge=0)
    in_course: int | None = Field(default=None, ge=0)
    computed: bool | None = None
    position: int | None = None


class PlanSemesterIn(BaseModel):
    label: str | None = Field(default=None, max_length=80)
    note: str | None = None
    items: list[dict] | None = None


class PlanImportRequest(BaseModel):
    yaml: str = Field(min_length=1)
    replace: bool = True
