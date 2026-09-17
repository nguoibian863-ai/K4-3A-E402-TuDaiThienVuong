"""Bước 8-10 — Feynman: học viên giảng lại khái niệm, AI đóng vai học viên hỏi ngược,
cuối phiên AI tổng kết và đề xuất mức hiểu mới.

Hàm thuần, không phụ thuộc DB: ngữ cảnh khái niệm (ghi chú, câu hỏi đã lưu) do main.py truyền vào.
"""

from llm import call_llm
from prompts import get_prompt

FEEDBACK_TYPES = {"deeper_question", "real_scenario", "point_out_gap", "hint"}
UNDERSTANDING = {"good", "partial", "weak"}

MAX_TURNS = 16  # phiên dài vẫn giữ đủ ngữ cảnh gần, tránh model trôi ý vì lịch sử quá dài
REPLY_TEMPERATURE = 0.4  # đủ tự nhiên nhưng không tùy hứng bỏ qua lời giảng vừa nghe
SUMMARY_TEMPERATURE = 0.2


def _to_turns(history: list[dict]) -> list[dict]:
    """Đổi lịch sử phiên Feynman thành message thật: teacher = người dùng, student = AI."""
    turns = []
    for item in history or []:
        if not isinstance(item, dict):
            continue
        role = "assistant" if item.get("role") == "student" else "user"
        turns.append({"role": role, "content": item.get("content")})
    return turns


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
    message = (message or "").strip()
    payload = {"concept": concept, "evidence": evidence, "session_start": not message}
    # Lời giảng mới nhất là message CUỐI CÙNG gửi lên model -> model phải đáp đúng câu đó
    turns = _to_turns(history)[-MAX_TURNS:]
    if message:
        turns.append({"role": "user", "content": message})
    try:
        raw_response, parsed = call_llm(
            get_prompt("feynman_reply"), payload, temperature=REPLY_TEMPERATURE, turns=turns
        )
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
    payload = {"concept": concept, "evidence": evidence}
    try:
        raw_response, parsed = call_llm(
            get_prompt("feynman_summary"), payload,
            temperature=SUMMARY_TEMPERATURE, turns=_to_turns(history),
        )
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
