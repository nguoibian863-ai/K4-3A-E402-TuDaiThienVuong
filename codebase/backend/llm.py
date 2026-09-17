"""Lớp gọi LLM thật cho Bước 7 — ghi log mọi lần gọi (prompt + raw response)."""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI

LOG_PATH = Path(__file__).parent / "logs" / "ai_calls.jsonl"


def _log(entry: dict) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def call_llm(
    system_prompt: str,
    payload: dict,
    temperature: float | None = None,
    turns: list[dict] | None = None,
) -> tuple[str, dict]:
    """Gọi OpenAI thật, trả (raw_response_text, parsed_json).

    `payload` là ngữ cảnh tĩnh (khái niệm, ghi chú, tiến độ...) — gửi dưới dạng JSON.
    `turns` là hội thoại nhiều lượt [{"role": "user"|"assistant", "content": str}], gửi
    thành CÁC MESSAGE THẬT nối sau ngữ cảnh. Nhờ vậy lượt cuối của người dùng nằm ở vị trí
    cuối cùng và model bắt buộc phải đáp đúng câu đó, thay vì bị chìm trong khối JSON.

    Ghi log bất kể thành công hay lỗi, để phục vụ xác minh kỹ thuật.
    Ném lỗi lên trên (ranking.py bắt và fallback về luật) nếu gọi API
    thất bại hoặc phản hồi không phải JSON hợp lệ.
    """
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    user_content = json.dumps(payload, ensure_ascii=False)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    for turn in turns or []:
        content = str(turn.get("content") or "").strip()
        if not content:
            continue
        role = "assistant" if turn.get("role") == "assistant" else "user"
        messages.append({"role": role, "content": content})

    started = time.time()
    error = None
    raw_text = None
    parsed = None
    try:
        extra = {} if temperature is None else {"temperature": temperature}
        response = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=messages,
            **extra,
        )
        raw_text = response.choices[0].message.content
        parsed = json.loads(raw_text)
        return raw_text, parsed
    except Exception as exc:
        error = str(exc)
        raise
    finally:
        _log({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "model": model,
            "temperature": temperature,
            "prompt": user_content,
            "messages": messages,
            "raw_response": raw_text,
            "error": error,
            "duration_ms": int((time.time() - started) * 1000),
        })
