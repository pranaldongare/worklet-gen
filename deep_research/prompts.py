"""Prompts for the Deep Research pipeline.

Each function returns a list of role/parts dicts compatible with invoke_llm().
"""

from __future__ import annotations

from typing import List


def entity_extraction_prompt(context: str) -> list[dict]:
    """Extract entities (technologies, people, companies, institutions, research areas) from context."""

    contents = []

    contents.append(
        {
            "role": "system",
            "parts": (
                "You are an expert **Research Analyst** specializing in technology landscape analysis.\n\n"
                "Your task is to carefully analyze the provided context and extract all notable entities "
                "that are relevant for conducting deep research on the topic.\n\n"
                "Extract the following categories:\n"
                "1. **Technologies** — Specific technologies, frameworks, algorithms, protocols, models mentioned or implied.\n"
                "2. **People** — Researchers, inventors, authors, key individuals mentioned by name.\n"
                "3. **Companies** — Companies, organizations, startups, corporations mentioned or implied.\n"
                "4. **Institutions** — Universities, research labs, government agencies, standards bodies.\n"
                "5. **Research Areas** — Specific sub-domains and focused research topics. Each entry MUST be a "
                "concrete, search-engine-friendly phrase that would surface targeted patents and papers — NOT an "
                "umbrella discipline.\n\n"
                "### Research Areas — Specificity Rules (CRITICAL)\n"
                "- Each research_area MUST be specific enough that a Google Patents search would return relevant patents.\n"
                "- AVOID umbrella terms (too generic, low patent recall):\n"
                "    BAD: 'Networking', 'Machine Learning', 'Computer Vision', 'Wireless', 'Security', 'AI', 'Edge Computing'\n"
                "- PREFER specific sub-domain phrases (3-7 words, with a method or constraint):\n"
                "    GOOD: 'QUIC congestion control under bufferbloat'\n"
                "    GOOD: 'low-bitrate neural speech codec'\n"
                "    GOOD: 'energy-aware 5G beamforming for IoT'\n"
                "    GOOD: 'on-device LLM KV-cache compression'\n"
                "    GOOD: 'BGP route leak detection at scale'\n"
                "- Each entry should pair a TECHNIQUE/METHOD with a CONSTRAINT or PROBLEM aspect, drawn from the context.\n"
                "- If the context mentions a broad area, narrow it using cues from the surrounding text "
                "(workload, hardware, scale, regulatory constraint, performance metric).\n"
                "- Generate 4-8 research_areas; quality over quantity.\n\n"
                "Rules:\n"
                "- Be thorough on technologies/people/companies — extract ALL mentioned, even if only briefly referenced.\n"
                "- For research_areas, infer specific sub-domains strongly implied by the context (do not stay generic).\n"
                "- Deduplicate entries within each category.\n"
                "- If a category has no entries, return an empty list.\n"
                "- Return ONLY valid JSON, no commentary."
            ),
        }
    )

    contents.append(
        {
            "role": "system",
            "parts": f"### Context to Analyze\n\n{context}",
        }
    )

    contents.append(
        {
            "role": "user",
            "parts": (
                "Extract all entities from the context above. "
                "Return the result in the exact JSON format specified."
            ),
        }
    )

    return contents


def research_queries_prompt(
    context: str,
    entities: dict,
) -> list[dict]:
    """Generate targeted web search queries for deep research."""

    contents = []

    contents.append(
        {
            "role": "system",
            "parts": (
                "You are an expert **Research Query Planner**.\n\n"
                "Given a research context and extracted entities, generate a comprehensive set of "
                "web search queries that will help build a complete picture of the current state of "
                "the art, latest developments, and future directions.\n\n"
                "Generate queries in these categories:\n"
                "1. **State of the Art** — Queries to find the latest research, benchmarks, and SOTA results.\n"
                "2. **Entity-specific** — For each notable person, company, or institution mentioned, "
                "generate a query about their latest work in the relevant domain.\n"
                "3. **Comparative** — Queries to find competing approaches, alternative solutions, "
                "and open-source implementations.\n"
                "4. **Future directions** — Queries about open problems, challenges, and emerging trends.\n\n"
                "Rules:\n"
                "- Generate 8-15 queries total.\n"
                "- Each query should be specific and likely to yield high-quality results.\n"
                "- Include year indicators (e.g., '2025', 'latest', 'recent') where appropriate.\n"
                "- Avoid overlapping queries.\n"
                "- Return ONLY valid JSON, no commentary."
            ),
        }
    )

    contents.append(
        {
            "role": "system",
            "parts": (
                f"### Research Context\n{context}\n\n"
                f"### Extracted Entities\n{entities}"
            ),
        }
    )

    contents.append(
        {
            "role": "user",
            "parts": (
                "Generate targeted search queries to conduct deep research on this topic. "
                "Return the result in the exact JSON format specified."
            ),
        }
    )

    return contents


def as_is_synthesis_prompt(
    context: str,
    search_results: list,
    references: list,
    entities: dict,
) -> list[dict]:
    """Synthesize the current state of the art from all gathered information."""

    contents = []

    contents.append(
        {
            "role": "system",
            "parts": (
                "You are an expert **Research Synthesizer** producing a COMPARATIVE analysis "
                "of the current state of the art for a given research topic.\n\n"
                "Your job is NOT to write a long descriptive narrative. Your job is to produce a "
                "STRUCTURED HEAD-TO-HEAD COMPARISON of the leading approaches so a reader can rank "
                "them at a glance.\n\n"
                "Using the provided context, web search results, academic/patent references, and "
                "extracted entities, produce:\n\n"
                "1. **Summary** — A SHORT 100-150 word lead-in that frames the comparison. NOT a long "
                "descriptive overview. State the dominant axes of competition (e.g., 'Approaches differ "
                "primarily on X vs Y') and what the comparison table below reveals.\n\n"
                "2. **SOTA Comparison (PRIMARY ARTIFACT)** — Build a side-by-side comparison table of "
                "4-8 leading approaches. For EACH approach include:\n"
                "   - approach: Name (e.g., 'BBRv3', 'Cubic+', 'Vegas-EW')\n"
                "   - actor: Who built it (company / institution / author)\n"
                "   - key_metric: Pick ONE primary metric used across the field (e.g., 'p95 latency', "
                "'throughput at 10% loss', 'mAP@0.5'). USE THE SAME metric across rows where possible "
                "so the rows can be ranked head-to-head.\n"
                "   - current_best: The reported value WITH UNITS (e.g., '142ms', '78.4%', '12.3 Mbps'). "
                "If the source doesn't give a number, use a qualitative rank like 'best/good/poor' and "
                "mark it as such.\n"
                "   - strengths_one_line: ONE sentence on what this approach is best at.\n"
                "   - limitations_one_line: ONE sentence on where it falls short relative to peers.\n"
                "   - source: URL or paper title backing the metric.\n"
                "   - year: Year of the result.\n"
                "   IMPORTANT: This must read like a comparison table, not a list of summaries. Use "
                "consistent metric units. Pick approaches that are genuinely COMPETITIVE on the same problem.\n\n"
                "3. **Key Findings** — 5-10 specific findings with their sources (URL or paper title) "
                "and year. Focus on concrete results, benchmarks, and achievements.\n\n"
                "4. **Timeline** — 5-10 chronological milestones that shaped this field. "
                "Include year, what happened, and who did it.\n\n"
                "5. **Key Players** — 5-10 key individuals, companies, or institutions and their "
                "specific contributions. Include links where available.\n\n"
                "Rules:\n"
                "- Base your analysis on the ACTUAL search results and references provided — do not fabricate sources.\n"
                "- If a finding comes from search results, cite the source URL.\n"
                "- If a finding comes from references, cite the paper/repo title.\n"
                "- Be specific about numbers, benchmarks, and dates.\n"
                "- For sota_comparison: prefer competitors on the SAME metric — that is the whole point.\n"
                "- Return ONLY valid JSON, no commentary."
            ),
        }
    )

    contents.append(
        {
            "role": "system",
            "parts": (
                f"### Original Research Context\n{context}\n\n"
                f"### Extracted Entities\n{entities}\n\n"
                f"### Web Search Results\n{search_results}\n\n"
                f"### Academic & Patent References\n{references}"
            ),
        }
    )

    contents.append(
        {
            "role": "user",
            "parts": (
                "Synthesize all the information above into a comprehensive As-Is analysis "
                "of the current state of the art. "
                "Return the result in the exact JSON format specified."
            ),
        }
    )

    return contents


def comparative_analysis_prompt(
    context: str,
    search_results: list,
    references: list,
    entities: dict,
    as_is: dict,
) -> list[dict]:
    """Generate comparative analysis of different approaches and players."""

    contents = []

    contents.append(
        {
            "role": "system",
            "parts": (
                "You are an expert **Technology Analyst** conducting a comparative analysis.\n\n"
                "Using the provided research context, search results, references, and the As-Is synthesis, "
                "produce:\n\n"
                "1. **Comparisons** — Compare 3-6 key approaches, solutions, or entities side-by-side. "
                "For each: identify the entity, describe their approach, list strengths, and list limitations.\n\n"
                "2. **Open Source Landscape** — List 3-8 relevant open-source projects with name, URL, "
                "description, stars (if known), and last update date (if known). "
                "Focus on actively maintained, production-relevant projects.\n\n"
                "3. **Gaps** — Identify 3-6 specific gaps in current research and implementations. "
                "These should be concrete, actionable observations about what's missing or underexplored.\n\n"
                "Rules:\n"
                "- Base comparisons on ACTUAL information from search results and references.\n"
                "- Be objective — present both strengths and limitations fairly.\n"
                "- For open source projects, only include real projects from search results or references.\n"
                "- Gaps should be specific enough to inspire new research directions.\n"
                "- Return ONLY valid JSON, no commentary."
            ),
        }
    )

    contents.append(
        {
            "role": "system",
            "parts": (
                f"### Original Research Context\n{context}\n\n"
                f"### Extracted Entities\n{entities}\n\n"
                f"### As-Is Synthesis\n{as_is}\n\n"
                f"### Web Search Results\n{search_results}\n\n"
                f"### Academic & Patent References\n{references}"
            ),
        }
    )

    contents.append(
        {
            "role": "user",
            "parts": (
                "Conduct a detailed comparative analysis based on all the information above. "
                "Return the result in the exact JSON format specified."
            ),
        }
    )

    return contents


def future_directions_prompt(
    context: str,
    entities: dict,
    as_is: dict,
    comparative: dict,
) -> list[dict]:
    """Generate forward-looking problem statements and research directions."""

    contents = []

    contents.append(
        {
            "role": "system",
            "parts": (
                "You are a **Visionary Research Strategist** identifying the most promising future "
                "directions and generating forward-looking problem statements that are TIGHTLY GROUNDED "
                "in the entities and gaps identified earlier in the pipeline.\n\n"
                "Based on the current state of the art (As-Is synthesis), comparative analysis, "
                "and identified gaps, produce:\n\n"
                "1. **Problem Statements** — 3-5 concrete, forward-looking problem statements. Each MUST sit "
                "at the intersection of specific technologies AND specific research areas drawn from the "
                "provided entities. For each:\n"
                "   - **Title**: Clear, concise problem title that names the core technology or method.\n"
                "   - **Description**: 50-100 words. MUST explicitly reference at least one technology and "
                "one research area BY NAME from the entities list. Do not stay abstract.\n"
                "   - **Rationale**: Why this problem matters NOW. Cite a specific gap or limitation from "
                "the comparative analysis.\n"
                "   - **Potential Impact**: What solving this would enable for the field.\n"
                "   - **core_technologies**: List of 1-3 technologies from entities.technologies that this "
                "problem builds on. MUST be drawn from the provided entities — DO NOT INVENT NEW ONES.\n"
                "   - **research_areas**: List of 1-3 research areas from entities.research_areas. "
                "MUST be drawn from the provided entities — DO NOT INVENT NEW ONES.\n\n"
                "2. **Opportunities** — 3-5 high-level opportunity areas that emerge from the analysis.\n\n"
                "3. **Research Questions** — 5-8 specific, open-ended research questions. Each MUST be "
                "a structured object with:\n"
                "   - **question**: The research question itself, phrased as a clear question.\n"
                "   - **expected_gain**: If solved, what concrete improvement is expected? Quantify where "
                "possible (e.g., 'reduce p99 latency by 30-40%', 'enable on-device inference under 50MB', "
                "'cut training compute by 5×'). Avoid vague phrases like 'better performance'.\n"
                "   - **success_criteria**: A measurable signal or experiment that confirms a positive "
                "answer (e.g., 'beat BBRv2 on tail latency on the Pantheon testbed').\n\n"
                "Rules:\n"
                "- Problem statements must be NOVEL — they should go BEYOND what's already been done.\n"
                "- Ground each problem in the actual gaps and limitations identified.\n"
                "- core_technologies and research_areas on each problem MUST be exact strings from the "
                "provided entities lists. Do not paraphrase or invent.\n"
                "- Research questions should be specific enough to guide a 6-month research project.\n"
                "- expected_gain should be quantitative where the data permits, qualitative otherwise.\n"
                "- Focus on problems that have both academic value and practical applicability.\n"
                "- Prefer problems at the intersection of identified research areas.\n"
                "- Return ONLY valid JSON, no commentary."
            ),
        }
    )

    contents.append(
        {
            "role": "system",
            "parts": (
                f"### Original Research Context\n{context}\n\n"
                f"### Extracted Entities\n{entities}\n\n"
                f"### Current State of the Art\n{as_is}\n\n"
                f"### Comparative Analysis & Gaps\n{comparative}"
            ),
        }
    )

    contents.append(
        {
            "role": "user",
            "parts": (
                "Based on all the analysis above, generate forward-looking problem statements, "
                "opportunities, and research questions that push this field forward. "
                "Return the result in the exact JSON format specified."
            ),
        }
    )

    return contents


def detailed_problem_statement_prompt(
    selected_problem: dict,
    research_context: dict,
) -> list[dict]:
    """Generate a comprehensive, research-proposal-quality detailed problem statement.

    Args:
        selected_problem: The FutureProblem dict (title, description, rationale, potential_impact).
        research_context: Full research MongoDB document with entities, as_is, comparative, future, references.
    """
    import json

    contents = []

    contents.append(
        {
            "role": "system",
            "parts": (
                "You are an expert **Research Proposal Architect** with deep expertise in translating "
                "research landscape analyses into comprehensive, fundable problem statements suitable "
                "for academic grant applications and industry-academia collaboration proposals.\n\n"
                "Your task is to generate a DETAILED, RESEARCH-PROPOSAL-QUALITY problem statement "
                "document for the selected problem. This is NOT a quick summary — it is a thorough, "
                "academically rigorous document that could serve as the basis for a grant proposal "
                "or industry research engagement.\n\n"
                "The document must:\n"
                "- Be grounded in the actual research data provided (entities, SOTA analysis, comparisons, gaps)\n"
                "- Cite specific findings, benchmarks, and gaps from the research context\n"
                "- Define KPIs with explicit SOTA baselines drawn from the provided analysis\n"
                "- Propose a concrete methodology, not just a problem description\n"
                "- Be precise enough that a research team could begin work from this document alone\n"
                "- Include structured risk assessment with specific mitigation strategies\n"
                "- Provide a realistic budget breakdown and timeline\n\n"
                "IMPORTANT: Do NOT fabricate references or benchmarks. Use ONLY information present "
                "in the provided research context. If specific numbers are not available, state the "
                "general direction with qualitative reasoning."
            ),
        }
    )

    # Build context injection
    entities = research_context.get("entities", {})
    as_is = research_context.get("as_is", {})
    comparative = research_context.get("comparative", {})
    future = research_context.get("future", {})
    references = research_context.get("references", [])

    # Format key findings
    findings_text = ""
    for f in as_is.get("key_findings", [])[:10]:
        finding = f.get("finding", "")
        source = f.get("source", "")
        year = f.get("year", "")
        year_str = f" ({year})" if year else ""
        findings_text += f"- {finding}{year_str} — Source: {source}\n"

    # Format gaps
    gaps_text = "\n".join(f"- {g}" for g in comparative.get("gaps", []))

    # Format comparison limitations
    comp_text = ""
    for c in comparative.get("comparisons", [])[:6]:
        entity = c.get("entity", "")
        approach = c.get("approach", "")
        limitations = ", ".join(c.get("limitations", []))
        comp_text += f"- {entity}: {approach} | Limitations: {limitations}\n"

    # Format references (top 10)
    refs_text = ""
    for ref in references[:10]:
        if isinstance(ref, dict):
            title = ref.get("title", "")
            link = ref.get("link", "")
            refs_text += f"- {title} — {link}\n" if link else f"- {title}\n"

    contents.append(
        {
            "role": "system",
            "parts": (
                f"### Selected Problem Statement\n"
                f"Title: {selected_problem.get('title', '')}\n"
                f"Description: {selected_problem.get('description', '')}\n"
                f"Rationale: {selected_problem.get('rationale', '')}\n"
                f"Potential Impact: {selected_problem.get('potential_impact', '')}\n\n"
                f"### Original Research Prompt\n"
                f"{research_context.get('prompt', '')}\n\n"
                f"### Entities Identified\n"
                f"Technologies: {json.dumps(entities.get('technologies', []))}\n"
                f"People: {json.dumps(entities.get('people', []))}\n"
                f"Companies: {json.dumps(entities.get('companies', []))}\n"
                f"Institutions: {json.dumps(entities.get('institutions', []))}\n"
                f"Research Areas: {json.dumps(entities.get('research_areas', []))}\n\n"
                f"### Current State of the Art (Summary)\n"
                f"{as_is.get('summary', 'Not available')}\n\n"
                f"### Key Findings with Sources\n"
                f"{findings_text or 'None available'}\n\n"
                f"### Identified Gaps\n"
                f"{gaps_text or 'None identified'}\n\n"
                f"### Existing Approaches and Limitations\n"
                f"{comp_text or 'None available'}\n\n"
                f"### Relevant References\n"
                f"{refs_text or 'None available'}"
            ),
        }
    )

    contents.append(
        {
            "role": "system",
            "parts": (
                "### Output Requirements\n\n"
                "Generate ALL of the following fields:\n\n"
                "- **title**: The problem statement title (refined from the selected problem).\n"
                "- **executive_summary**: 150-200 words. Readable by a non-specialist. Covers the problem, "
                "approach, and expected impact in concise prose.\n"
                "- **background_and_motivation**: 300-400 words. Must reference specific findings from the "
                "research context. Explain the evolution of this problem space, why existing solutions fall "
                "short, and what motivates a new approach.\n"
                "- **problem_definition**: Precise technical formulation. Use formal notation where helpful. "
                "Define inputs, outputs, constraints, and success criteria.\n"
                "- **current_sota**: Synthesize what is currently known about THIS specific problem from the "
                "provided data. Include concrete benchmark numbers where available. Explain the gap between "
                "SOTA and what's needed.\n"
                "- **proposed_approach**: Novel methodology that directly addresses the identified gaps. Not "
                "a restatement of existing work. Describe the key technical innovation.\n"
                "- **challenge_use_case**: At least 2 concrete challenges and representative use cases.\n"
                "- **deliverables**: Array of 5-8 specific outputs (prototypes, papers, datasets, patents, etc.). "
                "Include target venues for publications.\n"
                "- **kpis**: Minimum 6 KPIs. Each MUST follow this exact format: "
                "'Name: <metric>; Measure: <what it measures>; Target: <value>; "
                "SOTA baseline: <current best with source>; Reasoning: <why this target is achievable>'.\n"
                "- **prerequisites**: 5-8 required items (knowledge, datasets, tools, access).\n"
                "- **infrastructure_requirements**: Hardware, cloud, compute requirements.\n"
                "- **tech_stack**: Languages, frameworks, libraries, APIs.\n"
                "- **milestones**: Exactly {M2, M4, M6} keys. Each milestone must have a concrete, "
                "measurable checkpoint.\n"
                "- **risk_assessment**: 3-5 structured risk items. Each must be an object with "
                "'risk', 'impact', and 'mitigation' string fields.\n"
                "- **budget_estimation**: Dict with budget categories as keys and estimated amounts/descriptions "
                "as values (e.g., personnel, compute, tools, travel, dissemination).\n"
                "- **key_references**: Select 5-10 references from the provided context that are most "
                "relevant to THIS specific problem. Format: 'Title — URL'.\n\n"
                "Return ONLY valid JSON following the schema. No markdown, no commentary, no extra keys."
            ),
        }
    )

    contents.append(
        {
            "role": "user",
            "parts": (
                "Generate a comprehensive, research-proposal-quality detailed problem statement "
                "for the selected problem above. Leverage all provided research context to produce "
                "a document that is specific, grounded, and actionable."
            ),
        }
    )

    return contents


from typing import List as _List
from pydantic import BaseModel as _BaseModel, Field as _Field


class ResearchQueryResult(_BaseModel):
    """Output schema for research query generation."""

    queries: _List[str] = _Field(
        ..., description="8-15 targeted search queries for deep research"
    )
