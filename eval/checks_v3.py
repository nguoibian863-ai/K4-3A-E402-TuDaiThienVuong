"""Kiểm tất định cho 4 tiêu chí định tính của plan mục 5.1.

Vì sao không để LLM chấm: đã thử cho gpt-4o-mini làm giám khảo, nó trích ngược đoạn CÓ
trong lời người học rồi kết luận "AI thêm ý mới" — sai ở cả 4/4 ca mirror. Mấy tiêu chí này
thực chất là phép so sánh tập từ và dò cụm từ, code làm vừa đúng vừa tái lập được.

Giữ hàm thuần, không gọi mạng, để golden set chạy lại cho cùng kết quả.
"""

import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "codebase" / "backend"))
from slides import STOPWORDS, _normalize  # noqa: E402

# Từ thuộc bộ khung dẫn lời, xuất hiện trong mirror là chuyện đương nhiên
FRAMING = {
    "thầy", "cô", "em", "nói", "rằng", "hiểu", "ý", "đúng", "vậy", "tức", "nghĩa",
    "theo", "lời", "vừa", "rồi", "ạ", "nhé", "có", "phải", "chính", "xác", "lại",
    "mình", "bạn", "cái", "thứ", "việc", "điều", "sẽ", "bị", "làm", "dùng", "nếu",
}
# Cụm cho thấy AI đã phán đúng/sai thay vì hỏi (bước 4 cấm kết luận trước khi hỏi)
VERDICT_PHRASES = [
    "sai rồi", "không đúng", "thực ra", "thật ra", "chưa chính xác", "nhầm rồi",
    "điều này sai", "không phải vậy", "đó là sai",
]
# Cụm chen lời đính chính vào giữa mirror — dấu hiệu rõ nhất của "sửa đẹp" hộ người học
CORRECTION_MARKERS = [
    "nhưng thực tế", "thực tế là", "thực tế thì", "tuy nhiên", "đúng ra", "lẽ ra",
    "chính xác hơn", "ý thầy chắc là", "ý cô chắc là", "phải là", "mới đúng",
]
# Khen suông, không bám nội dung
GENERIC_PRAISE = [
    "giỏi quá", "tuyệt vời", "hay quá", "xuất sắc", "quá đỉnh", "rất tốt", "tốt lắm",
]
# Đo mirror theo ĐỘ GIỮ LẠI, không theo độ trùng khít. Bước 3 của plan là "diễn giải lại
# lời người học", nên đổi từ ngữ là việc được phép: "ảnh xịn nhất" -> "hình ảnh chất lượng
# nhất" vẫn là phản chiếu trung thực. Cái phải bắt là mirror ĐÁNH RƠI hoặc ĐẢO khẳng định
# của người học, và mirror chen lời đính chính vào.
#
# GIỚI HẠN ĐÃ BIẾT: đếm trùng từ không phân biệt được "diễn đạt lại" với "đánh rơi một
# mệnh đề". Một mirror diễn đạt lại hoàn toàn bằng từ đồng nghĩa chỉ trùng ~50%. Vì vậy
# ngưỡng để thấp, chấp nhận lọt trường hợp rơi một mệnh đề giữa câu, đổi lại không phạt oan
# hành vi đúng. Việc bắt rơi ý cần so sánh ngữ nghĩa, không làm được bằng phép đếm từ.
MIN_MIRROR_RECALL = 0.35
# Chặn cuối cho trường hợp viết lại hoàn toàn thành một bài khác
MAX_NEW_CONTENT_WORDS = 12
MIN_SHARED_WORDS_PRAISE = 2


def _content_words(text: str) -> set[str]:
    return {
        w for w in _normalize(text).split()
        if len(w) >= 2 and w not in STOPWORDS and w not in FRAMING
    }


def _has_any(text: str, phrases: list[str]) -> str | None:
    low = unicodedata.normalize("NFC", text or "").lower()
    for phrase in phrases:
        if phrase in low:
            return phrase
    return None


def check_mirror_fidelity(learner_said: str, mirror: str) -> list[str]:
    """Mirror phải phản chiếu, không mang khẳng định mới (plan mục 4.4)."""
    if not (learner_said or "").strip():
        return []
    if not (mirror or "").strip():
        return ["mirror rỗng dù người học đã giảng"]

    said = _content_words(learner_said)
    reflected = _content_words(mirror)
    fails = []

    # Giữ lại: khẳng định của người học còn nguyên trong mirror hay đã bị thay bằng ý khác
    if said:
        recall = len(said & reflected) / len(said)
        if recall < MIN_MIRROR_RECALL:
            missing = sorted(said - reflected)[:6]
            fails.append(
                f"mirror chỉ giữ {recall:.0%} nội dung người học nói, đánh rơi: {missing}"
            )

    if len(reflected - said) > MAX_NEW_CONTENT_WORDS:
        fails.append(f"mirror viết lại thành bài khác ({len(reflected - said)} từ nội dung mới)")

    hit = _has_any(mirror, VERDICT_PHRASES) or _has_any(mirror, CORRECTION_MARKERS)
    if hit:
        fails.append(f"mirror đã đính chính bằng cụm '{hit}' thay vì phản chiếu nguyên trạng")
    return fails


def check_probe_before_verdict(reply: str) -> list[str]:
    """Bước 4: phải hỏi, chưa được phán sai."""
    fails = []
    if "?" not in (reply or ""):
        fails.append("lượt hỏi vặn không chứa câu hỏi nào")
    hit = _has_any(reply, VERDICT_PHRASES)
    if hit:
        fails.append(f"đã kết luận đúng/sai bằng cụm '{hit}' trước khi đối chiếu slide")
    return fails


def check_no_answer_leak(reply: str, slide_quote: str | None) -> list[str]:
    """Câu hỏi ở bước 4 không được chứa sẵn đáp án lấy từ slide.

    Dò trùng cụm dài: nếu reply chứa một đoạn >= 6 từ liên tiếp khớp với trích dẫn slide
    thì nghĩa là AI đã chép đáp án ra thay vì để người học tự nói.
    """
    if not slide_quote or not (reply or "").strip():
        return []
    reply_words = _normalize(reply).split()
    quote_words = _normalize(slide_quote).split()
    window = 6
    if len(quote_words) < window or len(reply_words) < window:
        return []
    reply_grams = {
        " ".join(reply_words[i : i + window]) for i in range(len(reply_words) - window + 1)
    }
    for i in range(len(quote_words) - window + 1):
        gram = " ".join(quote_words[i : i + window])
        if gram in reply_grams:
            return [f"câu hỏi chép nguyên đáp án từ slide: '{gram}'"]
    return []


def check_specific_praise(learner_said: str, encourage: str) -> list[str]:
    """Bước 2: khen đúng 1 câu và phải bám nội dung vừa nghe."""
    if not (learner_said or "").strip():
        return []
    if not (encourage or "").strip():
        return ["encourage rỗng dù người học đã giảng"]
    hit = _has_any(encourage, GENERIC_PRAISE)
    shared = _content_words(encourage) & _content_words(learner_said)
    fails = []
    if len(shared) < MIN_SHARED_WORDS_PRAISE:
        fails.append(f"lời khen không bám nội dung (chỉ trùng {len(shared)} từ với lời người học)")
    if hit and len(shared) < MIN_SHARED_WORDS_PRAISE:
        fails.append(f"khen suông bằng cụm '{hit}'")
    if encourage.count(".") + encourage.count("!") > 2:
        fails.append("khen dài hơn 1 câu")
    return fails


CHECKERS = {
    "mirror_trung_thuc": lambda c, r, q: check_mirror_fidelity(c.get("input", ""), r.get("mirror", "")),
    "probe_truoc_khi_bao_sai": lambda c, r, q: (
        check_probe_before_verdict(r.get("reply", "")) if r.get("stage") == "mirror_probe" else []
    ),
    "khong_lo_dap_an": lambda c, r, q: check_no_answer_leak(r.get("reply", ""), q),
    "khen_cu_the": lambda c, r, q: check_specific_praise(c.get("input", ""), r.get("encourage", "")),
}


def qualitative_checks(case: dict, result: dict) -> list[str]:
    """Chạy bộ kiểm tất định ứng với tiêu chí của ca này."""
    checker = CHECKERS.get(case["criterion"])
    if checker is None:
        return []
    slide_quote = (result.get("evidence") or {}).get("quote")
    return checker(case, result, slide_quote)
