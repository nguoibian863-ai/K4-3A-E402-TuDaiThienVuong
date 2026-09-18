import embeddings
from embeddings import _cosine, _slides_key, embed_slides, semantic_relevant_slides


def test_slides_key_is_stable_regardless_of_dict_order():
    a = {1: "một", 2: "hai"}
    b = {2: "hai", 1: "một"}
    assert _slides_key(a) == _slides_key(b)


def test_slides_key_changes_when_content_changes():
    a = {1: "một"}
    b = {1: "một khác"}
    assert _slides_key(a) != _slides_key(b)


def test_cosine_identical_vectors_is_one():
    assert _cosine([1.0, 0.0], [1.0, 0.0]) == 1.0


def test_cosine_orthogonal_vectors_is_zero():
    assert _cosine([1.0, 0.0], [0.0, 1.0]) == 0.0


def test_cosine_zero_vector_does_not_divide_by_zero():
    assert _cosine([0.0, 0.0], [1.0, 0.0]) == 0.0


def test_embed_slides_caches_by_content_and_calls_embed_api_once(monkeypatch):
    calls = []

    def fake_embed(texts):
        calls.append(list(texts))
        return [[float(len(t)), 0.0] for t in texts]

    monkeypatch.setattr(embeddings, "_embed", fake_embed)
    slides = {1: "abc", 2: "de"}

    first = embed_slides(slides)
    second = embed_slides(dict(slides))  # dict khác nhưng cùng nội dung -> vẫn hit cache

    assert first == second
    assert len(calls) == 1  # chỉ gọi API 1 lần nhờ cache theo _slides_key


def test_semantic_relevant_slides_ranks_by_cosine_similarity(monkeypatch):
    slides = {1: "gần", 2: "xa", 3: "gần nhất"}

    def fake_embed(texts):
        vectors = {"truy vấn": [1.0, 0.0], "gần": [0.9, 0.1], "xa": [0.0, 1.0], "gần nhất": [1.0, 0.0]}
        return [vectors[t] for t in texts]

    monkeypatch.setattr(embeddings, "_embed", fake_embed)
    result = semantic_relevant_slides("truy vấn", slides, k=2)

    assert list(result) == [1, 3]  # 2 slide gần hướng vector truy vấn nhất, bỏ slide 2 (xa)


def test_semantic_relevant_slides_returns_empty_on_api_error(monkeypatch):
    def boom(texts):
        raise RuntimeError("hết quota")

    monkeypatch.setattr(embeddings, "_embed", boom)
    assert semantic_relevant_slides("bất kỳ câu hỏi nào", {1: "nội dung"}, k=1) == {}


def test_semantic_relevant_slides_empty_inputs_short_circuit(monkeypatch):
    def must_not_be_called(texts):
        raise AssertionError("không nên gọi API khi slides rỗng hoặc query rỗng")

    monkeypatch.setattr(embeddings, "_embed", must_not_be_called)
    assert semantic_relevant_slides("câu hỏi", {}, k=1) == {}
    assert semantic_relevant_slides("   ", {1: "nội dung"}, k=1) == {}
