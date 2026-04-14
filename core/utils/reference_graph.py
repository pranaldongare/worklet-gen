from __future__ import annotations

import re
from typing import Any, Dict, List

from core.models.worklet import Reference

_STOP_WORDS = frozenset(
    "the and for with from that this are was were has have had been being "
    "will can could would should not but its our they them their what which "
    "where when how who whom into onto upon about over under between through "
    "during before after above below".split()
)


def _extract_keywords(text: str) -> set[str]:
    words = re.findall(r"\b[a-z]{3,}\b", text.lower())
    return {w for w in words if w not in _STOP_WORDS}


def build_reference_graph(
    references: List[Reference], worklet_title: str
) -> Dict[str, Any]:
    nodes: List[Dict[str, Any]] = [
        {"id": "topic", "label": worklet_title[:60], "type": "topic", "size": 20}
    ]
    edges: List[Dict[str, Any]] = []

    topic_keywords = _extract_keywords(worklet_title)
    ref_keywords: dict[str, set[str]] = {}

    for i, ref in enumerate(references):
        node_id = f"ref_{i}"
        keywords = _extract_keywords(f"{ref.title} {ref.description}")
        ref_keywords[node_id] = keywords

        size = 10
        if ref.citation_count and ref.citation_count > 0:
            size = min(10 + ref.citation_count / 50, 30)

        nodes.append(
            {
                "id": node_id,
                "label": ref.title[:50],
                "type": ref.tag,
                "size": size,
                "reference": ref.model_dump(),
            }
        )

        shared_with_topic = keywords & topic_keywords
        if shared_with_topic:
            edges.append(
                {"source": "topic", "target": node_id, "weight": len(shared_with_topic)}
            )

    ref_ids = list(ref_keywords.keys())
    for i in range(len(ref_ids)):
        for j in range(i + 1, len(ref_ids)):
            shared = ref_keywords[ref_ids[i]] & ref_keywords[ref_ids[j]]
            if len(shared) >= 2:
                edges.append(
                    {"source": ref_ids[i], "target": ref_ids[j], "weight": len(shared)}
                )

    return {"nodes": nodes, "edges": edges}
