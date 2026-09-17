"""Bước 8-10 — Feynman: học viên giảng lại khái niệm, AI đóng vai học viên hỏi ngược,
cuối phiên AI tổng kết và đề xuất mức hiểu mới.

Hàm thuần, không phụ thuộc DB: ngữ cảnh khái niệm (ghi chú, câu hỏi đã lưu) do main.py truyền vào.
"""

from llm import call_llm
from prompts import get_prompt

FEEDBACK_TYPES = {"deeper_question", "real_scenario", "point_out_gap", "hint"}
UNDERSTANDING = {"good", "partial", "weak"}


def _validate_reply(data: dict) -> bool:
    return (
        isinstance(data, dict)
        and isinstance(data.get("reply"), str)
        and data["reply"].strip() != ""
        and data.get("feedback_type") in FEEDBACK_TYPES
        and data.get("understanding") in UNDERSTANDING
    )


def _validate_summary(data: dict) -> bool:
    if not isinstance(data, dict):
        return False
    for key in ("understood", "need_review"):
        value = data.get(key)
        if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
            return False
    rating = data.get("suggested_rating")
    if not isinstance(rating, int) or isinstance(rating, bool) or not (1 <= rating <= 5):
        return False
    return isinstance(data.get("reason"), str)


def student_reply(concept: str, evidence: list[dict], history: list[dict], message: str) -> dict:
    payload = {"concept": concept, "evidence": evidence, "history": history, "message": message}
    try:
        raw_response, parsed = call_llm(get_prompt("feynman_reply"), payload, temperature=0.3)
    except Exception:
        return {
            "reply": "Em chưa nghe rõ (AI không phản hồi). Thầy/cô thử gửi lại giúp em nhé.",
            "feedback_type": None,
            "understanding": None,
            "used_fallback": True,
        }
    if not _validate_reply(parsed):
        return {
            "reply": "Em chưa hiểu ý thầy/cô lắm (AI trả sai định dạng). Thầy/cô gửi lại giúp em nhé.",
            "feedback_type": None,
            "understanding": None,
            "used_fallback": True,
        }
    # Cần gợi ý nghĩa là lượt này giáo viên chưa giảng được ý nào
    if message and parsed["feedback_type"] == "hint":
        parsed["understanding"] = "weak"
    parsed["used_fallback"] = False
    return parsed


def session_summary(concept: str, evidence: list[dict], history: list[dict]) -> dict:
    payload = {"concept": concept, "evidence": evidence, "history": history}
    try:
        raw_response, parsed = call_llm(get_prompt("feynman_summary"), payload)
    except Exception:
        parsed = None
    if parsed is None or not _validate_summary(parsed):
        return {
            "understood": [],
            "need_review": [],
            "suggested_rating": None,
            "reason": "AI chưa tổng kết được phiên này. Bạn tự chọn mức hiểu mới bên dưới.",
            "used_fallback": True,
        }
    parsed["used_fallback"] = False
    return parsed
