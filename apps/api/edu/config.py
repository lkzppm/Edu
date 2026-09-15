from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://edu:edu@localhost:5432/edu"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:3001/api/connectors/classroom/callback"
    # Canonical dashboard origin (e.g. http://edu.localhost behind the Gateway
    # proxy). The OAuth callback bounces here; empty → stay on the current host.
    web_origin: str = ""
    timezone: str = "America/Sao_Paulo"
    # Claude Cowork workspace mount (read-only). The compose file binds the
    # host dir (COWORK_DIR) here; on the homelab it's the synced replica.
    workspace_dir: str = "/workspace"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def classroom_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
