"""Đọc system prompt từ prompts.md (mỗi prompt dưới 1 tiêu đề '## tên').

Đọc lại file mỗi lần gọi để sửa prompt không cần restart server.
"""

from pathlib import Path

PROMPTS_PATH = Path(__file__).parent / "prompts.md"
REQUIRED_PROMPTS = (
    "explain", "ranking", "feynman_reply", "feynman_summary", "chat",
    "feynman_v3_reply", "feynman_v3_rubric", "feynman_v3_evidence", "feynman_v3_judge",
    "feynman_v3_mirror",
)


def _load_sections() -> dict[str, str]:
    sections: dict[str, str] = {}
    current = None
    buffer: list[str] = []
    for line in PROMPTS_PATH.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            if current is not None:
                sections[current] = "\n".join(buffer).strip()
            current = line[3:].strip()
            buffer = []
        elif current is not None:
            buffer.append(line)
    if current is not None:
        sections[current] = "\n".join(buffer).strip()
    return sections


def get_prompt(name: str) -> str:
    prompt = _load_sections().get(name)
    if not prompt:
        raise KeyError(f"prompts.md thiếu hoặc rỗng mục '## {name}'")
    return prompt


def check_prompts() -> None:
    sections = _load_sections()
    missing = [name for name in REQUIRED_PROMPTS if not sections.get(name)]
    if missing:
        raise RuntimeError(f"prompts.md thiếu mục: {', '.join('## ' + m for m in missing)}")
