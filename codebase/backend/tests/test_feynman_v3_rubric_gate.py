"""Test cho ngưỡng "có thể chuyển tiếp" sau khi chấm rubric bước 8 (giảng lại).

Viết TRƯỚC khi implement `decide_next_step()` và việc nối nó vào `rubric_score()` —
các test này phải đỏ (lỗi import / thiếu khoá "next_step") cho tới khi code được thêm.

Ngưỡng đã chốt với người dùng: total (0-16, tổng 4 chiều) >= 10 VÀ accuracy = 4 (tuyệt
đối, không cho 3 chiều còn lại bù vào) thì mới coi là "đã hiểu, có thể chuyển tiếp".
"""

import feynman_v3
from feynman_v3 import RUBRIC_DIMENSIONS, decide_next_step, rubric_score


def _scores(coverage=4, accuracy=4, depth=4, own_words=4, total=None):
    out = {"coverage": coverage, "accuracy": accuracy, "depth": depth, "own_words": own_words}
    out["total"] = total if total is not None else sum(out.values())
    return out


# ---------- decide_next_step() ----------

def test_advances_when_total_and_accuracy_both_meet_threshold():
    result = decide_next_step(_scores(coverage=2, accuracy=4, depth=2, own_words=2))  # total=10
    assert result["can_advance"] is True


def test_advances_when_scores_are_well_above_threshold():
    result = decide_next_step(_scores(coverage=4, accuracy=4, depth=4, own_words=4))  # total=16
    assert result["can_advance"] is True


def test_blocks_when_total_below_threshold_even_with_perfect_accuracy():
    # total=9: coverage=2, accuracy=4, depth=2, own_words=1 -> đúng 1 điểm dưới ngưỡng
    result = decide_next_step(_scores(coverage=2, accuracy=4, depth=2, own_words=1))
    assert result["can_advance"] is False


def test_blocks_when_accuracy_below_max_even_with_high_total():
    # Đây là điều kiện quan trọng nhất: tổng điểm cao (15/16) không được phép bù cho
    # accuracy thiếu 1 điểm (còn hiểu lầm) -> vẫn phải chặn, chống false positive.
    result = decide_next_step(_scores(coverage=4, accuracy=3, depth=4, own_words=4))  # total=15
    assert result["can_advance"] is False


def test_boundary_exact_threshold_both_sides():
    # total=10 & accuracy=4 (biên dưới, bao gồm) -> qua
    assert decide_next_step(_scores(coverage=1, accuracy=4, depth=1, own_words=4))["can_advance"] is True
    # total=9 (ngay dưới biên) -> không qua
    assert decide_next_step(_scores(coverage=1, accuracy=4, depth=1, own_words=3))["can_advance"] is False


def test_message_reflects_advance_decision():
    advance = decide_next_step(_scores(coverage=4, accuracy=4, depth=4, own_words=4))
    review = decide_next_step(_scores(coverage=1, accuracy=1, depth=1, own_words=1))
    assert "chuyển" in advance["message"].lower()
    assert "ôn thêm" in review["message"].lower()


# ---------- rubric_score(): nối decide_next_step() vào kết quả cho explanation_2 ----------

def _valid_rubric_payload(**explanation_2_overrides):
    e2 = {"coverage": 4, "accuracy": 4, "depth": 4, "own_words": 4}
    e2.update(explanation_2_overrides)
    return {
        "explanation_1": {"coverage": 1, "accuracy": 1, "depth": 1, "own_words": 1},
        "explanation_2": e2,
        "misconceptions_1": ["chưa phân biệt được Query và Key"],
        "misconceptions_2": [],
    }


def test_rubric_score_includes_next_step_for_explanation_2(patch_llm):
    patch_llm(feynman_v3, _valid_rubric_payload())  # e2 toàn 4 -> total=16, accuracy=4
    result = rubric_score("Self-attention", {1: "nội dung slide"}, "giải thích lần 1", "giải thích lần 2")

    assert result["used_fallback"] is False
    assert result["next_step"]["can_advance"] is True


def test_rubric_score_next_step_blocks_on_low_explanation_2_score(patch_llm):
    patch_llm(feynman_v3, _valid_rubric_payload(coverage=1, accuracy=2, depth=1, own_words=1))  # total=5
    result = rubric_score("Self-attention", {1: "nội dung slide"}, "giải thích lần 1", "giải thích lần 2")

    assert result["next_step"]["can_advance"] is False


def test_rubric_score_next_step_is_none_when_llm_fails(patch_llm):
    patch_llm(feynman_v3, None, exc=RuntimeError("boom"))
    result = rubric_score("Self-attention", {1: "nội dung slide"}, "giải thích lần 1", "giải thích lần 2")

    assert result["used_fallback"] is True
    assert result.get("next_step") is None


def test_rubric_dimensions_constant_matches_scores_used_in_tests():
    # Test tự-kiểm: đảm bảo bộ khoá dùng trong test khớp đúng hằng số thật của module,
    # tránh test "giả xanh" nếu sau này ai đổi tên 1 chiều mà quên sửa test.
    assert set(RUBRIC_DIMENSIONS) == {"coverage", "accuracy", "depth", "own_words"}
