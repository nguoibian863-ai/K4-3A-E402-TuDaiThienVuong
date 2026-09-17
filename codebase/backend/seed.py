"""Seed data giả cho demo — không phải data thật của người thật."""

from dotenv import load_dotenv

load_dotenv()

from db import get_client

SESSION_ID = "demo-session-1"
LESSON = "Bài 4 - Transformer"

SEED_ACTIVITIES = [
    {
        "session_id": SESSION_ID, "lesson": LESSON, "slide": 12, "type": "question",
        "highlight": "Self-attention computes the attention weights between tokens using Query, Key, and Value matrices.",
        "question": "Tại sao cần Query, Key, Value?",
    },
    {
        "session_id": SESSION_ID, "lesson": LESSON, "slide": 12, "type": "bookmark",
        "highlight": "Query, Key, Value",
    },
    {
        "session_id": SESSION_ID, "lesson": LESSON, "slide": 12, "type": "note",
        "highlight": "Self-attention computes the attention weights between tokens using Query, Key, and Value matrices.",
        "note": "Chưa hiểu rõ bản chất 3 ma trận Q, K, V khác nhau thế nào", "rating": 2,
    },
    {
        "session_id": SESSION_ID, "lesson": LESSON, "slide": 13, "type": "question",
        "highlight": "Multi-head attention runs several attention heads in parallel.",
        "question": "Multi-head attention là gì?",
    },
    {
        "session_id": SESSION_ID, "lesson": LESSON, "slide": 14, "type": "note",
        "highlight": "Positional encoding injects order information into token embeddings.",
        "note": "Hiểu khá rõ, chỉ cần ôn lại công thức sin/cos", "rating": 4,
    },
    # Ca lớp ② — mơ hồ / thiếu thông tin
    {
        "session_id": SESSION_ID, "lesson": LESSON, "slide": 13, "type": "note",
        "highlight": "Scaled dot-product attention divides by sqrt(d_k).",
        "note": "??", "rating": 3,
    },
    # Ca lớp ③ — ngoài phạm vi bài học
    {
        "session_id": SESSION_ID, "lesson": LESSON, "slide": 12, "type": "question",
        "highlight": "Query, Key, Value",
        "question": "Khi nào lớp mình thi cuối kỳ?",
    },
]


def main():
    db = get_client()
    db.table("activities").insert(SEED_ACTIVITIES).execute()
    # Tránh UnicodeEncodeError trên console Windows (cp1252) khi in tiếng Việt có dấu.
    print(f"Seeded {len(SEED_ACTIVITIES)} activities for session {SESSION_ID}")


if __name__ == "__main__":
    main()
