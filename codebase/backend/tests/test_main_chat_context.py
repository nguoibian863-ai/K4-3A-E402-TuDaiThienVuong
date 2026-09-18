"""Test tích hợp cho endpoint /chat trong main.py — dùng TestClient thật của FastAPI,
chỉ giả (monkeypatch) các biên phụ thuộc ngoài: Supabase (get_client), load_slides,
semantic_relevant_slides, và chat_reply.

Trước fix #1, /chat chỉ đọc activities của học viên, không đọc nội dung slide (xem test
cũ đã xoá: test_chat_endpoint_context_never_includes_raw_slide_or_document_text). Sau fix,
main.py nạp thêm vài trang slide liên quan tới câu hỏi và gộp vào "context" cho chat_reply.
"""

from fastapi.testclient import TestClient

import main


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return _FakeResult(self._rows)


class _FakeDB:
    def __init__(self, rows):
        self._rows = rows

    def table(self, name):
        assert name == "activities"
        return _FakeQuery(self._rows)


def _fake_row(**overrides):
    row = {
        "session_id": "s1",
        "lesson_id": "l1",
        "lesson": "Bài 3 - Prompt Engineering",
        "slide": 4,
        "type": "note",
        "highlight": "CFG điều chỉnh mức độ bám theo prompt",
        "note": "chưa hiểu rõ CFG",
        "question": None,
        "rating": 2,
        "created_at": "2026-09-17T10:00:00+00:00",
    }
    row.update(overrides)
    return row


def _post_chat(monkeypatch, rows, message="Tôi đã học đến đâu?", slides=None, semantic_hits=None):
    monkeypatch.setattr(main, "get_client", lambda: _FakeDB(rows))
    monkeypatch.setattr(main, "load_slides", lambda lesson_id: slides or {})

    def fake_semantic(query, slide_map, k):
        if semantic_hits is None:
            raise AssertionError("semantic_relevant_slides không nên được gọi trong test này")
        return semantic_hits

    monkeypatch.setattr(main, "semantic_relevant_slides", fake_semantic)

    captured = {}

    def fake_chat_reply(context, history, msg):
        captured["context"] = context
        captured["message"] = msg
        return {"intent": "answer", "reply": "ok", "links": [], "used_fallback": False}

    monkeypatch.setattr(main, "chat_reply", fake_chat_reply)

    client = TestClient(main.app)
    resp = client.post(
        "/chat",
        json={"session_id": "s1", "lesson_id": "l1", "message": message, "history": []},
    )
    return resp, captured


def test_chat_endpoint_builds_context_from_activities(monkeypatch):
    resp, captured = _post_chat(monkeypatch, [_fake_row()], message="hôm nay tôi cần ôn gì")

    assert resp.status_code == 200
    context = captured["context"]
    assert context["lesson"] == "Bài 3 - Prompt Engineering"
    assert 4 in context["allowed_slides"]
    assert len(context["notes"]) == 1
    assert context["notes"][0]["rating"] == 2


def test_chat_endpoint_grounds_knowledge_questions_in_relevant_slide_text(monkeypatch):
    """Fix #1: câu hỏi kiến thức thật (không có trong ghi chú của học viên) giờ kéo được
    nội dung slide liên quan vào context, thay vì context chỉ có dữ liệu tự lưu của học
    viên như trước khi sửa.
    """
    slides = {
        6: "CFG (Classifier-Free Guidance) điều chỉnh mức độ bám theo prompt khi sinh ảnh.",
        7: "Midjourney và DALL-E 3 là hai công cụ sinh ảnh phổ biến khác.",
    }
    resp, captured = _post_chat(monkeypatch, [], message="CFG là gì", slides=slides)

    assert resp.status_code == 200
    context = captured["context"]
    assert context["slides"] == [{"slide": 6, "text": slides[6]}]


def test_chat_endpoint_extends_allowed_slides_with_grounded_slides_not_in_activities(monkeypatch):
    # Cho phép AI đặt link tới trang slide vừa grounding được, dù học viên chưa từng
    # tương tác với trang đó (activities rỗng) -> nếu không mở allowed_slides thì chat.py
    # sẽ tự lọc bỏ link này (chống bịa trang).
    slides = {
        6: "CFG (Classifier-Free Guidance) điều chỉnh mức độ bám theo prompt.",
        7: "Midjourney và DALL-E 3 là hai công cụ sinh ảnh phổ biến khác.",
    }
    resp, captured = _post_chat(monkeypatch, [], message="CFG là gì", slides=slides)

    assert captured["context"]["allowed_slides"] == [6]


def test_chat_endpoint_falls_back_to_semantic_search_when_keywords_mismatch(monkeypatch):
    # Câu hỏi dùng từ khác hẳn slide (không overlap từ khoá nào) -> relevant_slides() phải
    # gọi semantic_relevant_slides() (đã nối dây ở main.py) thay vì bỏ cuộc.
    slides = {2: "Cơ chế khử nhiễu dần dần qua nhiều bước lặp để tái tạo ảnh."}
    resp, captured = _post_chat(
        monkeypatch, [], message="diffusion denoising steps", slides=slides, semantic_hits={2: slides[2]},
    )

    assert captured["context"]["slides"] == [{"slide": 2, "text": slides[2]}]


def test_chat_endpoint_with_no_activities_and_no_matching_slides_still_returns_200(monkeypatch):
    resp, captured = _post_chat(monkeypatch, [], message="chào bạn", slides={})

    assert resp.status_code == 200
    context = captured["context"]
    assert context["lesson"] == ""
    assert context["latest_progress"] is None
    assert context["slides"] == []
    assert context["allowed_slides"] == []


def test_chat_endpoint_rejects_missing_lesson_id(monkeypatch):
    monkeypatch.setattr(main, "get_client", lambda: _FakeDB([]))
    client = TestClient(main.app)
    resp = client.post("/chat", json={"session_id": "s1", "message": "hỏi gì đó"})

    assert resp.status_code == 422
