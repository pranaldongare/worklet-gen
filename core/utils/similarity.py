from __future__ import annotations

from typing import Any, Dict, List

from core.models.worklet import Worklet


def compute_worklet_similarities(
    worklets: List[Worklet], threshold: float = 0.7
) -> List[Dict[str, Any]]:
    """Compute pairwise similarity between worklets using TF-IDF."""
    if len(worklets) < 2:
        return []

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
    except ImportError:
        print("scikit-learn not installed; skipping similarity detection.")
        return []

    texts = [
        f"{w.title} {w.problem_statement} {w.description}" for w in worklets
    ]

    vectorizer = TfidfVectorizer(stop_words="english")
    tfidf_matrix = vectorizer.fit_transform(texts)
    sim_matrix = cosine_similarity(tfidf_matrix)

    similar_pairs: List[Dict[str, Any]] = []
    for i in range(len(worklets)):
        for j in range(i + 1, len(worklets)):
            score = float(sim_matrix[i][j])
            if score >= threshold:
                similar_pairs.append(
                    {
                        "worklet_a_id": worklets[i].worklet_id,
                        "worklet_b_id": worklets[j].worklet_id,
                        "worklet_a_title": worklets[i].title,
                        "worklet_b_title": worklets[j].title,
                        "similarity_score": round(score, 3),
                    }
                )
    return similar_pairs
