"""Rút text từ PDF bài giảng thành nguồn grounding cho bước 5 (plan.md mục 4.2).

Đặt tên file theo đúng lesson_id mà frontend tính (8 byte đầu của SHA-256 file PDF,
xem computeLessonId trong app.js) để slides.load_slides(lesson_id) tự tìm thấy.

Dùng:  python extract_slides.py ../../data/Buoi3_PromptEngineering_v2_compressed.pdf
"""

import argparse
import hashlib
import re
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def lesson_id_of(pdf: Path) -> str:
    """Khớp với computeLessonId() ở frontend: SHA-256, lấy 8 byte đầu, hex."""
    return hashlib.sha256(pdf.read_bytes()).digest()[:8].hex()


def clean(text: str) -> str:
    """Text rút từ PDF hay dính xuống dòng giữa câu và khoảng trắng thừa."""
    text = text.replace("­", "").replace("ﬁ", "fi").replace("ﬂ", "fl")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    if not args.pdf.is_file():
        print(f"Không thấy file: {args.pdf}")
        return 1
    try:
        from pypdf import PdfReader
    except ImportError:
        print("Thiếu pypdf. Chạy: pip install pypdf")
        return 1

    lesson_id = lesson_id_of(args.pdf)
    out = args.out or DATA_DIR / f"slides_{lesson_id}.txt"

    reader = PdfReader(str(args.pdf))
    chunks, empty = [], 0
    for number, page in enumerate(reader.pages, 1):
        body = clean(page.extract_text() or "")
        if not body:
            empty += 1
            continue
        chunks.append(f"=== SLIDE {number} ===\n{body}")

    out.write_text("\n\n".join(chunks) + "\n", encoding="utf-8")
    print(f"lesson_id  : {lesson_id}")
    print(f"tổng trang : {len(reader.pages)}")
    print(f"rút được   : {len(chunks)} slide có chữ ({empty} trang rỗng — nhiều khả năng là ảnh)")
    print(f"ghi ra     : {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
