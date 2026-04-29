from dotenv import load_dotenv
from tavily import TavilyClient
from ddgs import DDGS
import os
import asyncio
import time

load_dotenv()
tavily_api_key = os.getenv("TAVILY_API_KEY")

# Initialize Tavily client
client = TavilyClient(api_key=tavily_api_key)


async def search_ddgs(query: str, max_results: int = 4) -> dict:
    """Fallback web search using DuckDuckGo (no API key required)."""
    try:
        def _search():
            raw = DDGS().text(query, max_results=max_results)
            results = []
            for r in raw:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", r.get("link", "")),
                    "content": r.get("body", r.get("snippet", "")),
                })
            return {
                "query": query,
                "answer": None,
                "results": results,
            }
        return await asyncio.to_thread(_search)
    except Exception as e:
        print(f"DDGS search failed for '{query}': {e}")
        return {}


async def search_tavily(query: str, max_results: int = 4, depth: str = "advanced", include_answer: bool = True, include_favicon: bool = True):
    """
    Perform an asynchronous web search using Tavily API with retry logic.
    Falls back to DuckDuckGo (DDGS) if Tavily fails after 3 attempts.

    Returns:
        dict: Search results, or empty dict on failure.
    """
    attempts = 0
    while attempts < 3:
        try:
            return await asyncio.to_thread(
                client.search,
                query=query,
                include_answer="advanced" if include_answer else None,
                search_depth=depth,
                max_results=max_results,
                include_favicon=True if include_favicon else False,
            )
        except Exception as e:
            attempts += 1
            print(f"Tavily search attempt {attempts} failed: {e}")
            if attempts >= 3:
                break
            await asyncio.sleep(1)

    # Fallback to DDGS
    print(f"Tavily exhausted, falling back to DDGS for: {query}")
    return await search_ddgs(query, max_results=max_results)
