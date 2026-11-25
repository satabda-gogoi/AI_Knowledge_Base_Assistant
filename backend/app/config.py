"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Gemini API
    google_api_key: str = ""
    gemini_chat_model: str = "gemini-2.5-flash"
    gemini_embedding_model: str = "gemini-embedding-001"

    # Qdrant Vector Store (local persistent disk by default, or Qdrant Cloud)
    qdrant_path: str = "./data/qdrant_db"
    qdrant_collection: str = "knowledge_base"
    qdrant_url: str = ""
    qdrant_api_key: str = ""

    # Storage & Limits
    sqlite_db_path: str = "./data/app.db"
    upload_dir: str = "./data/uploads"
    max_file_size_mb: int = 20
    chunk_size: int = 1000
    chunk_overlap: int = 200
    retrieval_k: int = 5

    # CORS
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def ensure_directories(self) -> None:
        """Create required local storage directories."""
        Path(self.sqlite_db_path).parent.mkdir(parents=True, exist_ok=True)
        Path(self.upload_dir).mkdir(parents=True, exist_ok=True)
        if not self.qdrant_url:
            Path(self.qdrant_path).mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    settings = Settings()
    settings.ensure_directories()
    return settings
