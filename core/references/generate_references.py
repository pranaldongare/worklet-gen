import asyncio
import math
import re
import datetime
from time import time

from core.models.worklet import Reference
from pipeline.tools.search import search_tavily as search_tool
from core.references.github import get_github_references
from core.references.google_scholar import get_google_scholar_references
from core.references.google_patents import get_patent_references
from core.llm.outputs import ReferenceKeywordResult


def _deduplicate_references(refs: list[Reference]) -> list[Reference]:
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    unique: list[Reference] = []
    for ref in refs:
        url = ref.link.lower().rstrip("/")
        title = ref.title.lower().strip()
        if url in seen_urls or title in seen_titles:
            continue
        seen_urls.add(url)
        seen_titles.add(title)
        unique.append(ref)
    return unique


def _compute_quality_scores(refs: list[Reference]) -> list[Reference]:
    current_year = datetime.datetime.now().year
    for ref in refs:
        score = 0.2
        if ref.citation_count and ref.citation_count > 0:
            score += min(math.log10(ref.citation_count + 1) / 4.0, 0.5)
        if ref.published_year:
            age = current_year - ref.published_year
            score += max(0, 1.0 - age / 20.0) * 0.3
        ref.quality_score = round(min(score, 1.0), 2)
    return refs


async def _safe_fetch(coro_or_future, source_name: str, timeout: float = 25.0) -> list[Reference]:
    """Wrap a reference-source future so a slow/failing source returns [] instead of sinking the batch."""
    try:
        return await asyncio.wait_for(coro_or_future, timeout=timeout)
    except asyncio.TimeoutError:
        print(f"[references] {source_name} timed out after {timeout}s")
        return []
    except Exception as e:
        print(f"[references] {source_name} failed: {e}")
        return []


async def generate_references(keywords: ReferenceKeywordResult) -> list[Reference]:
    loop = asyncio.get_running_loop()

    github_future = loop.run_in_executor(None, get_github_references, keywords.github_keyword)
    scholar_future = loop.run_in_executor(
        None, get_google_scholar_references, keywords.google_scholar_keyword
    )
    patent_keyword = keywords.patent_keyword or keywords.google_scholar_keyword
    patent_future = loop.run_in_executor(None, get_patent_references, patent_keyword)

    githubReferences, googleScholarReferences, patentReferences = await asyncio.gather(
        _safe_fetch(github_future, "github"),
        _safe_fetch(scholar_future, "scholar"),
        _safe_fetch(patent_future, "patents"),
    )

    webReferences: list[Reference] = []
    if len(googleScholarReferences) == 0:
        try:
            tool_results = await asyncio.wait_for(
                search_tool(
                    query=keywords.google_scholar_keyword,
                    max_results=10,
                    depth="advanced",
                    include_answer=False,
                    include_favicon=False,
                ),
                timeout=25.0,
            )
            for r in tool_results.get("results", []):
                webReferences.append(
                    Reference(
                        title=r.get("title", ""),
                        link=r.get("url", ""),
                        description=r.get("content", ""),
                        tag="google",
                    )
                )
        except asyncio.TimeoutError:
            print("[references] web fallback timed out")
        except Exception as e:
            print(f"[references] web fallback failed: {e}")

    response: list[Reference] = []
    response.extend(googleScholarReferences)
    response.extend(githubReferences)
    response.extend(patentReferences)
    response.extend(webReferences)

    response = _deduplicate_references(response)
    response = _compute_quality_scores(response)

    return response
