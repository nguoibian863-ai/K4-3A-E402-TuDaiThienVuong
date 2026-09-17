-- Gắn mỗi hoạt động / lần xếp ôn tập với đúng bộ slide (lesson_id = 16 ký tự đầu
-- SHA-256 của file PDF), để dùng slide khác không bị trộn ghi chú theo số trang.
-- Chạy 1 lần trong Supabase → SQL Editor.

alter table activities add column if not exists lesson_id text;
alter table review_runs add column if not exists lesson_id text;

-- Dữ liệu cũ đều thuộc bộ slide "Buoi3_PromptEngineering_v2_compressed"
update activities set lesson_id = '430312de6eaaf6d6'
  where lesson_id is null and lesson = 'Buoi3_PromptEngineering_v2_compressed';
update review_runs set lesson_id = '430312de6eaaf6d6'
  where lesson_id is null;

create index if not exists idx_activities_session_lesson on activities(session_id, lesson_id);
create index if not exists idx_review_runs_session_lesson on review_runs(session_id, lesson_id, created_at desc);
