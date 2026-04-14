from typing import Any, List, Literal, Union

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from core.database import db
from core.utils.worklet_store import (
    STRING_FIELDS as STRING_FIELD_NAMES,
    ARRAY_FIELDS as ARRAY_FIELD_NAMES,
    OBJECT_FIELDS as OBJECT_FIELD_NAMES,
    upgrade_legacy_worklet_record,
)

router = APIRouter(prefix="/manual-edit", tags=["manual-edit"])

STRING_FIELDS = set(STRING_FIELD_NAMES)
ARRAY_FIELDS = set(ARRAY_FIELD_NAMES)
OBJECT_FIELDS = set(OBJECT_FIELD_NAMES)


class ManualEditRequest(BaseModel):
    worklet_id: str = Field(..., description="Identifier of the worklet")
    worklet_iteration_id: str = Field(
        ..., description="Identifier of the worklet iteration"
    )
    field: Literal[
        "title",
        "problem_statement",
        "description",
        "challenge_use_case",
        "deliverables",
        "kpis",
        "prerequisites",
        "infrastructure_requirements",
        "tech_stack",
        "milestones",
        "budget_estimation",
        "risk_assessment",
    ]
    value: Any = Field(..., description="The new value for the field")


@router.post("/", status_code=status.HTTP_200_OK)
async def manual_edit(payload: ManualEditRequest):
    # Validate value type matches field type
    if payload.field in STRING_FIELDS:
        if not isinstance(payload.value, str):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{payload.field}' expects a string value.",
            )
    elif payload.field in ARRAY_FIELDS:
        if not isinstance(payload.value, list) or not all(
            isinstance(item, str) for item in payload.value
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{payload.field}' expects a list of strings.",
            )
    elif payload.field in OBJECT_FIELDS:
        if not isinstance(payload.value, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{payload.field}' expects a dict/object value.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Field '{payload.field}' is not editable.",
        )

    thread = db.threads.find_one(
        {"worklets.worklet_id": payload.worklet_id},
        {"_id": 1, "worklets": 1},
    )

    if not thread:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worklet not found.",
        )

    worklet_record = next(
        (
            item
            for item in thread.get("worklets", [])
            if item.get("worklet_id") == payload.worklet_id
        ),
        None,
    )

    if worklet_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worklet not found in thread document.",
        )

    if "iterations" not in worklet_record or not isinstance(
        worklet_record.get("iterations"), list
    ):
        upgraded = upgrade_legacy_worklet_record(worklet_record)
        db.threads.update_one(
            {"_id": thread["_id"], "worklets.worklet_id": payload.worklet_id},
            {"$set": {"worklets.$": upgraded}},
        )
        worklet_record = upgraded

    iteration_record = next(
        (
            item
            for item in (worklet_record.get("iterations") or [])
            if item.get("iteration_id") == payload.worklet_iteration_id
        ),
        None,
    )

    if iteration_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worklet iteration not found.",
        )

    field_payload = iteration_record.get(payload.field)
    if field_payload is None or not isinstance(field_payload, dict):
        field_payload = {"selected_index": 0, "iterations": []}

    existing_iterations = list(field_payload.get("iterations", []))
    updated_iterations = [*existing_iterations, payload.value]
    updated_index = len(updated_iterations) - 1

    update_result = db.threads.update_one(
        {"_id": thread["_id"]},
        {
            "$set": {
                f"worklets.$[worklet].iterations.$[iteration].{payload.field}.iterations": updated_iterations,
                f"worklets.$[worklet].iterations.$[iteration].{payload.field}.selected_index": updated_index,
            }
        },
        array_filters=[
            {"worklet.worklet_id": payload.worklet_id},
            {"iteration.iteration_id": payload.worklet_iteration_id},
        ],
    )

    if update_result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Failed to save manual edit.",
        )

    return {
        "worklet_id": payload.worklet_id,
        "worklet_iteration_id": payload.worklet_iteration_id,
        "field": payload.field,
        "selected_index": updated_index,
        "iterations": updated_iterations,
    }
