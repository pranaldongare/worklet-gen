from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    DATABASE_NAME: str = "bedrock"
    API_KEY_1: str
    API_KEY_2: str
    API_KEY_3: str
    API_KEY_4: str
    API_KEY_5: str
    QUERY_URL: str
    OPENAI_API: str
    REMOTE_GPU: bool = False
    VISION_URL: str
    USE_VISION_MODEL: bool = False

    # Ollama LLM configuration
    OLLAMA_MODEL: str = "gpt-oss:20b-50k-8k"
    OLLAMA_IMAGE_MODEL: str = "gemma3:12b"
    OLLAMA_PORT1: int = 11434
    OLLAMA_PORT2: int = 11435
    OLLAMA_MAX_TOKENS: int = 50000

    # Fallback model names
    FALLBACK_GEMINI_MODEL: str = "gemini-2.0-flash"
    FALLBACK_OPENAI_MODEL: str = "gpt-4o-mini"

    # Thinking mode
    DISABLE_THINKING: bool = True

    # INTERNAL API configuration (defaults to disabled for backward compatibility)
    INTERNAL_BASE_URL: str = ""
    INTERNAL_CLIENT_KEY: str = ""
    INTERNAL_API_TOKEN: str = ""
    INTERNAL_USER_EMAIL: str = ""
    INTERNAL_MODEL_ID: str = ""
    USE_INTERNAL: bool = False  # Set to True in .env to enable INTERNAL API as primary path
    INTERNAL_ONLY: bool = False  # If True, ONLY use INTERNAL — no fallback to GPU/Gemini/OpenAI (attempts bumped to 12)

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
