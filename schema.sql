-- PlanDoSee Deck (플랜두씨) 다이어리 — 전체 스키마 (새 Supabase 프로젝트용)
-- Supabase SQL Editor에서 그대로 실행
-- ※ 이미 v2 스키마를 실행한 프로젝트는 이 파일 대신 migration_001_schedule_icon_color.sql만 실행하세요.
-- 키(일정) 한 칸 = todos 한 건 입니다.

create extension if not exists "pgcrypto";

-- =========================================================
-- 1) plans
-- =========================================================
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '기타',
  details jsonb not null default '{}'::jsonb,
  period_start date not null,
  period_end date not null,
  priority text,                                  -- 필수 아님
  estimated_time_raw text,                         -- 사용자가 입력한 원문 (예: "주 3시간")
  estimated_minutes integer not null default 0,    -- 내부 정규화 값 (Review 계산용, 분 단위)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create table if not exists plan_success_criteria (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  label text not null,
  is_checked boolean not null default false,
  order_no integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_psc_plan_id on plan_success_criteria(plan_id);

create table if not exists plan_history (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  version_no integer not null,
  snapshot jsonb not null,   -- { plan: {...}, success_criteria: [...] }
  edited_at timestamptz not null default now()
);
create index if not exists idx_plan_history_plan_id on plan_history(plan_id);

-- =========================================================
-- 2) todos (plan_id는 nullable)
-- =========================================================
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete set null,
  title text not null,
  memo text default '',
  due_date date,
  priority text default 'medium',
  tags text[] not null default '{}',
  estimated_time_raw text,
  estimated_minutes integer not null default 0,
  status text not null default 'in_progress',
  end_date date,                   -- 여러 날 일정의 종료일 (없으면 하루짜리, due_date가 시작일)
  event_time time,                 -- 키에 표시할 시각 (선택)
  location text not null default '',
  icon text not null default '',   -- 키 아이콘(이모지/짧은 글자)
  color text not null default '',  -- 키 배경색 #rrggbb
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);
create index if not exists idx_todos_plan_id on todos(plan_id);
create index if not exists idx_todos_status on todos(status);
create index if not exists idx_todos_due_date on todos(due_date);

create table if not exists todo_completions (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null unique references todos(id) on delete cascade,   -- 할 일당 완료 기록 1건 (연타 중복 방지, T06-C21)
  completed_at timestamptz not null default now()
);
create index if not exists idx_todo_completions_todo_id on todo_completions(todo_id);

-- =========================================================
-- 3) Do — 실행 세션 + PAUSE/RESUME 구간 이력
-- =========================================================
create table if not exists execution_logs (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos(id) on delete cascade,
  status text not null default 'running',   -- running / paused / stopped / completed
  started_at timestamptz not null,
  ended_at timestamptz,
  actual_minutes integer not null default 0,
  blocker_reason text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_execution_logs_todo_id on execution_logs(todo_id);

create table if not exists execution_segments (
  id uuid primary key default gen_random_uuid(),
  execution_log_id uuid not null references execution_logs(id) on delete cascade,
  segment_type text not null,   -- work / pause
  segment_start timestamptz not null,
  segment_end timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_segments_log_id on execution_segments(execution_log_id);

-- =========================================================
-- 5) Diary (독립)
-- =========================================================
create table if not exists diary_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  mood text default '',
  mood_music text default '',
  event text default '',
  wanted_to_say text default '',
  food text default '',
  free_text text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_diary_date on diary_entries(entry_date);

-- =========================================================
-- 6) 다음 계획 한 줄
-- =========================================================
create table if not exists next_actions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete set null,
  period_label text not null,
  note text not null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- RLS: 무로그인 공개 (링크를 아는 사람은 누구나 읽고 쓸 수 있음 — 과제 6의 의도된 상태)
-- =========================================================
alter table plans enable row level security;
alter table plan_success_criteria enable row level security;
alter table plan_history enable row level security;
alter table todos enable row level security;
alter table todo_completions enable row level security;
alter table execution_logs enable row level security;
alter table execution_segments enable row level security;
alter table diary_entries enable row level security;
alter table next_actions enable row level security;

create policy "public all plans" on plans for all using (true) with check (true);
create policy "public all psc" on plan_success_criteria for all using (true) with check (true);
create policy "public all plan_history" on plan_history for all using (true) with check (true);
create policy "public all todos" on todos for all using (true) with check (true);
create policy "public all todo_completions" on todo_completions for all using (true) with check (true);
create policy "public all execution_logs" on execution_logs for all using (true) with check (true);
create policy "public all execution_segments" on execution_segments for all using (true) with check (true);
create policy "public all diary_entries" on diary_entries for all using (true) with check (true);
create policy "public all next_actions" on next_actions for all using (true) with check (true);
