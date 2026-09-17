-- VLearn Smart Learning — Supabase schema
-- Chạy trong SQL editor của Supabase project trước khi seed.py / uvicorn.

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,          -- buổi học
  lesson text not null,
  slide int not null,
  type text not null check (type in ('question', 'note', 'bookmark', 'progress')),
  highlight text,
  question text,
  note text,
  rating int check (rating between 1 and 5),
  created_at timestamptz default now()
);

create table if not exists review_runs (          -- mỗi lần chạy Bước 7
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  model text,
  input jsonb not null,
  raw_response text,
  final_output jsonb not null,       -- sau khi kiểm (validate)
  used_fallback boolean default false,
  created_at timestamptz default now()
);

create table if not exists corrections (           -- "Không đúng" hoặc chấm lại ở Bước 10
  id uuid primary key default gen_random_uuid(),
  review_run_id uuid references review_runs(id),
  concept text not null,
  action text not null check (action in ('reject_adjustment', 're_rate')),
  new_rating int check (new_rating between 1 and 5),
  created_at timestamptz default now()
);

create index if not exists idx_activities_session on activities(session_id);
create index if not exists idx_review_runs_session on review_runs(session_id, created_at desc);
