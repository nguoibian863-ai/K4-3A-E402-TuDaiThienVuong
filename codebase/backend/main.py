import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from chat import chat_reply
from db import get_client
from explain import explain as explain_highlight
from feynman import session_summary, student_reply
from prompts import check_prompts
from ranking import compute_base_group, rank

check_prompts()  # prompts.md thiếu mục nào thì báo lỗi ngay lúc khởi động

VN_TZ = timezone(timedelta(hours=7))

app = FastAPI(title="VLearn Smart Learning — Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ActivityIn(BaseModel):
    session_id: str
    lesson: str
    lesson_id: str = Field(min_length=1)  # mã bộ slide — tránh trộn ghi chú giữa các slide khác nhau
    slide: int
    type: Literal["question", "note", "bookmark", "progress"]
    highlight: Optional[str] = None
    question: Optional[str] = None
    note: Optional[str] = None
    rating: Optional[int] = None

    @field_validator("rating")
    @classmethod
    def rating_range(cls, v):
        if v is not None and not (1 <= v <= 5):
            raise ValueError("rating phải từ 1 đến 5")
        return v


class ExplainIn(BaseModel):
    highlight: str
    question: str
    lesson: str = ""
    history: list[dict] = []


@app.post("/explain")
def explain_endpoint(body: ExplainIn):
    result = explain_highlight(body.highlight, body.question, body.lesson, body.history)
    result.pop("raw_response", None)
    return result


@app.post("/activities")
def create_activity(activity: ActivityIn):
    if activity.type == "question" and not activity.question:
        raise HTTPException(400, "question bắt buộc khi type=question")
    if activity.type == "note" and (not activity.note or activity.rating is None):
        raise HTTPException(400, "note và rating bắt buộc khi type=note")
    if activity.type == "bookmark" and not activity.highlight:
        raise HTTPException(400, "highlight bắt buộc khi type=bookmark")

    db = get_client()
    row = db.table("activities").insert(activity.model_dump()).execute()
    return row.data[0]


@app.get("/sessions/{session_id}/activities")
def list_activities(session_id: str, lesson_id: str):
    db = get_client()
    rows = (
        db.table("activities")
        .select("*")
        .eq("session_id", session_id)
        .eq("lesson_id", lesson_id)
        .order("created_at", desc=True)
        .execute()
    )
    return rows.data


class ReviewIn(BaseModel):
    lesson_id: str = Field(min_length=1)


@app.post("/sessions/{session_id}/review")
def review_session(session_id: str, body: ReviewIn):
    db = get_client()
    rows = (
        db.table("activities")
        .select("*")
        .eq("session_id", session_id)
        .eq("lesson_id", body.lesson_id)
        .in_("type", ["question", "note"])  # bookmark / progress không phải nội dung cần ôn
        .execute()
    )
    activities = rows.data
    lesson = activities[0]["lesson"] if activities else ""

    items = []
    for a in activities:
        item = {
            "id": a["id"],
            "type": a["type"],
            "slide": a["slide"],
            "highlight": a.get("highlight"),
            "lesson": lesson,
            "created_at": a.get("created_at"),
        }
        if a["type"] == "note":
            item["note"] = a.get("note")
            item["rating"] = a.get("rating")
        if a["type"] == "question":
            item["question"] = a.get("question")
        item["base_group"] = compute_base_group(item)
        items.append(item)

    prev_run = (
        db.table("review_runs")
        .select("final_output")
        .eq("session_id", session_id)
        .eq("lesson_id", body.lesson_id)
        .eq("used_fallback", False)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    known_concepts = (
        [e["concept"] for e in prev_run.data[0]["final_output"].get("review_list", [])]
        if prev_run.data
        else []
    )

    result = rank(items, known_concepts)
    raw_response = result.pop("raw_response", None)

    # Gắn số trang slide của từng khái niệm để UI có nút quay lại đúng trang
    slide_by_id = {it["id"]: it["slide"] for it in items}
    for entry in result.get("review_list", []):
        entry["slides"] = sorted({slide_by_id[i] for i in entry.get("item_ids", []) if i in slide_by_id})
    used_fallback = result.get("used_fallback", False)

    run = (
        db.table("review_runs")
        .insert({
            "session_id": session_id,
            "lesson_id": body.lesson_id,
            "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            "input": {"lesson": lesson, "items": items},
            "raw_response": raw_response,
            "final_output": result,
            "used_fallback": used_fallback,
        })
        .execute()
    )

    result["review_run_id"] = run.data[0]["id"]
    return result


class ChatIn(BaseModel):
    session_id: str
    lesson_id: str = Field(min_length=1)
    message: str
    history: list[dict] = []


@app.post("/chat")
def chat_endpoint(body: ChatIn):
    db = get_client()
    rows = (
        db.table("activities")
        .select("*")
        .eq("session_id", body.session_id)
        .eq("lesson_id", body.lesson_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    ).data

    def local_time(iso: str) -> str:
        # DB lưu UTC; đổi sang giờ Việt Nam (UTC+7) để AI trả lời đúng giờ người dùng thấy
        try:
            dt = datetime.fromisoformat(iso).astimezone(VN_TZ)
            return dt.strftime("%H:%M %d/%m/%Y")
        except (TypeError, ValueError):
            return iso

    def pick(kind: str, fields: tuple[str, ...], limit: int = 40) -> list[dict]:
        items = [r for r in rows if r["type"] == kind][:limit]
        return [
            {
                "slide": r["slide"],
                "saved_at": local_time(r["created_at"]),
                **{f: r.get(f) for f in fields if r.get(f) is not None},
            }
            for r in items
        ]

    progress = pick("progress", ("highlight",))
    context = {
        "lesson": rows[0]["lesson"] if rows else "",
        "latest_progress": progress[0] if progress else None,
        "progress_history": progress[1:10],
        "bookmarks": pick("bookmark", ("highlight",)),
        "notes": pick("note", ("highlight", "note", "rating")),
        "questions": pick("question", ("highlight", "question")),
        "allowed_slides": sorted({r["slide"] for r in rows if r.get("slide")}),
    }
    return chat_reply(context, body.history, body.message)


class CorrectionIn(BaseModel):
    session_id: str
    lesson_id: str = Field(min_length=1)
    concept: str
    action: Literal["reject_adjustment", "re_rate"]
    new_rating: Optional[int] = None


def _latest_concept_context(db, session_id: str, lesson_id: str, concept: str):
    """Lấy lần chạy B7 gần nhất CỦA BỘ SLIDE NÀY + mục của khái niệm (từ input đã lưu)."""
    last_run = (
        db.table("review_runs")
        .select("*")
        .eq("session_id", session_id)
        .eq("lesson_id", lesson_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not last_run.data:
        raise HTTPException(400, "Chưa có lần chạy review nào cho session này")
    run = last_run.data[0]

    entry = next(
        (e for e in run["final_output"].get("review_list", []) if e["concept"] == concept),
        None,
    )
    if entry is None:
        raise HTTPException(404, f"Không tìm thấy khái niệm '{concept}' trong lần chạy gần nhất")

    items_by_id = {it["id"]: it for it in run["input"].get("items", [])}
    items = [items_by_id[i] for i in entry["item_ids"] if i in items_by_id]
    return run, entry, items


def _evidence(items: list[dict]) -> list[dict]:
    keys = ("type", "highlight", "note", "question", "rating")
    return [{k: it[k] for k in keys if it.get(k) is not None} for it in items]


def _current_rating(items: list[dict]):
    notes = [it for it in items if it.get("type") == "note" and it.get("rating") is not None]
    if not notes:
        return None
    return max(notes, key=lambda it: it.get("created_at") or "")["rating"]


class FeynmanReplyIn(BaseModel):
    session_id: str
    lesson_id: str = Field(min_length=1)
    concept: str
    history: list[dict] = []
    message: str = ""


@app.post("/feynman/reply")
def feynman_reply(body: FeynmanReplyIn):
    db = get_client()
    _, _, items = _latest_concept_context(db, body.session_id, body.lesson_id, body.concept)
    result = student_reply(body.concept, _evidence(items), body.history, body.message)
    result["current_rating"] = _current_rating(items)
    return result


class FeynmanSummaryIn(BaseModel):
    session_id: str
    lesson_id: str = Field(min_length=1)
    concept: str
    history: list[dict] = []


@app.post("/feynman/summary")
def feynman_summary(body: FeynmanSummaryIn):
    db = get_client()
    _, _, items = _latest_concept_context(db, body.session_id, body.lesson_id, body.concept)
    result = session_summary(body.concept, _evidence(items), body.history)
    result["current_rating"] = _current_rating(items)
    return result


@app.post("/corrections")
def create_correction(correction: CorrectionIn):
    db = get_client()
    run, entry, items = _latest_concept_context(db, correction.session_id, correction.lesson_id, correction.concept)

    if correction.action == "re_rate" and correction.new_rating is not None:
        note_ids = [it["id"] for it in items if it.get("type") == "note"]
        if note_ids:
            db.table("activities").update({"rating": correction.new_rating}).in_("id", note_ids).execute()
        else:
            # Khái niệm chỉ có câu hỏi -> thêm 1 ghi chú tự chấm để lần xếp B7 sau có mức hiểu mới.
            first = items[0] if items else {}
            db.table("activities").insert({
                "session_id": correction.session_id,
                "lesson": first.get("lesson") or "",
                "lesson_id": correction.lesson_id,
                "slide": first.get("slide") or 0,
                "type": "note",
                "highlight": correction.concept,
                "note": "Tự đánh giá lại sau phiên dạy AI (Feynman)",
                "rating": correction.new_rating,
            }).execute()

    row = (
        db.table("corrections")
        .insert({
            "review_run_id": run["id"],
            "concept": correction.concept,
            "action": correction.action,
            "new_rating": correction.new_rating,
        })
        .execute()
    )
    return row.data[0]


_frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if _frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")

