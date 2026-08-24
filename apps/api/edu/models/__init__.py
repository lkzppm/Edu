from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from edu.db import Base

GRADE = Numeric(10, 2)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Connector TYPE — many accounts may share it (two Moodle sites…).
    # Instances are addressed by id.
    connector: Mapped[str] = mapped_column(String(20))  # moodle | classroom
    institution: Mapped[str] = mapped_column(String(80))
    display_name: Mapped[str] = mapped_column(String(120))
    base_url: Mapped[str | None] = mapped_column(String(200))  # Moodle site root
    # Connector-specific config entered via the UI (token, refresh_token…). Never logged.
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    sync_status: Mapped[str] = mapped_column(String(12), default="never")  # never|syncing|ok|error
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    courses: Mapped[list["Course"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (UniqueConstraint("account_id", "external_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    external_id: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str | None] = mapped_column(String(80))  # short name, e.g. COS110
    url: Mapped[str | None] = mapped_column(String(300))
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)  # user toggle; still syncs

    account: Mapped[Account] = relationship(back_populates="courses")
    tasks: Mapped[list["Task"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    grade_items: Mapped[list["GradeItem"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )


class GradeItem(Base):
    """One gradebook entry (Moodle grade item / Classroom graded coursework).
    Pure mirror of the source — no local state, so sync fully replaces rows."""

    __tablename__ = "grade_items"
    __table_args__ = (UniqueConstraint("course_id", "external_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    external_id: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(300))
    kind: Mapped[str] = mapped_column(String(12))  # item | total
    grade: Mapped[Decimal | None] = mapped_column(GRADE)  # null → not graded yet
    max_grade: Mapped[Decimal | None] = mapped_column(GRADE)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    url: Mapped[str | None] = mapped_column(String(500))  # deep link to the activity
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    course: Mapped[Course] = relationship(back_populates="grade_items")


class Task(Base):
    """Unified unit of work: assignment, quiz, exam, calendar event or manual
    to-do. `status` is Edu-local and never clobbered by sync (rule 6)."""

    __tablename__ = "tasks"
    __table_args__ = (UniqueConstraint("course_id", "external_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    external_id: Mapped[str | None] = mapped_column(String(128))  # null → manual task
    kind: Mapped[str] = mapped_column(String(12))  # assignment|quiz|exam|event|activity|manual
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")  # plain text, HTML stripped
    url: Mapped[str | None] = mapped_column(String(500))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # What the platform says (submitted|graded|completed…) — display-only.
    source_status: Mapped[str | None] = mapped_column(String(20))
    grade: Mapped[Decimal | None] = mapped_column(GRADE)
    max_grade: Mapped[Decimal | None] = mapped_column(GRADE)
    status: Mapped[str] = mapped_column(String(12), default="todo")  # todo|done|dismissed
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    course: Mapped[Course | None] = relationship(back_populates="tasks")
