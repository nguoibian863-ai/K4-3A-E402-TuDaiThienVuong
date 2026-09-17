"""Nguồn grounding cho bước 5 (EVIDENCE CHECK) — plan mục 3.5 và 4.5.

Nạp nội dung slide dạng text để AI chỉ được trích dẫn thứ có thật, và để code kiểm
lại mọi citation trước khi trả về UI (plan mục 7: "Chỉ trích từ slide đã nạp; kiểm
tra khớp chuỗi").

Định dạng file: mỗi slide mở đầu bằng một dòng `=== SLIDE <n> ===`, giống
`data/slides_content.txt` sẵn có trong repo.
"""

import math
import os
import re
import unicodedata
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
SLIDE_HEADER = re.compile(r"^===\s*SLIDE\s+(\d+)\s*===\s*$", re.I)

# Số ký tự tối thiểu của một trích dẫn — chặn AI "trích" vài chữ vô nghĩa để lách kiểm tra
MIN_QUOTE_CHARS = 12
# Ngưỡng khớp khi so chuỗi đã chuẩn hoá (text rút từ PDF hay dính lỗi xuống dòng, thừa dấu cách)
FUZZY_RATIO = 0.90


def _normalize(text: str) -> str:
    """Bỏ khác biệt vô nghĩa giữa lời AI trích và text gốc: hoa/thường, dấu câu, xuống dòng."""
    text = unicodedata.normalize("NFC", text or "").lower()
    text = re.sub(r"[^\w\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _slides_path(lesson_id: str | None = None) -> Path | None:
    """Ưu tiên file khai báo qua env, sau đó tới file theo lesson_id, cuối cùng là file mặc định."""
    env = os.getenv("SLIDES_TEXT_PATH")
    candidates = []
    if env:
        candidates.append(Path(env))
    if lesson_id:
        candidates.append(DATA_DIR / f"slides_{lesson_id}.txt")
    candidates.append(DATA_DIR / "slides_content.txt")
    for path in candidates:
        if path.is_file():
            return path
    return None


def load_slides(lesson_id: str | None = None) -> dict[int, str]:
    """Trả {số slide: nội dung}. Không có file thì trả {} — bước 5 tự chuyển sang
    'không đủ bằng chứng' thay vì để AI bịa."""
    path = _slides_path(lesson_id)
    if path is None:
        return {}
    slides: dict[int, str] = {}
    current: int | None = None
    buffer: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        header = SLIDE_HEADER.match(line)
        if header:
            if current is not None:
                slides[current] = "\n".join(buffer).strip()
            current = int(header.group(1))
            buffer = []
        elif current is not None:
            buffer.append(line)
    if current is not None:
        slides[current] = "\n".join(buffer).strip()
    return {n: body for n, body in slides.items() if body}


def _contains(haystack: str, needle: str) -> bool:
    if needle in haystack:
        return True
    # Text rút từ PDF hay vỡ chữ giữa chừng -> so theo cửa sổ từ, chấp nhận lệch nhỏ
    from difflib import SequenceMatcher

    words_h, words_n = haystack.split(), needle.split()
    if not words_n or len(words_n) > len(words_h):
        return False
    for i in range(len(words_h) - len(words_n) + 1):
        window = " ".join(words_h[i : i + len(words_n)])
        if SequenceMatcher(None, window, needle).ratio() >= FUZZY_RATIO:
            return True
    return False


def find_quote(quote: str, slides: dict[int, str]) -> int | None:
    """Trích dẫn này nằm ở slide nào? None = không có trong tài liệu đã nạp."""
    needle = _normalize(quote)
    if len(needle) < MIN_QUOTE_CHARS:
        return None
    for number, body in sorted(slides.items()):
        if _contains(_normalize(body), needle):
            return number
    return None


def verify_citation(slide, quote: str, slides: dict[int, str]) -> tuple[bool, int | None]:
    """Kiểm một citation của AI. Trả (hợp lệ, số slide thật).

    Hợp lệ khi trích dẫn có thật; nếu AI ghi nhầm số slide nhưng câu trích có thật thì
    trả về số slide đúng để UI hiện đúng nguồn, thay vì vứt cả nhận định đi.
    """
    if not slides or not quote or not quote.strip():
        return False, None
    found = find_quote(quote, slides)
    if found is None:
        return False, None
    if isinstance(slide, int) and not isinstance(slide, bool) and slide == found:
        return True, found
    return True, found


# Từ quá phổ thông thì có mặt ở mọi slide -> không giúp phân biệt slide nào liên quan
STOPWORDS = {
    "là", "và", "của", "cho", "có", "một", "các", "những", "được", "với", "thì", "mà",
    "này", "đó", "khi", "nếu", "trong", "trên", "về", "từ", "đến", "hay", "hoặc", "như",
    "để", "sẽ", "đã", "rất", "cũng", "không", "phải", "ta", "ở", "ra", "vào", "theo",
    "the", "a", "an", "of", "to", "in", "is", "are", "and", "or", "for", "on",
    # Từ để hỏi và từ chức năng. Thiếu nhóm này thì "gì" / "thế nào" trở thành từ hiếm và
    # được chọn làm thuật ngữ neo, kéo nhầm mấy slide có tiêu đề dạng câu hỏi lên đầu.
    "gì", "thế", "nào", "sao", "đâu", "ai", "bao", "nhiêu", "mấy", "chưa", "rồi",
    "nên", "cần", "dùng", "làm", "việc", "cái", "thứ", "điều", "nó", "mình", "bạn",
    "em", "thầy", "cô", "tôi", "chúng", "họ", "ý", "chỗ", "phần", "lúc", "vẫn", "còn",
    "nhưng", "vì", "do", "bởi", "nữa", "chỉ", "đều", "hơn", "nhất", "quá", "lắm",
}
MIN_TOKEN_LEN = 2
# Từ có mặt ở quá tỷ lệ này của bộ slide thì coi như không mang thông tin phân biệt
COMMON_TERM_RATIO = 0.5
# Mức ghìm độ dài kiểu BM25 (0 = bỏ qua độ dài, 1 = chia thẳng cho độ dài)
LENGTH_NORM = 0.5
# Từ hiếm hơn tỷ lệ này mới được coi là thuật ngữ neo của câu hỏi
KEY_TERM_RATIO = 0.3


def _tokens(text: str) -> list[str]:
    return [w for w in _normalize(text).split() if len(w) >= MIN_TOKEN_LEN and w not in STOPWORDS]


def relevant_slides(
    query: str, slides: dict[int, str], k: int = 10, anchor: str | None = None
) -> dict[int, str]:
    """Chọn k slide liên quan nhất tới câu người học vừa nói.

    Bộ slide đầy đủ (100 trang ~ 40k ký tự) mà nhét hết vào prompt thì vừa tốn token vừa
    loãng: đoạn cần trích chìm giữa 99 trang không liên quan. Chấm điểm bằng trùng lặp từ
    có trọng số nghịch đảo tần suất — từ hiếm (CFG, ComfyUI) nặng hơn từ chung chung.
    """
    query_tokens = set(_tokens(query))
    if not query_tokens or not slides:
        return dict(sorted(slides.items())[:k])

    slide_tokens = {n: set(_tokens(b)) for n, b in slides.items()}
    total = len(slide_tokens) or 1
    avg_len = (sum(len(t) for t in slide_tokens.values()) / total) or 1

    # Đếm trước số slide chứa mỗi từ, thay vì quét lại bộ slide cho từng từ của từng slide
    doc_freq: dict[str, int] = {}
    for tokens in slide_tokens.values():
        for term in query_tokens & tokens:
            doc_freq[term] = doc_freq.get(term, 0) + 1

    scores: dict[int, float] = {}
    for number, tokens in slide_tokens.items():
        score = 0.0
        for term in query_tokens & tokens:
            df = doc_freq.get(term, 1)
            # Từ có mặt ở quá nửa bộ slide thì không phân biệt được gì, bỏ qua
            if df > total * COMMON_TERM_RATIO:
                continue
            # Bình phương idf: một từ khoá hiếm (LoRA, ComfyUI) phải thắng được cả chùm từ
            # chung chung. Không bình phương thì slide trùng 8 từ phổ thông vẫn xếp trên
            # slide trùng đúng cái thuật ngữ đang hỏi.
            score += math.log(total / df) ** 2
        if score > 0:
            # Chuẩn hoá độ dài kiểu BM25: ghìm slide dài lê thê, nhưng KHÔNG thổi slide
            # ngắn lên. Chia thẳng cho sqrt(độ dài) thì mấy slide bìa 2 dòng leo lên đầu.
            norm = 1 - LENGTH_NORM + LENGTH_NORM * (len(tokens) / avg_len)
            scores[number] = score / (norm or 1)

    if not scores:
        return dict(sorted(slides.items())[:k])

    # Slide nói về đúng khái niệm đang xét phải được xếp trước. Nếu để tự đoán từ neo bằng
    # "từ hiếm nhất trong câu", nó chọn nhầm những từ lẻ như "cứng" trong "ổ cứng" rồi kéo
    # lên các slide chẳng liên quan — nên khi biết tên khái niệm thì lấy thẳng làm neo.
    anchor_terms = set(_tokens(anchor)) if anchor else set()
    if not anchor_terms and doc_freq:
        rarest = min(doc_freq, key=doc_freq.get)
        if doc_freq[rarest] <= total * KEY_TERM_RATIO:
            anchor_terms = {rarest}
    anchored = {
        n for n, t in slide_tokens.items()
        if anchor_terms & t and any(doc_freq.get(w, total) <= total * KEY_TERM_RATIO for w in anchor_terms & t)
    }
    ranked = sorted(scores, key=lambda n: (n not in anchored, -scores[n], n))[:k]
    return {n: slides[n] for n in sorted(ranked)}


def context_for_prompt(slides: dict[int, str], limit_chars: int = 12000) -> list[dict]:
    """Nội dung slide nạp vào prompt để AI đối chiếu (plan mục 4.2: AI chỉ lấy slide làm chuẩn)."""
    out, used = [], 0
    for number, body in sorted(slides.items()):
        body = re.sub(r"\s+", " ", body).strip()
        if used + len(body) > limit_chars:
            break
        out.append({"slide": number, "text": body})
        used += len(body)
    return out
