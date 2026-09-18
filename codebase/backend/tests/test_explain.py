import explain
from explain import explain as run_explain


def test_explain_empty_highlight_is_rejected_before_calling_llm(patch_llm):
    patch_llm(explain, {"answer": "không nên tới đây", "status": "answered"})
    result = run_explain("", "câu hỏi bất kỳ", "Bài 3")

    assert result["status"] == "insufficient_context"
    assert result["used_fallback"] is False


def test_explain_valid_response_passes_through(patch_llm):
    patch_llm(explain, {"answer": "Giải thích ngắn gọn.", "status": "answered"}, raw="{raw}")
    result = run_explain("đoạn bôi đen", "câu hỏi", "Bài 3")

    assert result["answer"] == "Giải thích ngắn gọn."
    assert result["status"] == "answered"
    assert result["used_fallback"] is False
    assert result["raw_response"] == "{raw}"


def test_explain_out_of_scope_status_is_kept(patch_llm):
    patch_llm(explain, {"answer": "Không liên quan đoạn đã bôi đen.", "status": "out_of_scope"})
    result = run_explain("đoạn bôi đen", "câu hỏi lạc đề", "Bài 3")

    assert result["status"] == "out_of_scope"


def test_explain_invalid_status_falls_back(patch_llm):
    patch_llm(explain, {"answer": "ok", "status": "khong_hop_le"})
    result = run_explain("đoạn bôi đen", "câu hỏi", "Bài 3")

    assert result["used_fallback"] is True


def test_explain_empty_answer_falls_back(patch_llm):
    patch_llm(explain, {"answer": "  ", "status": "answered"})
    result = run_explain("đoạn bôi đen", "câu hỏi", "Bài 3")

    assert result["used_fallback"] is True


def test_explain_llm_exception_falls_back(patch_llm):
    patch_llm(explain, None, exc=RuntimeError("network lỗi"))
    result = run_explain("đoạn bôi đen", "câu hỏi", "Bài 3")

    assert result["used_fallback"] is True
    assert result["raw_response"] is None


def test_to_turns_pairs_question_and_answer_as_user_assistant():
    turns = explain._to_turns([{"question": "hỏi 1", "answer": "đáp 1"}])
    assert turns == [
        {"role": "user", "content": "hỏi 1"},
        {"role": "assistant", "content": "đáp 1"},
    ]
