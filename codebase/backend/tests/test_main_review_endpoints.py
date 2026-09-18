"""Test cho phần "xoá mềm" khỏi danh sách ôn tập B7:
- POST /activities/mark-reviewed đánh dấu reviewed_at cho đúng các id.
- POST /sessions/{id}/review loại các activity đã reviewed_at khỏi danh sách.

Dùng TestClient thật của FastAPI, chỉ giả Supabase (get_client) và rank() (B7 thật gọi AI).
"""

from fastapi.testclient import TestClient

import main


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _RecordingQuery:
    """Ghi lại chuỗi method đã gọi (select/eq/in_/is_/update/insert...), trả data cấu hình
    sẵn cho select, và mô phỏng insert trả về đúng hàng vừa chèn (kèm "id" giả).
    """

    def __init__(self, data, calls):
        self._data = data
        self.calls = calls
        self._insert_payload = None

    def insert(self, payload):
        self._insert_payload = payload
        self.calls.append(("insert", (payload,), {}))
        return self

    def update(self, payload):
        self._insert_payload = None
        self.calls.append(("update", (payload,), {}))
        return self

    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return self
        return method

    def execute(self):
        self.calls.append(("execute", (), {}))
        if self._insert_payload is not None:
            return _FakeResult([{**self._insert_payload, "id": "run-1"}])
        return _FakeResult(self._data)


class _FakeDB:
    def __init__(self, table_data):
        self.table_data = table_data
        self.calls = {}

    def table(self, name):
        self.calls.setdefault(name, [])
        return _RecordingQuery(self.table_data.get(name, []), self.calls[name])


# ---------- POST /activities/mark-reviewed ----------

def test_mark_reviewed_updates_matching_ids(monkeypatch):
    fake_db = _FakeDB({"activities": []})
    monkeypatch.setattr(main, "get_client", lambda: fake_db)
    client = TestClient(main.app)

    resp = client.post("/activities/mark-reviewed", json={"item_ids": ["a1", "a2"]})

    assert resp.status_code == 200
    assert resp.json() == {"marked": 2}
    calls = fake_db.calls["activities"]
    assert calls[0][0] == "update"
    assert "reviewed_at" in calls[0][1][0]
    assert calls[1] == ("in_", ("id", ["a1", "a2"]), {})


def test_mark_reviewed_rejects_empty_item_ids():
    client = TestClient(main.app)
    resp = client.post("/activities/mark-reviewed", json={"item_ids": []})
    assert resp.status_code == 422


# ---------- POST /sessions/{id}/review: loại mục đã xoá mềm ----------

def test_review_session_filters_out_reviewed_activities(monkeypatch):
    activities = [
        {
            "id": "a1", "type": "note", "slide": 3, "lesson": "Bài 3", "highlight": "x",
            "note": "chưa hiểu", "rating": 2, "created_at": "2026-01-01T00:00:00+00:00",
        },
    ]
    fake_db = _FakeDB({"activities": activities, "review_runs": []})
    monkeypatch.setattr(main, "get_client", lambda: fake_db)
    monkeypatch.setattr(
        main, "rank",
        lambda items, known: {"review_list": [], "excluded": [], "flags": [], "used_fallback": False},
    )

    client = TestClient(main.app)
    resp = client.post("/sessions/s1/review", json={"lesson_id": "l1"})

    assert resp.status_code == 200
    calls = fake_db.calls["activities"]
    assert ("is_", ("reviewed_at", "null"), {}) in calls
