# Workflow — VLearn Smart Learning

Quyết định AI trung tâm: **bước 7 — xếp danh sách ôn tập**. Luật xếp nhóm theo mức hiểu tự chấm, AI được nâng/hạ tối đa 1 nhóm và bắt buộc kèm lý do + căn cứ. Các bước còn lại giữ mock (data giả).

Bước 2 rẽ nhánh: Hỏi đáp → bước 3, Ghi chú → bước 4. Hai nhánh không nối sang nhau.

## Giai đoạn 1 — Trong lớp (mock)

**B1. Mở slide bài học** — học viên học trên VLearn (slide 12/30, bài Transformer).

**B2. Bôi đen đoạn cần thao tác** — hiện popup 2 nút:
- Hỏi đáp → B3
- Ghi chú → B4

**B3. Hỏi đáp (nhánh A)**
- Học viên gõ câu hỏi về đoạn đã bôi đen.
- AI Explain trả giải thích theo ngữ cảnh slide (mock). "Ví dụ minh họa" thu gọn, bấm mới mở.
- Nút Hữu ích 👍/👎: chỉ hiển thị, không lưu — phản ánh chất lượng giải thích, không phản ánh mức hiểu.
- Lưu khi gửi câu hỏi: `{type: "question", slide, highlight, question}`.
- Không lưu câu trả lời AI Explain (mock, bước 7 không dùng tới).
- Không có nút chuyển sang B4.

**B4. Ghi chú (nhánh B)**
- Khung trích đoạn bôi đen + ô ghi chú rỗng (0/500 ký tự).
- Chọn 1 trong 2 cách lưu:
  - Lưu link slide → `{type: "bookmark", slide, highlight}`
  - Lưu vào học tập + tự chấm mức hiểu 1–5 → `{type: "note", slide, highlight, note, rating}`

**B5. Tiếp tục học** — nhật ký buổi học hiện từng mục vừa lưu (giờ, loại, nội dung). Quay lại B2 với đoạn khác.

**Learning Activity Database** — Supabase (Postgres), dùng chung 2 giai đoạn. Frontend không gọi Supabase trực tiếp, mọi đọc/ghi đi qua backend FastAPI. Seed sẵn data giả nhiều khái niệm để demo.

## Giai đoạn 2 — Sau buổi học

**B6. Hỏi AI: "Hôm nay tôi cần ôn gì?"** → gửi toàn bộ activities của buổi sang B7.

**B7. Xếp danh sách ôn tập — AI thật**

7a. Lọc (code): `bookmark` → bỏ, không vào danh sách ôn.

7b. Nhóm nền theo luật (code) → `base_group`:

| Nguồn | Điều kiện | Nhóm |
|---|---|---|
| note | rating 1–2 | high (đỏ, Ưu tiên cao) |
| note | rating 3 | medium (vàng, Cần xem lại) |
| note | rating 4–5 | low (xanh, Ôn nhẹ) |
| question | mọi câu hỏi | medium (AI có thể nâng lên high theo nội dung) |

7c. Gọi AI (1 lời gọi), AI làm:
1. Gộp mục cùng khái niệm (khác chữ vẫn gộp). Nhóm nền của khái niệm = nhóm cao nhất trong các mục.
2. Nâng/hạ tối đa 1 nhóm khi nội dung ghi chú/câu hỏi mâu thuẫn mức tự chấm. Bắt buộc `reason` + `evidence_ids`.
3. Loại mục ngoài phạm vi bài học → `excluded` (lớp ③).
4. Gắn cờ mục quá ít thông tin, không điều chỉnh → `flags: insufficient_info` (lớp ②).
5. Khái niệm nền xếp trước khái niệm phụ thuộc (lớp ④), ví dụ Q/K/V trước Multi-head.

7d. Kiểm output (code):
- `evidence_ids` phải có thật trong input (lớp ①, chống bịa nguồn).
- `final_group` lệch `base_group` tối đa 1 nấc.
- Vi phạm → bỏ điều chỉnh của khái niệm đó, dùng `base_group`.
- AI lỗi/timeout → hiện danh sách theo luật + dòng "Đang xếp theo mức tự đánh giá".
- Ghi log mỗi lần gọi: timestamp, model, prompt, raw response, kết quả sau kiểm → bảng `review_runs` trên Supabase + file `logs/ai_calls.jsonl` trong repo.

7e. Hiện trên UI:
- Mỗi khái niệm 1 thẻ: màu nhóm, mức tự chấm, nhãn "AI điều chỉnh ↑/↓" + lý do nếu có.
- Nút "Không đúng" trên thẻ đã điều chỉnh → quay về `base_group`, ghi lại vào Database.
- Khu "Đã loại" và "Thiếu thông tin" thu gọn phía dưới.

### Contract AI bước 7

Input:
```json
{
  "lesson": "Bài 4 - Transformer",
  "items": [
    {"id": "n1", "type": "note", "slide": 12, "highlight": "...", "note": "...", "rating": 2, "base_group": "high"},
    {"id": "q1", "type": "question", "slide": 13, "highlight": "...", "question": "...", "base_group": "medium"}
  ]
}
```

Output:
```json
{
  "review_list": [
    {"concept": "Query, Key, Value", "item_ids": ["n1"], "base_group": "high", "final_group": "high",
     "adjusted": false, "reason": "...", "evidence_ids": ["n1"], "order": 1}
  ],
  "excluded": [{"item_id": "...", "why": "out_of_scope"}],
  "flags": [{"item_id": "...", "flag": "insufficient_info"}]
}
```

**B8. Dạy lại cho AI** — học viên chọn khái niệm từ danh sách, đóng vai giáo viên (mock).

**B9. AI hỏi ngược & phản hồi** — AI đóng vai học viên: hỏi sâu hơn / tình huống thực tế / chỉ chỗ sai / gợi ý khi bí (mock, câu soạn sẵn).

**B10. Kết thúc & cập nhật** — tổng kết đã hiểu / cần xem lại, học viên chấm lại mức hiểu → cập nhật `rating` trong Database → "Quay lại danh sách ôn tập" chạy lại B7 (khái niệm chuyển nhóm).

## 4 đường đi trải nghiệm (bước 7)

- Happy path: danh sách xếp đúng, có lý do.
- Low-confidence ②: ghi chú "??" → cờ "Thiếu thông tin", giữ nhóm luật.
- Failure ①: AI trích căn cứ không tồn tại / lỗi API → dùng nhóm luật + thông báo.
- Correction: học viên bấm "Không đúng" → về nhóm tự chấm.
- Ngoài phạm vi ③: "Khi nào có điểm thi?" → vào "Đã loại".
- Đặc thù ④: Multi-head (2/5) xếp sau Q/K/V (2/5) vì phụ thuộc.

## Kiến trúc

```
Browser (codebase/frontend: index.html, app.js, style.css)
   │  fetch JSON
   ▼
FastAPI (codebase/backend)  ── SUPABASE_URL + SUPABASE_SERVICE_KEY (env) ──► Supabase Postgres
   │
   └── OPENAI_API_KEY (env) ──► OpenAI API (bước 7)
   └── ghi log JSONL ──► codebase/backend/logs/ai_calls.jsonl
```

Key chỉ nằm trong `.env` của backend. `.env` vào `.gitignore`, commit `.env.example`. Frontend không chứa key nào.

## Schema Supabase

```sql
create table activities (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,          -- buổi học
  lesson text not null,
  slide int not null,
  type text not null check (type in ('question','note','bookmark')),
  highlight text,
  question text,
  note text,
  rating int check (rating between 1 and 5),
  created_at timestamptz default now()
);

create table review_runs (           -- mỗi lần chạy B7
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  model text,
  input jsonb not null,
  raw_response text,
  final_output jsonb not null,       -- sau khi kiểm
  used_fallback boolean default false,
  created_at timestamptz default now()
);

create table corrections (           -- học viên bấm "Không đúng" / chấm lại ở B10
  id uuid primary key default gen_random_uuid(),
  review_run_id uuid references review_runs(id),
  concept text not null,
  action text not null check (action in ('reject_adjustment','re_rate')),
  new_rating int check (new_rating between 1 and 5),
  created_at timestamptz default now()
);
```

Chỉ dùng data giả / trích ngắn từ data pack. Không lưu data người thật.

## API FastAPI

| Method | Path | Bước | Việc |
|---|---|---|---|
| GET | `/sessions/{id}/activities` | B5 | Lấy nhật ký buổi học |
| POST | `/activities` | B3, B4 | Lưu question / note / bookmark |
| POST | `/sessions/{id}/review` | B6→B7 | Đọc activities → luật → gọi AI → kiểm → lưu `review_runs` → trả danh sách |
| POST | `/corrections` | B7, B10 | "Không đúng" hoặc chấm lại mức hiểu |

## Việc cần làm trong codebase/

- Dọn thư mục: `codebase/frontend/` (3 file hiện tại) + `codebase/backend/`.
- frontend/index.html: bỏ nút "Chuyển sang Bước 4" trong drawer B3 (index.html:818-820); ô ghi chú rỗng (index.html:846); thêm ô gõ câu hỏi B3; danh sách B7 thành container rỗng render động (index.html:1001-1044).
- frontend/app.js: các nút lưu gọi `POST /activities`; nhật ký B5 render từ API; B6 gọi `/review`; render bằng `textContent`, bỏ `innerHTML` với dữ liệu người dùng/AI.
- backend/: `main.py` (routes), `db.py` (supabase-py client), `ranking.py` (luật `base_group` + `validate_ai_output` + fallback), `llm.py` (gọi OpenAI + ghi log JSONL), `schema.sql`, `seed.py` (data giả), `requirements.txt`, `.env.example`.
- `ranking.py` tách hàm thuần (không phụ thuộc DB) để script golden set gọi thẳng: `rank(items) -> output`.

## Để sau CP4 (không build bây giờ)

Ghi nhớ hành vi học viên: bảng `learner_profile` tính bằng code (độ lệch tự chấm, tỉ lệ bấm "Không đúng", khái niệm lặp lại qua nhiều buổi, lịch sử mức hiểu, thời gian chưa ôn), gửi kèm input AI bước 7. Dữ liệu cần đã có sẵn trong `activities`, `review_runs`, `corrections`, schema hiện tại không phải đổi.

## Verification

- Chạy `schema.sql` trên Supabase → `python seed.py` → `uvicorn main:app`, mở frontend.
- B2 → Hỏi đáp → B3 lưu; B2 → Ghi chú → B4 lưu 2/5 → kiểm dòng mới trong bảng `activities`.
- Reload trang → nhật ký B5 vẫn còn (đọc từ DB).
- Giai đoạn 2 → B6 → B7 thấy mục vừa lưu; bảng `review_runs` có input + raw_response.
- Sai `OPENAI_API_KEY` → B7 vẫn hiện danh sách theo luật, `used_fallback = true`.
- `logs/ai_calls.jsonl` có prompt + raw response.
- B10 chấm lại 4/5 → quay lại B7 → khái niệm chuyển xanh, bảng `corrections` có dòng mới.
- `git status` trước commit: không có `.env`.
