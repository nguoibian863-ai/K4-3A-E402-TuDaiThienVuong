from pathlib import Path

import pytest

from slides import (
    context_for_prompt,
    find_quote,
    load_slides,
    relevant_slides,
    verify_citation,
)


# ---------- load_slides ----------

def test_load_slides_parses_slide_headers(tmp_path, monkeypatch):
    text = "=== SLIDE 1 ===\nNoi dung trang 1\n=== SLIDE 2 ===\nNoi dung trang 2\ndong 2"
    (tmp_path / "slides_content.txt").write_text(text, encoding="utf-8")
    monkeypatch.setattr("slides.DATA_DIR", tmp_path)

    slides = load_slides()

    assert slides == {1: "Noi dung trang 1", 2: "Noi dung trang 2\ndong 2"}


def test_load_slides_skips_empty_slides(tmp_path, monkeypatch):
    text = "=== SLIDE 1 ===\n\n=== SLIDE 2 ===\nCo noi dung"
    (tmp_path / "slides_content.txt").write_text(text, encoding="utf-8")
    monkeypatch.setattr("slides.DATA_DIR", tmp_path)

    assert load_slides() == {2: "Co noi dung"}


def test_load_slides_missing_file_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("slides.DATA_DIR", tmp_path)

    assert load_slides() == {}
    assert load_slides("bat-ky-lesson-id-nao") == {}


def test_load_slides_prefers_lesson_specific_file(tmp_path, monkeypatch):
    (tmp_path / "slides_content.txt").write_text(
        "=== SLIDE 1 ===\nBo mac dinh", encoding="utf-8"
    )
    (tmp_path / "slides_abc123.txt").write_text(
        "=== SLIDE 1 ===\nBo rieng cua bai abc123", encoding="utf-8"
    )
    monkeypatch.setattr("slides.DATA_DIR", tmp_path)

    assert load_slides("abc123")[1] == "Bo rieng cua bai abc123"
    assert load_slides("khong-ton-tai")[1] == "Bo mac dinh"


# ---------- find_quote / verify_citation ----------

def test_find_quote_exact_match(sample_slides):
    quote = "ComfyUI là giao diện dạng node giúp người dùng tự dựng pipeline sinh ảnh."
    assert find_quote(quote, sample_slides) == 3


def test_find_quote_ignores_case_and_whitespace(sample_slides):
    quote = "COMFYUI   LÀ GIAO DIỆN   dạng node"
    assert find_quote(quote, sample_slides) == 3


def test_find_quote_tolerates_small_typo_via_fuzzy_match(sample_slides):
    # "khử nhiễu" -> "khu nhiễu" (mất dấu 1 ký tự): không khớp chuỗi tuyệt đối nhưng đủ
    # giống (>= FUZZY_RATIO) để _contains() nhận qua nhánh so khớp theo cửa sổ từ.
    quote = "mô hình học cách khu nhiễu dần dần qua nhiều bước lặp"
    assert find_quote(quote, sample_slides) == 2


def test_find_quote_not_in_any_slide_returns_none(sample_slides):
    assert find_quote("một câu hoàn toàn không có trong slide nào cả", sample_slides) is None


def test_find_quote_too_short_returns_none(sample_slides):
    assert find_quote("LoRA", sample_slides) is None  # dưới MIN_QUOTE_CHARS


def test_verify_citation_valid_and_correct_slide(sample_slides):
    quote = "CFG (Classifier-Free Guidance) điều chỉnh mức độ bám theo prompt"
    ok, slide = verify_citation(4, quote, sample_slides)
    assert ok is True
    assert slide == 4


def test_verify_citation_valid_but_ai_named_wrong_slide(sample_slides):
    # AI trích đúng câu nhưng ghi nhầm số trang -> vẫn hợp lệ, trả về số trang thật để UI sửa.
    quote = "CFG (Classifier-Free Guidance) điều chỉnh mức độ bám theo prompt"
    ok, slide = verify_citation(1, quote, sample_slides)
    assert ok is True
    assert slide == 4


def test_verify_citation_fabricated_quote_is_rejected(sample_slides):
    ok, slide = verify_citation(2, "câu này AI bịa ra, không có thật trong slide", sample_slides)
    assert ok is False
    assert slide is None


def test_verify_citation_empty_slides_always_rejects():
    ok, slide = verify_citation(1, "bất kỳ câu nào đủ dài để qua ngưỡng tối thiểu", {})
    assert ok is False
    assert slide is None


# ---------- relevant_slides ----------

def test_relevant_slides_ranks_rare_anchor_term_first(sample_slides):
    result = relevant_slides("LoRA là gì và dùng để làm gì", sample_slides, k=1)
    assert list(result) == [5]


def test_relevant_slides_respects_k_limit(sample_slides):
    result = relevant_slides("sinh ảnh bằng prompt", sample_slides, k=2)
    assert len(result) == 2


def test_relevant_slides_empty_query_returns_first_k_by_page_order(sample_slides):
    result = relevant_slides("", sample_slides, k=3)
    assert list(result) == [1, 2, 3]


def test_relevant_slides_common_term_across_all_slides_does_not_dominate():
    # "sinh ảnh" xuất hiện ở > COMMON_TERM_RATIO số slide -> bị loại khỏi điểm số, không
    # được để từ phổ thông này kéo slide sai lên đầu thay vì thuật ngữ hiếm ("lora").
    slides = {
        1: "Giới thiệu chung về sinh ảnh bằng AI.",
        2: "Các bước sinh ảnh cơ bản với công cụ phổ biến.",
        3: "LoRA là kỹ thuật tinh chỉnh nhẹ dùng khi sinh ảnh.",
    }
    result = relevant_slides("lora dùng để sinh ảnh sao", slides, k=1)
    assert list(result) == [3]


def test_relevant_slides_full_vocabulary_mismatch_without_semantic_fallback_uses_page_order(sample_slides):
    """Hành vi mặc định (không tiêm semantic_fallback) giữ nguyên như trước fix #2: khi câu
    hỏi dùng từ khoá hoàn toàn không xuất hiện nguyên văn trong bất kỳ slide nào (ví dụ học
    viên hỏi bằng thuật ngữ tiếng Anh "denoising steps" trong khi slide 2 diễn giải cùng khái
    niệm bằng tiếng Việt "khử nhiễu ... bước lặp"), hàm không tìm được overlap nên rơi vào
    "trả về k slide đầu theo số trang" — TRẢ VỀ SLIDE SAI (slide 1, mở đầu) thay vì slide 2
    (nội dung thực sự liên quan). Module slides.py cố tình không tự gọi OpenAI để giữ thuần;
    đây là lý do cần semantic_fallback (xem test bên dưới).
    """
    result = relevant_slides("diffusion denoising steps là gì", sample_slides, k=1)
    assert list(result) == [1]
    assert 2 not in result  # slide đúng bị bỏ lỡ


def test_relevant_slides_uses_semantic_fallback_when_keywords_fully_mismatch(sample_slides):
    """Fix #2: khi so trùng từ khoá không ra gì, hàm gọi semantic_fallback(query, slides, k)
    và dùng kết quả đó thay vì rơi về "k slide đầu theo số trang". slides.py không tự biết
    gì về embedding — chỉ gọi đúng callable được tiêm vào, nên test này dùng 1 hàm giả xác
    định để không phụ thuộc OpenAI thật.
    """
    def fake_semantic_fallback(query, slides, k):
        assert query == "diffusion denoising steps là gì"
        assert k == 1
        return {2: slides[2]}

    result = relevant_slides(
        "diffusion denoising steps là gì", sample_slides, k=1, semantic_fallback=fake_semantic_fallback,
    )
    assert list(result) == [2]


def test_relevant_slides_ignores_semantic_fallback_when_keyword_scores_already_found(sample_slides):
    # semantic_fallback chỉ nên dùng khi keyword-match rỗng, không phải để "ghi đè" kết quả
    # đã có -> nếu gọi nhầm ở đây thì test hỏng, chứng minh nó không được gọi.
    def must_not_be_called(query, slides, k):
        raise AssertionError("semantic_fallback không nên được gọi khi đã có keyword match")

    result = relevant_slides("LoRA là gì", sample_slides, k=1, semantic_fallback=must_not_be_called)
    assert list(result) == [5]


def test_relevant_slides_falls_back_to_page_order_when_semantic_fallback_returns_nothing(sample_slides):
    # API embedding có thể lỗi/hết quota -> semantic_relevant_slides() thật trả {} (xem
    # test_embeddings.py); relevant_slides() phải rơi về hành vi cũ, không để lỗi lan lên.
    result = relevant_slides(
        "diffusion denoising steps là gì", sample_slides, k=1, semantic_fallback=lambda q, s, k: {},
    )
    assert list(result) == [1]


# ---------- context_for_prompt ----------

def test_context_for_prompt_keeps_slide_order_and_text():
    slides = {2: "Nội dung trang 2", 1: "Nội dung trang 1"}
    out = context_for_prompt(slides, limit_chars=1000)
    assert out == [
        {"slide": 1, "text": "Nội dung trang 1"},
        {"slide": 2, "text": "Nội dung trang 2"},
    ]


def test_context_for_prompt_drops_slides_beyond_char_budget():
    slides = {1: "a" * 5000, 2: "b" * 5000, 3: "c" * 5000}
    out = context_for_prompt(slides, limit_chars=8000)
    # slide 1 (5000) lọt; slide 1+2 (10000) vượt ngân sách -> dừng lại, bỏ hẳn slide 2 và 3
    # dù chúng đã được relevant_slides() chọn là liên quan.
    assert [s["slide"] for s in out] == [1]


def test_context_for_prompt_collapses_internal_whitespace():
    out = context_for_prompt({1: "dòng một\n\n  dòng hai\tcó tab"}, limit_chars=1000)
    assert out[0]["text"] == "dòng một dòng hai có tab"
