-- PlanDoSee (플랜두씨) 다이어리 — 과제 6 스키마 v2
-- Supabase SQL Editor에서 그대로 실행

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
  priority text,                                  -- 필수 아님 (문서 요구사항)
  estimated_time_raw text,                         -- 사용자가 입력한 원문 (예: "주 3시간")
  estimated_minutes integer not null default 0,    -- 내부 정규화 값 (Review 계산용)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

-- 성공 기준 체크리스트
create table if not exists plan_success_criteria (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  label text not null,
  is_checked boolean not null default false,
  order_no integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_psc_plan_id on plan_success_criteria(plan_id);

-- 계획 수정 이력 (plan 행 + 그 시점 체크리스트 스냅샷)
create table if not exists plan_history (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  version_no integer not null,
  snapshot jsonb not null,   -- { plan: {...}, success_criteria: [...] }
  edited_at timestamptz not null default now()
);
create index if not exists idx_plan_history_plan_id on plan_history(plan_id);

-- =========================================================
-- 2) todos (plan_id는 nullable — Todo 단독 생성 후 나중에 연결 가능)
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);
create index if not exists idx_todos_plan_id on todos(plan_id);
create index if not exists idx_todos_status on todos(status);
create index if not exists idx_todos_due_date on todos(due_date);

create table if not exists todo_completions (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos(id) on delete cascade,
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
  actual_minutes integer not null default 0,  -- work 구간 합계 (완료/중단 시 계산되어 채워짐)
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
-- 4) Schedule (독립)
-- =========================================================
create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_time time,
  title text not null,
  location text default '',
  memo text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_schedules_date on schedules(event_date);

-- =========================================================
-- 5) Diary (독립, AI 분석 대상 아님)
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
-- RLS: 무로그인 공개
-- =========================================================
alter table plans enable row level security;
alter table plan_success_criteria enable row level security;
alter table plan_history enable row level security;
alter table todos enable row level security;
alter table todo_completions enable row level security;
alter table execution_logs enable row level security;
alter table execution_segments enable row level security;
alter table schedules enable row level security;
alter table diary_entries enable row level security;
alter table next_actions enable row level security;

create policy "public all plans" on plans for all using (true) with check (true);
create policy "public all psc" on plan_success_criteria for all using (true) with check (true);
create policy "public all plan_history" on plan_history for all using (true) with check (true);
create policy "public all todos" on todos for all using (true) with check (true);
create policy "public all todo_completions" on todo_completions for all using (true) with check (true);
create policy "public all execution_logs" on execution_logs for all using (true) with check (true);
create policy "public all execution_segments" on execution_segments for all using (true) with check (true);
create policy "public all schedules" on schedules for all using (true) with check (true);
create policy "public all diary_entries" on diary_entries for all using (true) with check (true);
create policy "public all next_actions" on next_actions for all using (true) with check (true);
