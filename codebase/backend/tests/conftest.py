import pytest


@pytest.fixture
def patch_llm(monkeypatch):
    """Thay call_llm bằng hàm giả, tránh test gọi OpenAI thật.

    Dùng: patch_llm(chat, {"intent": "answer", "reply": "..."})
    `module` là module đã làm `from llm import call_llm` (chat, explain, ranking, feynman...).
    """

    def _patch(module, parsed, raw=None, exc=None):
        def fake_call_llm(system_prompt, payload, temperature=None, turns=None):
            if exc is not None:
                raise exc
            return raw if raw is not None else "{}", parsed

        monkeypatch.setattr(module, "call_llm", fake_call_llm)

    return _patch


@pytest.fixture
def sample_slides():
    """Bộ slide tổng hợp nhỏ, không phụ thuộc file data/ thật — giữ test xác định."""
    return {
        1: "Midjourney và DALL-E 3 là hai công cụ sinh ảnh phổ biến dùng prompt mô tả chi tiết.",
        2: (
            "Cơ chế bên trong: mô hình học cách khử nhiễu dần dần qua nhiều bước lặp để "
            "tái tạo ảnh gốc từ nhiễu ngẫu nhiên."
        ),
        3: "ComfyUI là giao diện dạng node giúp người dùng tự dựng pipeline sinh ảnh.",
        4: "CFG (Classifier-Free Guidance) điều chỉnh mức độ bám theo prompt khi sinh ảnh.",
        5: "LoRA là kỹ thuật tinh chỉnh nhẹ mô hình sinh ảnh cho phong cách riêng.",
    }
