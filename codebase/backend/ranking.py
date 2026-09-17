"""Bước 7 — quyết định AI trung tâm: xếp danh sách ôn tập.

Hàm thuần `rank(items)` không phụ thuộc DB, để script golden set (eval/)
gọi thẳng và so kết quả với đáp án mong đợi.
"""

from llm import call_llm
from prompts import get_prompt

GROUP_RANK = {"low": 0, "medium": 1, "high": 2}


def compute_base_group(item: dict) -> str:
    if item["type"] == "note":
        rating = item["rating"]
        if rating <= 2:
            return "high"
        if rating == 3:
            return "medium"
        return "low"
    if item["type"] == "question":
        return "medium"
    raise ValueError(f"Không xếp nhóm cho type: {item['type']}")


def validate_output(data: dict, items_by_id: dict) -> bool:
    if not isinstance(data, dict) or "review_list" not in data:
        return False
    for entry in data["review_list"]:
        for key in ("concept", "item_ids", "base_group", "final_group"):
            if key not in entry:
                return False
        for eid in entry.get("evidence_ids", []) or []:
            if eid not in items_by_id:
                return False  # lớp ① — chống bịa nguồn
        for iid in entry["item_ids"]:
            if iid not in items_by_id:
                return False
        base_rank = GROUP_RANK.get(entry["base_group"])
        final_rank = GROUP_RANK.get(entry["final_group"])
        if base_rank is None or final_rank is None or abs(final_rank - base_rank) > 1:
            return False  # chỉ được lệch tối đa 1 nhóm
    return True


def fallback_output(items: list[dict]) -> dict:
    """AI lỗi hoặc trả sai định dạng: xếp thẳng theo base_group, mỗi mục một dòng."""
    review_list = []
    for item in items:
        review_list.append({
            "concept": item.get("highlight") or item.get("question") or item["id"],
            "item_ids": [item["id"]],
            "base_group": item["base_group"],
            "final_group": item["base_group"],
            "adjusted": False,
            "reason": "",
            "evidence_ids": [],
            "order": 0,
        })
    review_list.sort(key=lambda e: -GROUP_RANK.get(e["final_group"], 1))
    for i, entry in enumerate(review_list):
        entry["order"] = i + 1
    return {"review_list": review_list, "excluded": [], "flags": [], "used_fallback": True}


def rank(items: list[dict], known_concepts: list[str] | None = None) -> dict:
    """items: list[{id, type, slide, highlight, question|note+rating, base_group, lesson}]"""
    if not items:
        return {"review_list": [], "excluded": [], "flags": [], "used_fallback": False, "raw_response": None}

    items_by_id = {item["id"]: item for item in items}
    prompt_payload = {
        "lesson": items[0].get("lesson", ""),
        "known_concepts": known_concepts or [],
        "items": items,
    }

    try:
        # temperature 0: cùng dữ liệu -> cùng cách gộp/đặt tên, danh sách ôn không "nhảy" giữa các lần chạy
        raw_response, parsed = call_llm(get_prompt("ranking"), prompt_payload, temperature=0)
    except Exception:
        result = fallback_output(items)
        result["raw_response"] = None
        return result

    if not validate_output(parsed, items_by_id):
        result = fallback_output(items)
        result["raw_response"] = raw_response
        return result

    parsed["used_fallback"] = False
    parsed["raw_response"] = raw_response
    parsed.setdefault("excluded", [])
    parsed.setdefault("flags", [])
    return parsed
