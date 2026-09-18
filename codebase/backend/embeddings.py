"""Semantic fallback cho slides.relevant_slides() — dùng khi so trùng từ khoá không ra
kết quả (câu hỏi dùng từ vựng khác hẳn slide, ví dụ thuật ngữ tiếng Anh trong khi slide
viết tiếng Việt). Tách riêng khỏi slides.py để module đó không phụ thuộc OpenAI.
"""

import hashlib
import math
import os

from openai import OpenAI

EMBED_MODEL = os.environ.get("OPENAI_EMBED_MODEL", "text-embedding-3-small")

# Nội dung slide không đổi trong một phiên server -> cache theo hash nội dung, tránh
# embed lại toàn bộ bộ slide (có thể ~100 trang) ở mỗi lượt hỏi.
_slide_cache: dict[str, dict[int, list[float]]] = {}


def _slides_key(slides: dict[int, str]) -> str:
    blob = "\x1f".join(f"{n}:{slides[n]}" for n in sorted(slides))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _embed(texts: list[str]) -> list[list[float]]:
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [item.embedding for item in response.data]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


def embed_slides(slides: dict[int, str]) -> dict[int, list[float]]:
    """{số trang: vector}, tính 1 lần cho mỗi bộ slide rồi cache lại."""
    key = _slides_key(slides)
    cached = _slide_cache.get(key)
    if cached is not None:
        return cached
    numbers = sorted(slides)
    vectors = _embed([slides[n] for n in numbers])
    result = dict(zip(numbers, vectors))
    _slide_cache[key] = result
    return result


def semantic_relevant_slides(query: str, slides: dict[int, str], k: int) -> dict[int, str]:
    """Chữ ký khớp `semantic_fallback` của slides.relevant_slides(). Lỗi API (mất mạng,
    hết quota...) không được làm hỏng luồng chính -> trả {} để caller tự rơi về fallback
    cũ (k slide đầu theo số trang) thay vì để lỗi lan lên.
    """
    if not slides or not query.strip():
        return {}
    try:
        slide_vectors = embed_slides(slides)
        query_vector = _embed([query])[0]
    except Exception:
        return {}
    ranked = sorted(slide_vectors, key=lambda n: -_cosine(query_vector, slide_vectors[n]))[:k]
    return {n: slides[n] for n in sorted(ranked)}
