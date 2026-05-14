"""Deep Research runner — 6-stage async pipeline with progressive socket updates."""

from __future__ import annotations

import asyncio
import json
import traceback
from datetime import datetime
from typing import List

from app.broadcast import update_message
from app.socket_handler import sio
from core.database import db
from core.constants import WORKLET_GENERATOR_LLM
from core.llm.client import invoke_llm
from core.llm.outputs import ReferenceKeywordResult
from core.models.worklet import Reference
from core.references.generate_references import generate_references
from core.parsers.process_files import process_files
from pipeline.tools.extract import extract_links
from pipeline.tools.search import search_tavily
from pipeline.graph_helpers import parallel_search

from deep_research.outputs import (
    AsIsSynthesisResult,
    ComparativeAnalysisResult,
    EntityExtractionResult,
    FutureDirectionsResult,
)
from deep_research.prompts import (
    entity_extraction_prompt,
    research_queries_prompt,
    as_is_synthesis_prompt,
    comparative_analysis_prompt,
    future_directions_prompt,
    ResearchQueryResult,
)
from deep_research.state import DeepResearchInput, DeepResearchResult


async def _emit(research_id: str, event: str, data: dict):
    """Emit a socket event scoped to a research session."""
    try:
        await sio.emit(f"{research_id}/{event}", data)
    except Exception:
        pass


async def _update_status(research_id: str, message: str):
    """Send progress status via both broadcast and direct socket emit."""
    await _emit(research_id, "research_update", {"message": message})


async def _save_result(result: DeepResearchResult):
    """Persist the current result to MongoDB."""
    doc = result.model_dump()
    db.deep_research.update_one(
        {"research_id": result.research_id},
        {"$set": doc},
        upsert=True,
    )


def _truncate(text: str, max_chars: int = 30000) -> str:
    """Truncate text to avoid exceeding token limits."""
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    return text[:half] + "\n...[truncated]...\n" + text[-half:]


async def run_deep_research(input: DeepResearchInput) -> DeepResearchResult:
    """
    6-stage async research pipeline:
      1. Process input (files + links)
      2. Entity extraction (LLM)
      3. Multi-query web search + reference gathering
      4. As-Is synthesis (LLM)
      5. Comparative analysis (LLM)
      6. Future directions (LLM)

    Each non-critical stage (search, references) is wrapped in try/except
    so failures degrade gracefully rather than crashing the pipeline.
    """
    result = DeepResearchResult(
        research_id=input.research_id,
        prompt=input.prompt,
        created_at=datetime.utcnow(),
        thread_id=input.thread_id,
        worklet_id=input.worklet_id,
        status="running",
    )
    await _save_result(result)

    llm_model = WORKLET_GENERATOR_LLM.model
    llm_port = WORKLET_GENERATOR_LLM.port

    try:
        # ── Stage 1: Process Input ──────────────────────────────────────
        await _update_status(input.research_id, "Processing input...")

        context_parts: list[str] = [input.prompt]

        # Process pre-saved files (already on disk — saved in the route handler)
        if input.saved_files:
            try:
                await _update_status(input.research_id, "Parsing uploaded files...")
                research_thread_id = f"research_{input.research_id}"
                files_data = [
                    {"title": sf.title, "file_name": sf.file_name, "path": sf.path}
                    for sf in input.saved_files
                ]
                parsed = await process_files(files_data, research_thread_id)
                for doc in parsed.documents:
                    context_parts.append(
                        f"--- File: {doc.file_name} ---\n{doc.full_text}"
                    )
            except Exception:
                print(f"[Deep Research] File processing failed, continuing without files")
                traceback.print_exc()

        # Extract link content
        if input.links and len(input.links) > 0:
            try:
                await _update_status(input.research_id, "Extracting content from links...")
                links_data = await extract_links(input.links)
                if links_data:
                    for item in links_data:
                        content = item.get("content", "") or item.get("raw_content", "")
                        title = item.get("title", "Link")
                        context_parts.append(f"--- Link: {title} ---\n{content}")
            except Exception:
                print(f"[Deep Research] Link extraction failed, continuing without links")
                traceback.print_exc()

        full_context = _truncate("\n\n".join(context_parts))

        # ── Stage 2: Entity Extraction ──────────────────────────────────
        await _update_status(input.research_id, "Extracting entities...")

        entities: EntityExtractionResult = await invoke_llm(
            gpu_model=llm_model,
            response_schema=EntityExtractionResult,
            contents=entity_extraction_prompt(full_context),
            port=llm_port,
        )
        result.entities = entities
        await _save_result(result)
        await _emit(
            input.research_id,
            "section_ready",
            {"section": "entities", "data": entities.model_dump()},
        )

        # ── Stage 3: Multi-Query Web Search ─────────────────────────────
        await _update_status(input.research_id, "Generating research queries...")

        search_results: list = []
        unique_refs: list[Reference] = []

        try:
            query_result: ResearchQueryResult = await invoke_llm(
                gpu_model=llm_model,
                response_schema=ResearchQueryResult,
                contents=research_queries_prompt(full_context, entities.model_dump()),
                port=llm_port,
            )
            queries = query_result.queries[:15]  # cap at 15

            await _update_status(
                input.research_id,
                f"Searching the web ({len(queries)} queries)...",
            )
            try:
                search_results = await asyncio.wait_for(
                    parallel_search(queries), timeout=60
                )
            except (asyncio.TimeoutError, Exception) as e:
                print(f"[Deep Research] Web search failed ({e}), continuing with empty results")
                traceback.print_exc()
        except Exception:
            print(f"[Deep Research] Query generation failed, skipping web search")
            traceback.print_exc()

        # Also gather academic references using entity-derived keywords
        await _update_status(input.research_id, "Searching academic & patent databases...")

        ref_keywords = _build_reference_keywords(entities)
        all_references: list[Reference] = []
        for kw in ref_keywords:
            try:
                # Backstop timeout — generate_references has its own per-source 25s timeouts,
                # so this only fires if all three sources hang together.
                refs = await asyncio.wait_for(
                    generate_references(kw), timeout=90
                )
                all_references.extend(refs)
                print(
                    f"[Deep Research] {len(refs)} refs for: {kw.google_scholar_keyword}"
                )
            except (asyncio.TimeoutError, Exception):
                print(f"[Deep Research] Reference search timed out/failed for: {kw.google_scholar_keyword}")


        # Deduplicate references
        seen_urls: set[str] = set()
        for ref in all_references:
            url_key = ref.link.lower().rstrip("/")
            if url_key not in seen_urls:
                seen_urls.add(url_key)
                unique_refs.append(ref)

        result.references = unique_refs
        await _save_result(result)

        # Prepare data for LLM (truncate to fit context)
        search_str = _truncate(json.dumps(search_results, default=str), 20000)
        refs_str = _truncate(
            json.dumps([r.model_dump() for r in unique_refs], default=str), 10000
        )
        entities_str = json.dumps(entities.model_dump(), default=str)

        # ── Stage 4: As-Is Synthesis ────────────────────────────────────
        await _update_status(input.research_id, "Synthesizing current state of the art...")

        as_is: AsIsSynthesisResult = await invoke_llm(
            gpu_model=llm_model,
            response_schema=AsIsSynthesisResult,
            contents=as_is_synthesis_prompt(
                _truncate(full_context, 10000),
                search_str,
                refs_str,
                entities_str,
            ),
            port=llm_port,
        )
        result.as_is = as_is
        await _save_result(result)
        await _emit(
            input.research_id,
            "section_ready",
            {"section": "as_is", "data": as_is.model_dump()},
        )

        # ── Stage 5: Comparative Analysis ───────────────────────────────
        await _update_status(input.research_id, "Performing comparative analysis...")

        comparative: ComparativeAnalysisResult = await invoke_llm(
            gpu_model=llm_model,
            response_schema=ComparativeAnalysisResult,
            contents=comparative_analysis_prompt(
                _truncate(full_context, 8000),
                search_str,
                refs_str,
                entities_str,
                json.dumps(as_is.model_dump(), default=str),
            ),
            port=llm_port,
        )
        result.comparative = comparative
        await _save_result(result)
        await _emit(
            input.research_id,
            "section_ready",
            {"section": "comparative", "data": comparative.model_dump()},
        )

        # ── Stage 6: Future Directions ──────────────────────────────────
        await _update_status(input.research_id, "Generating future problem statements...")

        future: FutureDirectionsResult = await invoke_llm(
            gpu_model=llm_model,
            response_schema=FutureDirectionsResult,
            contents=future_directions_prompt(
                _truncate(full_context, 8000),
                entities_str,
                as_is.model_dump(),
                comparative.model_dump(),
                references=[r.model_dump() for r in unique_refs[:25]],
            ),
            port=llm_port,
        )
        result.future = future
        result.status = "completed"
        await _save_result(result)
        await _emit(
            input.research_id,
            "section_ready",
            {"section": "future", "data": future.model_dump()},
        )

        # ── Done ────────────────────────────────────────────────────────
        await _emit(
            input.research_id,
            "research_complete",
            {"research_id": input.research_id},
        )
        print(f"Deep research {input.research_id} completed successfully.")
        return result

    except Exception as e:
        traceback.print_exc()
        result.status = "failed"
        await _save_result(result)
        await _emit(
            input.research_id,
            "research_failed",
            {"error": str(e)},
        )
        print(f"Deep research {input.research_id} failed: {e}")
        return result


def _build_reference_keywords(
    entities: EntityExtractionResult,
) -> list[ReferenceKeywordResult]:
    """Build reference search keywords from extracted entities."""
    keywords_list: list[ReferenceKeywordResult] = []

    # Build from research areas (primary)
    for area in entities.research_areas[:3]:
        keywords_list.append(
            ReferenceKeywordResult(
                google_scholar_keyword=area,
                github_keyword=area,
                patent_keyword=area,
            )
        )

    # Build entity-specific queries for people + companies
    notable = entities.people[:2] + entities.companies[:2]
    for entity_name in notable:
        topic = entities.research_areas[0] if entities.research_areas else ""
        keywords_list.append(
            ReferenceKeywordResult(
                google_scholar_keyword=f"{entity_name} {topic}",
                github_keyword=f"{entity_name} {topic}",
                patent_keyword=f"{entity_name} {topic}",
            )
        )

    return keywords_list
