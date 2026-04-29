from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class EntityExtractionResult(BaseModel):
    technologies: List[str] = Field(
        ..., description="Key technologies, frameworks, algorithms mentioned"
    )
    people: List[str] = Field(
        ..., description="Researchers, inventors, key individuals"
    )
    companies: List[str] = Field(
        ..., description="Companies, organizations, startups"
    )
    institutions: List[str] = Field(
        ..., description="Universities, research labs, government bodies"
    )
    research_areas: List[str] = Field(
        ..., description="Core research domains and topics"
    )


class KeyFinding(BaseModel):
    finding: str = Field(..., description="A specific finding or result")
    source: str = Field(..., description="URL or paper title where this was found")
    year: Optional[int] = Field(None, description="Year of the finding")


class TimelineEntry(BaseModel):
    year: int = Field(..., description="Year of the event")
    event: str = Field(..., description="What happened")
    actor: str = Field(..., description="Who did it (person/company/institution)")


class KeyPlayer(BaseModel):
    name: str = Field(..., description="Person, company, or institution name")
    role: str = Field(..., description="Their role in this research space")
    notable_work: str = Field(..., description="Key contribution or achievement")
    link: Optional[str] = Field(None, description="URL to their work or profile")


class AsIsSynthesisResult(BaseModel):
    summary: str = Field(
        ..., description="200-300 word overview of the current state of the art"
    )
    key_findings: List[KeyFinding] = Field(
        ..., description="Top findings with sources"
    )
    timeline: List[TimelineEntry] = Field(
        ..., description="Chronological milestones in this research area"
    )
    key_players: List[KeyPlayer] = Field(
        ..., description="Key players and their contributions"
    )


class Comparison(BaseModel):
    entity: str = Field(..., description="Company, person, or project being compared")
    approach: str = Field(..., description="Their approach or method")
    strengths: List[str] = Field(..., description="Strengths of their approach")
    limitations: List[str] = Field(..., description="Limitations or weaknesses")


class OpenSourceProject(BaseModel):
    name: str = Field(..., description="Project name")
    url: str = Field(..., description="GitHub or repository URL")
    description: str = Field(..., description="Brief description of the project")
    stars: Optional[int] = Field(None, description="GitHub stars count")
    last_updated: Optional[str] = Field(None, description="Last update date")


class ComparativeAnalysisResult(BaseModel):
    comparisons: List[Comparison] = Field(
        ..., description="Side-by-side comparisons of different approaches"
    )
    open_source_landscape: List[OpenSourceProject] = Field(
        ..., description="Relevant open source projects"
    )
    gaps: List[str] = Field(
        ..., description="Identified gaps in current research and implementations"
    )


class FutureProblem(BaseModel):
    title: str = Field(..., description="Problem statement title")
    description: str = Field(
        ..., description="50-100 word description of the problem"
    )
    rationale: str = Field(..., description="Why this problem matters")
    potential_impact: str = Field(
        ..., description="What solving this would enable"
    )


class FutureDirectionsResult(BaseModel):
    problem_statements: List[FutureProblem] = Field(
        ..., description="Forward-looking problem statements"
    )
    opportunities: List[str] = Field(
        ..., description="High-level opportunity areas"
    )
    research_questions: List[str] = Field(
        ..., description="Open questions worth exploring"
    )


class RiskItem(BaseModel):
    risk: str = Field(..., description="Description of the risk")
    impact: str = Field(..., description="Potential impact if the risk materializes")
    mitigation: str = Field(..., description="Proposed mitigation strategy")


class DetailedProblemStatement(BaseModel):
    title: str = Field(..., description="Clear, concise problem title")
    executive_summary: str = Field(
        ...,
        description="150-200 word executive summary of the problem and proposed approach",
    )
    background_and_motivation: str = Field(
        ...,
        description="300-400 word background explaining the research context, why this problem exists, and what drives the need to solve it",
    )
    problem_definition: str = Field(
        ...,
        description="Precise technical formulation of the problem, including formal definitions where applicable",
    )
    current_sota: str = Field(
        ...,
        description="Current state of the art specifically for this problem, citing key methods, benchmarks, and limitations from the research context",
    )
    proposed_approach: str = Field(
        ...,
        description="High-level methodology and technical approach proposed to address the problem",
    )
    challenge_use_case: str = Field(
        ...,
        description="Concrete challenges and representative use cases that ground the problem",
    )
    deliverables: List[str] = Field(
        ...,
        description="Specific tangible outputs: prototypes, datasets, papers, patents, systems",
    )
    kpis: List[str] = Field(
        ...,
        description="SOTA-benchmarked KPIs. Format: 'Name: ...; Measure: ...; Target: ...; SOTA baseline: ...; Reasoning: ...'",
    )
    prerequisites: List[str] = Field(
        ...,
        description="Required background knowledge, datasets, tools, and access",
    )
    infrastructure_requirements: str = Field(
        ...,
        description="Hardware, cloud resources, and computational requirements",
    )
    tech_stack: str = Field(
        ...,
        description="Languages, frameworks, libraries, APIs, and platforms",
    )
    milestones: dict = Field(
        ...,
        description="Research milestones: {M2: '...', M4: '...', M6: '...'}",
    )
    risk_assessment: List[RiskItem] = Field(
        ...,
        description="Structured list of risks with impact and mitigation for each",
    )
    budget_estimation: dict = Field(
        ...,
        description="Budget breakdown by category (personnel, compute, tools, dissemination)",
    )
    key_references: List[str] = Field(
        ...,
        description="Relevant references from the research context: 'Title — URL'",
    )
