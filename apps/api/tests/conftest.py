import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from edu.db import Base
from edu.models import Account


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        yield session


@pytest.fixture
def account(session):
    acc = Account(
        connector="moodle",
        institution="Moodle UFRJ",
        display_name="Moodle UFRJ",
        base_url="https://moodle.example",
        config={"base_url": "https://moodle.example", "token": "x"},
    )
    session.add(acc)
    session.commit()
    return acc
