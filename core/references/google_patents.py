from core.models.worklet import Reference
from pipeline.tools.search import search_tavily as search_tool


def get_patent_references(keyword: str, max_results: int = 5) -> list[Reference]:
    """Search Google Patents using Tavily with site restriction."""
    import asyncio

    results: list[Reference] = []
    try:
        query = f"site:patents.google.com {keyword}"

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                tool_results = pool.submit(
                    asyncio.run,
                    search_tool(
                        query=query,
                        max_results=max_results,
                        depth="advanced",
                        include_answer=False,
                        include_favicon=False,
                    ),
                ).result()
        else:
            tool_results = asyncio.run(
                search_tool(
                    query=query,
                    max_results=max_results,
                    depth="advanced",
                    include_answer=False,
                    include_favicon=False,
                )
            )

        for r in tool_results.get("results", []):
            title = r.get("title", "")
            link = r.get("url", "")
            desc = r.get("content", "")
            results.append(
                Reference(
                    title=title,
                    link=link,
                    description=desc,
                    tag="patent",
                )
            )
    except Exception as e:
        print(f"Patent search error: {e}")

    return results
