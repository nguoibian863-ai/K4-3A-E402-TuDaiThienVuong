import chat
from chat import chat_reply


def _context(**overrides):
    base = {
        "lesson": "Bài 3 - Prompt Engineering",
        "latest_progress": None,
        "progress_history": [],
        "bookmarks": [],
        "notes": [],
        "questions": [],
        "allowed_slides": [1, 2, 3],
    }
    base.update(overrides)
    return base


# ---------- chat_reply: happy paths ----------

def test_chat_reply_answer_intent_keeps_allowed_links(patch_llm):
    patch_llm(chat, {
        "intent": "answer",
        "reply": "Bạn đang học đến trang 2.",
        "links": [{"slide": 2, "label": "Trang 2 — tiến độ"}],
    })
    result = chat_reply(_context(allowed_slides=[1, 2]), [], "Tôi đã học đến đâu?")

    assert result["intent"] == "answer"
    assert result["links"] == [{"slide": 2, "label": "Trang 2 — tiến độ"}]
    assert result["used_fallback"] is False


def test_chat_reply_drops_links_to_slides_outside_allowed_set(patch_llm):
    # Chống bịa link: model có thể "sáng tác" số trang không có trong dữ liệu học viên.
    patch_llm(chat, {
        "intent": "answer",
        "reply": "...",
        "links": [{"slide": 99, "label": "Trang bịa ra"}],
    })
    result = chat_reply(_context(allowed_slides=[1, 2]), [], "hỏi gì đó")

    assert result["links"] == []


def test_chat_reply_deduplicates_and_caps_links_at_max(patch_llm):
    links = [{"slide": 1, "label": f"lần {i}"} for i in range(10)]
    patch_llm(chat, {"intent": "answer", "reply": "ok", "links": links})
    result = chat_reply(_context(allowed_slides=[1]), [], "hỏi gì đó")

    assert len(result["links"]) == 1  # trang 1 chỉ giữ 1 lần dù model lặp lại 10 lần


def test_chat_reply_caps_links_at_max_links_constant(patch_llm):
    links = [{"slide": s, "label": f"Trang {s}"} for s in range(1, 8)]
    patch_llm(chat, {"intent": "answer", "reply": "ok", "links": links})
    result = chat_reply(_context(allowed_slides=list(range(1, 8))), [], "hỏi gì đó")

    assert len(result["links"]) == chat.MAX_LINKS


# ---------- chat_reply: saved_list intent ----------

def test_chat_reply_saved_list_uses_code_generated_reply_not_llm_text(patch_llm):
    # intent = saved_list -> bỏ qua "reply" của model, để code tự liệt kê (luôn đủ, đúng trang).
    patch_llm(chat, {"intent": "saved_list", "reply": "câu trả lời model tự bịa", "links": []})
    context = _context(notes=[{"slide": 3, "note": "chưa hiểu rõ", "rating": 2, "saved_at": "10:00 01/01/2026"}])

    result = chat_reply(context, [], "tôi đã lưu những gì")

    assert result["intent"] == "saved_list"
    assert "câu trả lời model tự bịa" not in result["reply"]
    assert "Trang 3" in result["reply"]


def test_saved_list_reply_empty_when_nothing_saved():
    out = chat._saved_list_reply(_context())
    assert out["links"] == []
    assert "chưa lưu mục nào" in out["reply"]


def test_saved_list_reply_sorts_newest_first():
    context = _context(
        bookmarks=[{"slide": 1, "highlight": "cũ hơn", "saved_at": "09:00 01/01/2026"}],
        notes=[{"slide": 2, "note": "mới hơn", "rating": 4, "saved_at": "09:00 02/01/2026"}],
    )
    out = chat._saved_list_reply(context)
    assert out["reply"].index("mới hơn") < out["reply"].index("cũ hơn")


def test_saved_list_reply_truncates_and_notes_remainder():
    entries = [
        {"slide": i, "highlight": f"mục {i}", "saved_at": f"09:0{i} 01/01/2026"}
        for i in range(8)
    ]
    out = chat._saved_list_reply(_context(bookmarks=entries))
    assert "và 2 mục cũ hơn" in out["reply"]
    assert len(out["links"]) == chat.MAX_LINKS


# ---------- chat_reply: lỗi / định dạng sai ----------

def test_chat_reply_falls_back_when_llm_raises(patch_llm):
    patch_llm(chat, None, exc=RuntimeError("boom"))
    result = chat_reply(_context(), [], "hỏi gì đó")

    assert result["used_fallback"] is True
    assert result["links"] == []


def test_chat_reply_falls_back_on_invalid_intent(patch_llm):
    patch_llm(chat, {"intent": "khong_hop_le", "reply": "ok", "links": []})
    result = chat_reply(_context(), [], "hỏi gì đó")

    assert result["used_fallback"] is True


def test_chat_reply_falls_back_on_empty_reply_text(patch_llm):
    patch_llm(chat, {"intent": "answer", "reply": "   ", "links": []})
    result = chat_reply(_context(), [], "hỏi gì đó")

    assert result["used_fallback"] is True


# ---------- history -> turns ----------

def test_to_turns_keeps_only_last_max_turns_and_normalizes_roles():
    history = [{"role": "assistant" if i % 2 else "user", "content": str(i)} for i in range(15)]
    turns = chat._to_turns(history)
    assert len(turns) == 15  # _to_turns tự nó không cắt, chat_reply mới cắt theo MAX_TURNS
    assert all(t["role"] in ("user", "assistant") for t in turns)


def test_to_turns_ignores_malformed_entries():
    turns = chat._to_turns(["không phải dict", {"role": "user", "content": "ok"}, None])
    assert turns == [{"role": "user", "content": "ok"}]
