-- T07 카드1·4 준비 1단계 — 모든 자료에 "주인" 칸을 달고, 지금까지 쌓인 자료를 내 계정 소유로 옮긴다.
--
-- 이 단계에서는 접근 규칙(RLS)을 아직 바꾸지 않는다. 앱은 그대로 동작한다.
-- 접근 규칙은 2단계(t07_02_owner_rls.sql)에서 바꾼다.
--
-- 실행 위치: Supabase 대시보드 > SQL Editor
-- 실행 전에 아래 '<MY_EMAIL>' 한 곳을 내 가입 이메일로 바꾼다. (공개 저장소라 실제 이메일은 적지 않았다)

begin;

-- (1) 주인 칸 추가
--   default auth.uid()  : 새 자료를 넣을 때 로그인한 사람의 id가 자동으로 들어간다. (앱 코드를 고치지 않아도 된다)
--   references ... on delete cascade : 계정을 지우면 그 사람의 자료도 함께 지워진다. (T07-C134)
alter table plans                 add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table plan_success_criteria add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table plan_history          add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table todos                 add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table todo_completions      add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table execution_logs        add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table execution_segments    add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table diary_entries         add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table next_actions          add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;

-- (2) 6번에서 쌓은 기존 자료를 내 계정 소유로 옮긴다. (T07-C100)
do $$
declare uid uuid;
begin
  select id into uid from auth.users where email = '<MY_EMAIL>';
  if uid is null then
    raise exception '계정을 찾지 못했습니다. 이메일을 확인하세요.';
  end if;

  update plans                 set user_id = uid where user_id is null;
  update plan_success_criteria set user_id = uid where user_id is null;
  update plan_history          set user_id = uid where user_id is null;
  update todos                 set user_id = uid where user_id is null;
  update todo_completions      set user_id = uid where user_id is null;
  update execution_logs        set user_id = uid where user_id is null;
  update execution_segments    set user_id = uid where user_id is null;
  update diary_entries         set user_id = uid where user_id is null;
  update next_actions          set user_id = uid where user_id is null;
end $$;

-- (3) 주인 칸을 비워 둘 수 없게 한다. (주인 없는 자료가 생기지 않게)
alter table plans                 alter column user_id set not null;
alter table plan_success_criteria alter column user_id set not null;
alter table plan_history          alter column user_id set not null;
alter table todos                 alter column user_id set not null;
alter table todo_completions      alter column user_id set not null;
alter table execution_logs        alter column user_id set not null;
alter table execution_segments    alter column user_id set not null;
alter table diary_entries         alter column user_id set not null;
alter table next_actions          alter column user_id set not null;

-- (4) 주인으로 찾는 일이 많아지므로 색인(찾기 빠르게 하는 목차)을 만든다.
create index if not exists idx_plans_user                 on plans(user_id);
create index if not exists idx_plan_success_criteria_user on plan_success_criteria(user_id);
create index if not exists idx_plan_history_user          on plan_history(user_id);
create index if not exists idx_todos_user                 on todos(user_id);
create index if not exists idx_todo_completions_user      on todo_completions(user_id);
create index if not exists idx_execution_logs_user        on execution_logs(user_id);
create index if not exists idx_execution_segments_user    on execution_segments(user_id);
create index if not exists idx_diary_entries_user         on diary_entries(user_id);
create index if not exists idx_next_actions_user          on next_actions(user_id);

commit;
