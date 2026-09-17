"""Chat Giai đoạn 2 — hỏi đáp tự do về quá trình học: đã học đến đâu, đã ghi chú/hỏi gì,
ở trang nào. AI trả lời kèm link tới trang slide; hoặc báo frontend chuyển sang xếp danh
sách ôn tập (B7).

Hàm thuần: context (tiến độ, ghi chú, câu hỏi, bookmark) do main.py dựng từ DB.
"""

from llm import call_llm
from prompts import get_prompt

VALID_INTENTS = {"review_list", "answer"}
MAX_LINKS = 5


def _fallback(reason: str) -> dict:
    return {
        "intent": "answer",
        "reply": f"Mình chưa trả lời được lúc này ({reason}). Bạn thử hỏi lại nhé.",
        "links": [],
        "used_fallback": True,
    }


def chat_reply(context: dict, history: list[dict], message: str) -> dict:
    payload = {"context": context, "history": history[-10:], "message": message}
    try:
        _, parsed = call_llm(get_prompt("chat"), payload)
    except Exception:
        return _fallback("AI không phản hồi")

    if (
        not isinstance(parsed, dict)
        or parsed.get("intent") not in VALID_INTENTS
        or not isinstance(parsed.get("reply"), str)
        or not parsed["reply"].strip()
    ):
        return _fallback("AI trả sai định dạng")

    # Chống bịa link: chỉ giữ trang có thật trong dữ liệu học của người dùng
    allowed = set(context.get("allowed_slides", []))
    links, seen = [], set()
    for link in parsed.get("links") or []:
        if not isinstance(link, dict):
            continue
        slide = link.get("slide")
        if isinstance(slide, bool) or not isinstance(slide, int) or slide not in allowed or slide in seen:
            continue
        seen.add(slide)
        label = str(link.get("label") or f"Trang {slide}").strip()[:60]
        links.append({"slide": slide, "label": label})

    return {
        "intent": parsed["intent"],
        "reply": parsed["reply"],
        "links": links[:MAX_LINKS],
        "used_fallback": False,
    }
