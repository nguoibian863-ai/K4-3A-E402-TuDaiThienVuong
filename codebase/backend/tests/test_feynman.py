import feynman
from feynman import session_summary, student_reply


def test_student_reply_valid_output_passes_through(patch_llm):
    patch_llm(feynman, {
        "reply": "Vì sao lại như vậy?",
        "feedback_type": "deeper_question",
        "understanding": "partial",
    })
    result = student_reply("Self-attention", [], [], "Self-attention dùng Q, K, V")

    assert result["reply"] == "Vì sao lại như vậy?"
    assert result["used_fallback"] is False


def test_student_reply_hint_feedback_forces_weak_understanding(patch_llm):
    # Luật nghiệp vụ: gợi ý (hint) nghĩa là giáo viên chưa giảng được ý nào -> ép "weak"
    # dù model tự chấm "understanding" là gì khác.
    patch_llm(feynman, {
        "reply": "Gợi ý: nghĩ về vai trò của Query.",
        "feedback_type": "hint",
        "understanding": "good",
    })
    result = student_reply("Self-attention", [], [], "giải thích lung tung")

    assert result["understanding"] == "weak"


def test_student_reply_invalid_feedback_type_falls_back(patch_llm):
    patch_llm(feynman, {"reply": "ok", "feedback_type": "khong_hop_le", "understanding": "good"})
    result = student_reply("Self-attention", [], [], "message")

    assert result["used_fallback"] is True


def test_student_reply_llm_exception_falls_back(patch_llm):
    patch_llm(feynman, None, exc=RuntimeError("boom"))
    result = student_reply("Self-attention", [], [], "message")

    assert result["used_fallback"] is True


def test_session_summary_valid_output_passes_through(patch_llm):
    patch_llm(feynman, {
        "understood": ["Query/Key/Value"],
        "need_review": ["Positional encoding"],
        "suggested_rating": 4,
        "reason": "Giải thích đúng trọng tâm.",
    })
    result = session_summary("Self-attention", [], [])

    assert result["suggested_rating"] == 4
    assert result["used_fallback"] is False


def test_session_summary_rating_out_of_range_falls_back(patch_llm):
    patch_llm(feynman, {
        "understood": [], "need_review": [], "suggested_rating": 9, "reason": "sai phạm vi",
    })
    result = session_summary("Self-attention", [], [])

    assert result["used_fallback"] is True
    assert result["suggested_rating"] is None


def test_to_turns_maps_student_role_to_assistant():
    turns = feynman._to_turns([
        {"role": "teacher", "content": "giảng bài"},
        {"role": "student", "content": "AI hỏi lại"},
    ])
    assert turns == [
        {"role": "user", "content": "giảng bài"},
        {"role": "assistant", "content": "AI hỏi lại"},
    ]
