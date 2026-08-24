FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

COPY pyproject.toml ./
COPY edu ./edu
RUN pip install ".[dev]"
COPY tests ./tests

EXPOSE 8000
CMD ["uvicorn", "edu.main:app", "--host", "0.0.0.0", "--port", "8000"]
