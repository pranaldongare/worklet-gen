import asyncio
import threading
import time
from core.config import settings
from google import genai
from openai import AsyncOpenAI
from langchain_core.output_parsers import PydanticOutputParser
from core.constants import (
    SWITCHES,
    FALLBACK_OPENAI_MODEL,
    FALLBACK_GEMINI_MODEL,
    INTERNAL_BASE_URL,
    INTERNAL_CLIENT_KEY,
    INTERNAL_API_TOKEN,
    INTERNAL_USER_EMAIL,
    INTERNAL_MODEL_ID,
)

if SWITCHES["REMOTE_GPU"]:
    import core.llm.configurations.remote_llm as llm_module
else:
    import core.llm.configurations.local_llm as llm_module

MyServerLLM = llm_module.MyServerLLM

# Always import INTERNALLLM so the class is available when the user toggles
# USE_INTERNAL on at runtime (the switch is checked at call time).
INTERNALLLM = None
try:
    from core.llm.configurations.INTERNAL_llm import INTERNALLLM
    print("INTERNALLLM imported successfully")
except ImportError as e:
    print(f"INTERNALLLM import failed: {e}. INTERNAL API will be unavailable.")
    INTERNALLLM = None

API_KEYS = [
    settings.API_KEY_1,
    settings.API_KEY_2,
    settings.API_KEY_3,
    settings.API_KEY_4,
    settings.API_KEY_5,
]

openai_client = AsyncOpenAI(api_key=settings.OPENAI_API)
DEFAULT_MAX_RETRIES = 8  # Total attempts across all LLMs when fallback chain is enabled
INTERNAL_ONLY_MAX_RETRIES = 12  # Attempts when INTERNAL_ONLY mode is on (no fallback chain)
MAX_RETRIES = DEFAULT_MAX_RETRIES  # back-compat alias

count = 0

# ── INTERNAL API rate limiting (3 calls per 60 seconds, shared across the process) ──
INTERNAL_RATE_LIMIT_CALLS = 3
INTERNAL_RATE_LIMIT_WINDOW = 60.0  # seconds
INTERNAL_502_WAIT_SECONDS = 60  # On 502 from INTERNAL, sleep this long then retry the same prompt
_internal_call_times: list[float] = []
_internal_lock = threading.Lock()


def _internal_rate_limit_acquire() -> bool:
    """Try to acquire an INTERNAL call slot. Returns True if allowed, False if rate-limited."""
    if not SWITCHES.get("RATE_LIMIT_INTERNAL", True):
        return True
    with _internal_lock:
        now = time.time()
        # Purge entries outside the window
        _internal_call_times[:] = [
            t for t in _internal_call_times if now - t < INTERNAL_RATE_LIMIT_WINDOW
        ]
        if len(_internal_call_times) >= INTERNAL_RATE_LIMIT_CALLS:
            return False
        _internal_call_times.append(now)
        return True


def _internal_config_complete() -> bool:
    """All required INTERNAL_* env values present?"""
    return bool(
        INTERNAL_BASE_URL
        and INTERNAL_CLIENT_KEY
        and INTERNAL_API_TOKEN
        and INTERNAL_MODEL_ID
    )


async def invoke_llm(
    gpu_model,
    response_schema,
    contents,
    port=11434,
    remove_thinking=False,
):
    """
    Unified structured LLM invocation with retries and fallbacks:
    - GPU server
    - Gemini API
    - OpenAI API
    Each returns parsed structured data using the same logic.
    """
    global count

    # Initialize the parser for structured output
    parser = PydanticOutputParser(pydantic_object=response_schema)

    prompt = f"""
    Extract structured data according to this model:
    {parser.get_format_instructions()}

    Input:
    {contents}
    """

    # INTERNAL_ONLY mode means: do NOT fall back to GPU/Gemini/OpenAI even if INTERNAL fails.
    # Requires USE_INTERNAL=true as well; ignored otherwise.
    internal_only = (
        SWITCHES.get("INTERNAL_ONLY", False) and SWITCHES.get("USE_INTERNAL", False)
    )
    max_retries = INTERNAL_ONLY_MAX_RETRIES if internal_only else DEFAULT_MAX_RETRIES

    # Sticky per-call flag: once INTERNAL has a non-recoverable failure, skip it for
    # the remaining attempts so we don't waste time/quota. Disabled in INTERNAL_ONLY
    # mode since there's nothing else to fall back to.
    skip_internal = False

    for attempt in range(1, max_retries + 1):
        print(f"\n=== Attempt {attempt}/{max_retries} ===")

        # === 0. INTERNAL API ===
        if SWITCHES.get("USE_INTERNAL", False) and not skip_internal:
            if INTERNALLLM is None:
                print("INTERNAL enabled but module unavailable.")
                if not internal_only:
                    skip_internal = True
            elif not _internal_config_complete():
                print(
                    "INTERNAL enabled but config incomplete "
                    "(need INTERNAL_BASE_URL, INTERNAL_CLIENT_KEY, INTERNAL_API_TOKEN, INTERNAL_MODEL_ID)."
                )
                if not internal_only:
                    skip_internal = True
            elif not _internal_rate_limit_acquire():
                # In INTERNAL_ONLY mode we wait for a slot instead of falling through
                # (since there's no GPU/Gemini/OpenAI to fall through to).
                wait_secs = (
                    INTERNAL_RATE_LIMIT_WINDOW / INTERNAL_RATE_LIMIT_CALLS
                    if internal_only
                    else 0
                )
                if internal_only:
                    print(
                        f"INTERNAL rate-limited; waiting {wait_secs:.0f}s for next slot..."
                    )
                    await asyncio.sleep(wait_secs)
                    continue
                else:
                    print(
                        f"INTERNAL rate-limited "
                        f"(>{INTERNAL_RATE_LIMIT_CALLS} calls in {INTERNAL_RATE_LIMIT_WINDOW:.0f}s); "
                        f"falling through to GPU/fallbacks."
                    )
            else:
                try:
                    print("Trying INTERNAL API...")
                    internal_llm = INTERNALLLM(
                        model=INTERNAL_MODEL_ID,
                        base_url=INTERNAL_BASE_URL,
                        client_key=INTERNAL_CLIENT_KEY,
                        api_token=INTERNAL_API_TOKEN,
                        user_email=INTERNAL_USER_EMAIL,
                    )
                    s = time.time()
                    llm_output = await asyncio.to_thread(internal_llm._call, prompt)
                    e = time.time()
                    print(f"Success via INTERNAL API, LLM call took {e - s:.2f}s")
                    structured = parser.parse(llm_output)
                    return structured
                except Exception as exc:
                    err_str = str(exc).lower()
                    print(f"INTERNAL API failed: {exc}")

                    # 502 → wait 60s and retry the same prompt (don't fall through this
                    # iteration, and don't sticky-skip — the upstream is just temporarily down).
                    is_502 = "502" in err_str or "bad gateway" in err_str
                    if is_502:
                        print(
                            f"Got 502 from INTERNAL — sleeping "
                            f"{INTERNAL_502_WAIT_SECONDS}s before retrying the same prompt..."
                        )
                        await asyncio.sleep(INTERNAL_502_WAIT_SECONDS)
                        continue  # skip GPU/Gemini/OpenAI fallbacks this iteration

                    # Non-502 network errors: sticky-skip INTERNAL for the rest of the
                    # call when we have a fallback chain to fall back to. In INTERNAL_ONLY
                    # mode we just keep retrying.
                    if not internal_only and any(
                        marker in err_str
                        for marker in (
                            "failed to call internal api",
                            "connection",
                            "timed out",
                            "timeout",
                            "max retries",
                        )
                    ):
                        print(
                            "Network-level INTERNAL error — skipping INTERNAL "
                            "for the remainder of this invoke_llm call."
                        )
                        skip_internal = True

        # In INTERNAL_ONLY mode, skip the fallback chain entirely and retry INTERNAL.
        if internal_only:
            await asyncio.sleep(5)
            continue

        # === 1. GPU SERVER ===
        if gpu_model:
            try:
                print("Trying GPU server...")
                gpu_llm = MyServerLLM(model=gpu_model, port=port)
                s = time.time()
                llm_output = await asyncio.to_thread(gpu_llm._call, prompt)
                e = time.time()
                print(f"Success via GPU server, LLM call took {e - s:.2f}s")
                structured = parser.parse(llm_output)
                return structured
            except Exception as e:
                print(f"GPU server failed failed at port {port}: {e}")

            if port == 11435:
                temp_port = 11434
                try:
                    print(f"Retrying GPU server on alternate port {temp_port}...")
                    gpu_llm = MyServerLLM(model=gpu_model, port=temp_port)
                    s = time.time()
                    llm_output = await asyncio.to_thread(gpu_llm._call, prompt)
                    e = time.time()
                    print(f"Success via GPU server, LLM call took {e - s:.2f}s")
                    structured = parser.parse(llm_output)
                    return structured
                except Exception as e:
                    print(f"GPU server failed at alternate port {temp_port}: {e}")

        # === 2. GEMINI FALLBACK ===
        if SWITCHES["FALLBACK_TO_GEMINI"]:
            print("Falling back to Gemini...")

            for _ in range(len(API_KEYS)):
                api_key = API_KEYS[count % len(API_KEYS)]
                count = (count + 1) % len(API_KEYS)
                client = genai.Client(api_key=api_key)
                s = time.time()
                try:
                    config = genai.types.GenerateContentConfig(
                        temperature=0.2,
                        max_output_tokens=200000,
                        response_mime_type="text/plain",
                        safety_settings=[],
                    )

                    if remove_thinking:
                        config.thinking_config = genai.types.ThinkingConfig(
                            thinking_budget=0
                        )

                    response = await asyncio.wait_for(
                        asyncio.to_thread(
                            client.models.generate_content,
                            model=FALLBACK_GEMINI_MODEL,
                            contents=prompt,
                            config=config,
                        ),
                        timeout=80,
                    )

                    # Try to extract the raw text content
                    raw_output = None
                    try:
                        raw_output = response.text or str(response)
                    except Exception:
                        raw_output = str(response)

                    structured = parser.parse(raw_output)
                    e = time.time()
                    print(f"Success via Gemini, LLM call took {e - s:.2f}s")
                    return structured

                except asyncio.TimeoutError:
                    print("Gemini timeout — switching key...")
                except Exception as e:
                    print(f"Gemini error: {e}")
                    await asyncio.sleep(0.2)

        # === 3. OPENAI FALLBACK ===
        if SWITCHES["FALLBACK_TO_OPENAI"]:
            try:
                print("Falling back to OpenAI...")
                s = time.time()
                response = await openai_client.chat.completions.create(
                    model=FALLBACK_OPENAI_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                )

                raw_output = response.choices[0].message.content
                structured = parser.parse(raw_output)
                e = time.time()
                print(f"Success via OpenAI, LLM call took {e - s:.2f}s")
                return structured

            except Exception as e:
                print(f"OpenAI fallback error: {e}")

        await asyncio.sleep(2)

    # If all attempts exhausted
    raise RuntimeError(f"All {max_retries} attempts failed.")
