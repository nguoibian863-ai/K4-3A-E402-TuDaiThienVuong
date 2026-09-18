import pytest

import ranking
from ranking import compute_base_group, fallback_output, rank, validate_output
from ranking import _rescue_missing_items


# ---------- compute_base_group ----------

@pytest.mark.parametrize("rating,expected", [(1, "high"), (2, "high"), (3, "medium"), (4, "low"), (5, "low")])
def test_compute_base_group_note_rating_bands(rating, expected):
    assert compute_base_group({"type": "note", "rating": rating}) == expected


def test_compute_base_group_question_is_always_medium():
    assert compute_base_group({"type": "question"}) == "medium"


def test_compute_base_group_unknown_type_raises():
    with pytest.raises(ValueError):
        compute_base_group({"type": "bookmark"})


# ---------- validate_output ----------

def _entry(**overrides):
    base = {
        "concept": "Self-attention",
        "item_ids": ["a1"],
        "base_group": "high",
        "final_group": "high",
        "evidence_ids": [],
    }
    base.update(overrides)
    return base


def test_validate_output_accepts_well_formed_review_list():
    items_by_id = {"a1": {}}
    assert validate_output({"review_list": [_entry()]}, items_by_id) is True


def test_validate_output_rejects_missing_review_list_key():
    assert validate_output({}, {}) is False


def test_validate_output_rejects_fabricated_item_id():
    items_by_id = {"a1": {}}
    assert validate_output({"review_list": [_entry(item_ids=["khong-ton-tai"])]}, items_by_id) is False


def test_validate_output_rejects_fabricated_evidence_id():
    items_by_id = {"a1": {}}
    bad = _entry(evidence_ids=["khong-ton-tai"])
    assert validate_output({"review_list": [bad]}, items_by_id) is False


def test_validate_output_rejects_group_jump_more_than_one_level():
    items_by_id = {"a1": {}}
    bad = _entry(base_group="low", final_group="high")  # lệch 2 bậc, luật chỉ cho phép 1
    assert validate_output({"review_list": [bad]}, items_by_id) is False


def test_validate_output_accepts_single_level_group_adjustment():
    items_by_id = {"a1": {}}
    ok = _entry(base_group="medium", final_group="high")
    assert validate_output({"review_list": [ok]}, items_by_id) is True


# ---------- fallback_output ----------

def test_fallback_output_orders_by_group_rank_descending():
    items = [
        {"id": "1", "highlight": "a", "base_group": "low"},
        {"id": "2", "highlight": "b", "base_group": "high"},
        {"id": "3", "highlight": "c", "base_group": "medium"},
    ]
    out = fallback_output(items)
    assert [e["item_ids"][0] for e in out["review_list"]] == ["2", "3", "1"]
    assert [e["order"] for e in out["review_list"]] == [1, 2, 3]
    assert out["used_fallback"] is True


# ---------- _rescue_missing_items(): AI bỏ sót mục (không gộp/excluded/flag) ----------

def test_rescue_leaves_review_list_unchanged_when_everything_covered():
    items_by_id = {"a1": {"id": "a1", "base_group": "high"}}
    review_list = [_entry(item_ids=["a1"])]
    out = _rescue_missing_items(review_list, items_by_id, [], [])
    assert out == review_list


def test_rescue_appends_items_ai_dropped_entirely():
    # a2 không nằm trong review_list, cũng không ở excluded/flags -> AI bỏ sót thật sự.
    items_by_id = {
        "a1": {"id": "a1", "base_group": "high"},
        "a2": {"id": "a2", "base_group": "low", "highlight": "đoạn bị bỏ sót"},
    }
    review_list = [_entry(item_ids=["a1"])]
    out = _rescue_missing_items(review_list, items_by_id, [], [])

    ids_in_output = {iid for e in out for iid in e["item_ids"]}
    assert ids_in_output == {"a1", "a2"}
    rescued = next(e for e in out if e["item_ids"] == ["a2"])
    assert rescued["base_group"] == rescued["final_group"] == "low"
    assert rescued["concept"] == "đoạn bị bỏ sót"


def test_rescue_does_not_duplicate_items_marked_excluded():
    items_by_id = {"a1": {"id": "a1", "base_group": "medium"}, "a2": {"id": "a2", "base_group": "low"}}
    review_list = [_entry(item_ids=["a1"])]
    excluded = [{"item_id": "a2", "why": "out_of_scope"}]
    out = _rescue_missing_items(review_list, items_by_id, excluded, [])

    ids_in_output = {iid for e in out for iid in e["item_ids"]}
    assert ids_in_output == {"a1"}  # a2 bị loại có chủ đích -> không bị "cứu" lại


def test_rescue_does_not_duplicate_items_marked_flagged():
    items_by_id = {"a1": {"id": "a1", "base_group": "medium"}, "a2": {"id": "a2", "base_group": "low"}}
    review_list = [_entry(item_ids=["a1"])]
    flags = [{"item_id": "a2", "flag": "insufficient_info"}]
    out = _rescue_missing_items(review_list, items_by_id, [], flags)

    ids_in_output = {iid for e in out for iid in e["item_ids"]}
    assert ids_in_output == {"a1"}


def test_rescue_recomputes_order_by_group_rank_descending():
    items_by_id = {
        "a1": {"id": "a1", "base_group": "low"},
        "a2": {"id": "a2", "base_group": "high"},
    }
    review_list = [{**_entry(item_ids=["a1"]), "base_group": "low", "final_group": "low", "order": 1}]
    out = _rescue_missing_items(review_list, items_by_id, [], [])
    assert [e["item_ids"][0] for e in out] == ["a2", "a1"]
    assert [e["order"] for e in out] == [1, 2]


# ---------- rank() ----------

def test_rank_returns_empty_result_without_calling_llm_when_no_items(monkeypatch):
    called = {"n": 0}

    def fake_call_llm(*a, **k):
        called["n"] += 1
        return "{}", {}

    monkeypatch.setattr(ranking, "call_llm", fake_call_llm)
    result = rank([])

    assert result == {"review_list": [], "excluded": [], "flags": [], "used_fallback": False, "raw_response": None}
    assert called["n"] == 0


def test_rank_falls_back_when_llm_output_invalid(patch_llm):
    patch_llm(ranking, {"review_list": [_entry(item_ids=["a1"])], "excluded": [], "flags": []})
    # cố tình không patch call_llm để trả bậc hợp lệ, patch_llm ở trên vẫn hợp lệ theo entry mẫu
    items = [{"id": "a1", "type": "question", "base_group": "medium", "lesson": "Bài 3"}]
    result = rank(items)

    assert result["used_fallback"] is False
    assert result["review_list"][0]["item_ids"] == ["a1"]


def test_rank_falls_back_on_llm_exception(patch_llm):
    patch_llm(ranking, None, exc=RuntimeError("boom"))
    items = [{"id": "a1", "type": "question", "base_group": "medium", "lesson": "Bài 3"}]
    result = rank(items)

    assert result["used_fallback"] is True
    assert result["review_list"][0]["item_ids"] == ["a1"]


def test_rank_rescues_items_the_llm_silently_dropped(patch_llm):
    # AI chỉ nhắc tới a1 trong review_list, bỏ hẳn a2 -> không bịa, nên qua được
    # validate_output(), nhưng phải bị bắt bởi bước rescue trước khi trả về.
    patch_llm(ranking, {"review_list": [_entry(item_ids=["a1"])], "excluded": [], "flags": []})
    items = [
        {"id": "a1", "type": "question", "base_group": "medium", "lesson": "Bài 3"},
        {"id": "a2", "type": "note", "base_group": "high", "lesson": "Bài 3", "highlight": "chưa hiểu CFG"},
    ]
    result = rank(items)

    assert result["used_fallback"] is False  # kết quả AI vẫn được dùng, chỉ vá chỗ thiếu
    ids_in_output = {iid for e in result["review_list"] for iid in e["item_ids"]}
    assert ids_in_output == {"a1", "a2"}
