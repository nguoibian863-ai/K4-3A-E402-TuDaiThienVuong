-- Cho phép lưu "tiến độ học" (đã học đến trang nào) vào bảng activities.
-- Chạy 1 lần trong Supabase → SQL Editor.

alter table activities drop constraint if exists activities_type_check;
alter table activities
  add constraint activities_type_check
  check (type in ('question', 'note', 'bookmark', 'progress'));
