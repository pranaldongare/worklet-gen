from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from core.models.worklet import Reference
from deep_research.outputs import (
    AsIsSynthesisResult,
    ComparativeAnalysisResult,
    EntityExtractionResult,
    FutureDirectionsResult,
)


class PreSavedFile(BaseModel):
    """File already saved to disk before the background task started."""
    title: str          # Original filename
    file_name: str      # Timestamped filename on disk
    path: str           # Full path to saved file


class DeepResearchInput(BaseModel):
    research_id: str
    prompt: str
    links: List[str] = Field(default_factory=list)
    saved_files: List[PreSavedFile] = Field(default_factory=list)
    thread_id: Optional[str] = None
    worklet_id: Optional[str] = None


class DeepResearchResult(BaseModel):
    research_id: str
    prompt: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    thread_id: Optional[str] = None
    worklet_id: Optional[str] = None
    entities: Optional[EntityExtractionResult] = None
    as_is: Optional[AsIsSynthesisResult] = None
    comparative: Optional[ComparativeAnalysisResult] = None
    future: Optional[FutureDirectionsResult] = None
    references: List[Reference] = Field(default_factory=list)
    detailed_problems: Optional[dict] = Field(
        default=None,
        description="Map of problem_index (str) to DetailedProblemStatement dict",
    )
    status: str = "running"
