import asyncio
import io
import os
import re
import uuid
from datetime import datetime
from typing import Annotated

import aiofiles
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel as PydanticBaseModel

from core.constants import WORKLET_GENERATOR_LLM
from core.database import db
from core.llm.client import invoke_llm
from core.utils.generate_research_files import (
    create_research_pdf,
    create_research_ppt,
    create_detailed_problem_pdf,
    create_detailed_problem_ppt,
)
from core.utils.process_array_string import process_array_string
from deep_research.outputs import DetailedProblemStatement
from deep_research.prompts import detailed_problem_statement_prompt
from deep_research.runner import run_deep_research
from deep_research.state import DeepResearchInput, PreSavedFile


class GenerateDetailedProblemRequest(PydanticBaseModel):
    problem_index: int

router = APIRouter(prefix="/deep-research", tags=["deep-research"])

# Keep track of running tasks so they aren't garbage-collected
_running_tasks: dict[str, asyncio.Task] = {}


def _generate_research_id() -> str:
    return uuid.uuid4().hex[:10]


async def _save_uploads(
    files: list[UploadFile] | None,
    research_id: str,
) -> list[PreSavedFile]:
    """Read and persist uploaded files to disk BEFORE the response is sent.

    This avoids the 'I/O operation on closed file' error that occurs when
    background tasks try to read UploadFile objects after the request ends.
    """
    if not files:
        return []

    upload_dir = os.path.join("data", "threads", f"research_{research_id}", "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    saved: list[PreSavedFile] = []
    for file in files:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        name, ext = os.path.splitext(file.filename)
        file_name = f"{name}_{timestamp}{ext}"
        file_path = os.path.join(upload_dir, file_name)

        async with aiofiles.open(file_path, "wb") as f:
            content = await file.read()
            await f.write(content)

        saved.append(PreSavedFile(title=file.filename, file_name=file_name, path=file_path))

    return saved


@router.post("/")
async def start_research(
    prompt: Annotated[str, Form()],
    links: Annotated[str, Form()] = "",
    files: Annotated[list[UploadFile], File()] = None,
    thread_id: Annotated[str, Form()] = "",
    worklet_id: Annotated[str, Form()] = "",
):
    """Start a new deep research session. Returns immediately with research_id."""
    research_id = _generate_research_id()

    links_array = process_array_string(links) if links else []

    # Save uploaded files to disk NOW (before response closes the handles)
    saved_files = await _save_uploads(files, research_id)

    # Insert initial document
    doc = {
        "research_id": research_id,
        "prompt": prompt,
        "created_at": datetime.utcnow(),
        "thread_id": thread_id or None,
        "worklet_id": worklet_id or None,
        "status": "running",
        "entities": None,
        "as_is": None,
        "comparative": None,
        "future": None,
        "references": [],
    }
    db.deep_research.insert_one(doc)

    # Build input
    research_input = DeepResearchInput(
        research_id=research_id,
        prompt=prompt,
        links=links_array,
        saved_files=saved_files,
        thread_id=thread_id or None,
        worklet_id=worklet_id or None,
    )

    # Launch as background task
    task = asyncio.create_task(run_deep_research(research_input))
    _running_tasks[research_id] = task

    # Clean up reference when done
    def _cleanup(t):
        _running_tasks.pop(research_id, None)

    task.add_done_callback(_cleanup)

    return {"research_id": research_id}


@router.get("/list")
async def list_research():
    """List all deep research sessions, most recent first."""
    docs = list(
        db.deep_research.find(
            {},
            {"_id": 0},
        ).sort("created_at", -1)
    )
    # Serialize datetimes
    for doc in docs:
        if "created_at" in doc and hasattr(doc["created_at"], "isoformat"):
            doc["created_at"] = doc["created_at"].isoformat()
    return {"research": docs}


@router.get("/by-worklet/{thread_id}/{worklet_id}")
async def get_research_by_worklet(thread_id: str, worklet_id: str):
    """Find existing research for a specific worklet."""
    doc = db.deep_research.find_one(
        {"thread_id": thread_id, "worklet_id": worklet_id},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No research found for this worklet")
    if "created_at" in doc and hasattr(doc["created_at"], "isoformat"):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


@router.get("/{research_id}/download/{file_type}")
async def download_research(research_id: str, file_type: str):
    """Download the full deep research report as PDF or PPTX."""
    if file_type not in ("pdf", "pptx"):
        raise HTTPException(status_code=400, detail="file_type must be 'pdf' or 'pptx'")

    doc = db.deep_research.find_one({"research_id": research_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Research not found")
    if doc.get("status") != "completed":
        raise HTTPException(status_code=409, detail="Research is not yet completed")

    prompt_slug = re.sub(r"[^\w\s-]", "", doc.get("prompt", "research"))[:40].strip()
    prompt_slug = re.sub(r"\s+", "_", prompt_slug) or "deep_research"

    if file_type == "pdf":
        data = create_research_pdf(doc, in_memory=True)
        filename = f"{prompt_slug}.pdf"
        media_type = "application/pdf"
    else:
        data = create_research_ppt(doc, in_memory=True)
        filename = f"{prompt_slug}.pptx"
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

    if data is None:
        raise HTTPException(status_code=500, detail="Failed creating file")

    return StreamingResponse(
        io.BytesIO(data),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{research_id}/generate-detailed-problem")
async def generate_detailed_problem(
    research_id: str,
    body: GenerateDetailedProblemRequest,
):
    """Generate a detailed, research-proposal-quality problem statement."""
    doc = db.deep_research.find_one({"research_id": research_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Research not found")
    if doc.get("status") != "completed":
        raise HTTPException(
            status_code=409,
            detail="Research must be completed before generating detailed problems",
        )

    future = doc.get("future")
    if not future:
        raise HTTPException(status_code=409, detail="Future directions section not available")

    problems = future.get("problem_statements", [])
    idx = body.problem_index
    if idx < 0 or idx >= len(problems):
        raise HTTPException(
            status_code=400,
            detail=f"problem_index {idx} out of range (0–{len(problems) - 1})",
        )

    selected = problems[idx]

    llm_model = WORKLET_GENERATOR_LLM.model
    llm_port = WORKLET_GENERATOR_LLM.port

    result: DetailedProblemStatement = await invoke_llm(
        gpu_model=llm_model,
        response_schema=DetailedProblemStatement,
        contents=detailed_problem_statement_prompt(selected, doc),
        port=llm_port,
    )

    result_dict = result.model_dump()
    # Ensure detailed_problems is an object (not null) before setting a sub-field
    db.deep_research.update_one(
        {"research_id": research_id, "detailed_problems": None},
        {"$set": {"detailed_problems": {}}},
    )
    db.deep_research.update_one(
        {"research_id": research_id},
        {"$set": {f"detailed_problems.{idx}": result_dict}},
    )

    return result_dict


@router.get("/{research_id}/detailed-problem/{problem_index}/download/{file_type}")
async def download_detailed_problem(
    research_id: str,
    problem_index: int,
    file_type: str,
):
    """Download a detailed problem statement as PDF or PPTX."""
    if file_type not in ("pdf", "pptx"):
        raise HTTPException(status_code=400, detail="file_type must be 'pdf' or 'pptx'")

    doc = db.deep_research.find_one({"research_id": research_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Research not found")

    detailed = doc.get("detailed_problems", {}) or {}
    problem_data = detailed.get(str(problem_index))
    if not problem_data:
        raise HTTPException(
            status_code=404,
            detail=f"Detailed problem {problem_index} not found. Generate it first.",
        )

    title_slug = re.sub(r"[^\w\s-]", "", problem_data.get("title", "problem"))[:40].strip()
    title_slug = re.sub(r"\s+", "_", title_slug) or "detailed_problem"

    if file_type == "pdf":
        data = create_detailed_problem_pdf(problem_data, in_memory=True)
        filename = f"{title_slug}.pdf"
        media_type = "application/pdf"
    else:
        data = create_detailed_problem_ppt(problem_data, in_memory=True)
        filename = f"{title_slug}.pptx"
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

    if data is None:
        raise HTTPException(status_code=500, detail="Failed creating file")

    return StreamingResponse(
        io.BytesIO(data),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{research_id}")
async def get_research(research_id: str):
    """Fetch a specific deep research result."""
    doc = db.deep_research.find_one(
        {"research_id": research_id},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Research not found")
    if "created_at" in doc and hasattr(doc["created_at"], "isoformat"):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


@router.delete("/{research_id}")
async def delete_research(research_id: str):
    """Delete a deep research session."""
    result = db.deep_research.delete_one({"research_id": research_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Research not found")
    # Cancel running task if any
    task = _running_tasks.pop(research_id, None)
    if task and not task.done():
        task.cancel()
    return {"message": f"Research {research_id} deleted"}
