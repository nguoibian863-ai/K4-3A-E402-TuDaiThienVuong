"""Bước 3 — AI Explain: trả lời câu hỏi của học viên về đúng đoạn vừa bôi đen.

Hàm thuần `explain(highlight, question, lesson)` không phụ thuộc DB.
"""

from llm import call_llm
from prompts import get_prompt


VALID_STATUS = {"answered", "out_of_scope", "insufficient_context"}

MAX_TURNS = 12
TEMPERATURE = 0.3  # bám đoạn bôi đen và câu hỏi vừa gửi, không tự chuyển chủ đề


def _to_turns(history: list[dict] | None) -> list[dict]:
    """Đổi lịch sử [{question, answer}] thành message thật (hỏi = user, đáp = assistant)."""
    turns = []
    for item in history or []:
        if not isinstance(item, dict):
            continue
        turns.append({"role": "user", "content": item.get("question")})
        turns.append({"role": "assistant", "content": item.get("answer")})
    return turns


def validate_output(data: dict) -> bool:
    if not isinstance(data, dict):
        return False
    if data.get("status") not in VALID_STATUS:
        return False
    if not isinstance(data.get("answer"), str) or not data["answer"].strip():
        return False
    return True


def fallback_output() -> dict:
    return {
        "answer": "Không thể tạo giải thích lúc này (AI không phản hồi). Vui lòng thử lại sau.",
        "status": "error",
        "used_fallback": True,
    }


def explain(highlight: str, question: str, lesson: str = "", history: list[dict] | None = None) -> dict:
    if not highlight or not highlight.strip():
        return {
            "answer": "Chưa có đoạn nào được bôi đen để giải thích.",
            "status": "insufficient_context",
            "used_fallback": False,
        }

    payload = {"lesson": lesson, "highlight": highlight}
    # Câu hỏi mới đứng cuối chuỗi hội thoại -> model trả lời đúng câu đó, hiểu cả ý nối tiếp
    turns = _to_turns(history)[-MAX_TURNS:] + [{"role": "user", "content": question}]

    try:
        raw_response, parsed = call_llm(
            get_prompt("explain"), payload, temperature=TEMPERATURE, turns=turns
        )
    except Exception:
        result = fallback_output()
        result["raw_response"] = None
        return result

    if not validate_output(parsed):
        result = fallback_output()
        result["raw_response"] = raw_response
        return result

    parsed["used_fallback"] = False
    parsed["raw_response"] = raw_response
    return parsed
