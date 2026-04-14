from core.models.gpu_config import GPULLMConfig
from core.config import settings

# SETTINGS
SWITCHES = {
    "EXTRACT_KEYWORDS_DOMAINS": True,  # Whether to extract keywords and domains from input
    "GENERATE_KEYWORD": True,  # Whether to generate appropriate keywords for reference search(uses worklet title as default otherwise)
    "RANK_REFERENCES": True,  # Whether to rank references based on relevance
    "FALLBACK_TO_GEMINI": True,  # Fallback to Gemini if Ollama fails
    "FALLBACK_TO_OPENAI": True,  # Fallback to OpenAI if BOTH Ollama and Gemini fails
    "REMOTE_GPU": settings.REMOTE_GPU,  # Use remote GPU LLMs
    "DISABLE_THINKING": settings.DISABLE_THINKING,  # Disable LLM thinking mode (think=false) for faster inference
    # please refer to core/Setup_Local_ollama.md for setting up local LLM server
}

PORT1 = settings.OLLAMA_PORT1  # port where ollama is running
PORT2 = settings.OLLAMA_PORT2  # port where second ollama instance is running

GPU_MODEL = settings.OLLAMA_MODEL
MAX_TOKENS = settings.OLLAMA_MAX_TOKENS

# GPU LLM configurations
KEYWORD_DOMAIN_EXTRACTION_LLM = GPULLMConfig(model=GPU_MODEL, port=PORT2)
WORKLET_GENERATOR_LLM = GPULLMConfig(model=GPU_MODEL, port=PORT2)
REFERENCE_KEYWORD_LLM = GPULLMConfig(model=GPU_MODEL, port=PORT2)
REFERENCE_KEYWORD_LLM2 = GPULLMConfig(model=GPU_MODEL, port=PORT1)
REFERENCE_RANKING_LLM = GPULLMConfig(model=GPU_MODEL, port=PORT2)
REFERENCE_RANKING_LLM2 = GPULLMConfig(model=GPU_MODEL, port=PORT1)

IMAGE_PARSER_LLM = settings.OLLAMA_IMAGE_MODEL
# Fallback LLM models
# Used if SWITCHES["FALLBACK_TO_GEMINI"] = True
FALLBACK_GEMINI_MODEL = settings.FALLBACK_GEMINI_MODEL

# Used if SWITCHES["FALLBACK_TO_OPENAI"] = True
FALLBACK_OPENAI_MODEL = settings.FALLBACK_OPENAI_MODEL

# Graph constants used in agent
PROCESS_INPUT = "process_input"
EXTRACT_KEYWORDS_DOMAINS = "extract_keywords_domains"
GENERATE_WEB_SEARCH_QUERIES = "generate_web_search_queries"
GENERATE_WORKLETS = "generate_worklets"
WEB_SEARCH = "web_search"
REFERENCES = "references"
RANK_REFERENCES = "rank_references"
GENERATE_FILES = "generate_files"
ANSWER = "answer"
FAILURE = "failure"
