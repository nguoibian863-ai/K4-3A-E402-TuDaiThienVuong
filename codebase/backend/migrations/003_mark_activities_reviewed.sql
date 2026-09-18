-- Cho phép đánh dấu 1 mục trong "activities" đã học xong — ẩn khỏi danh sách ôn tập B7
-- (xoá mềm), không xoá dữ liệu thật để vẫn giữ lịch sử.
-- Chạy 1 lần trong Supabase → SQL Editor.

alter table activities add column if not exists reviewed_at timestamptz;
