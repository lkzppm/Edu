from pydantic import BaseModel, Field

# ── connectors ────────────────────────────────────────────────


class MoodleConnectRequest(BaseModel):
    base_url: str = Field(min_length=8)
    display_name: str | None = None
    token: str | None = None
    username: str | None = None
    password: str | None = None


class ConnectorStatus(BaseModel):
    id: int
    name: str
    connected: bool
    institution: str | None
    display_name: str | None
    base_url: str | None
    sync_status: str
    last_sync_at: str | None
    last_error: str | None
    courses: int
    tasks_pending: int
    demo: bool


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
    pending: int


class CourseUpdateRequest(BaseModel):
    hidden: bool


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


class TaskUpdateRequest(BaseModel):
    status: str  # todo|done|dismissed
