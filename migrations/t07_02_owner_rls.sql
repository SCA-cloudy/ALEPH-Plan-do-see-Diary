-- T07 카드4 — "내 자료는 나만 열 수 있다"를 DB가 직접 지키게 만든다. (서버 쪽 주인 확인)
--
-- 이 파일이 "남의 자료 요청을 거절하는" 소스의 위치다. (T07-C126)
-- 화면에서 숨기는 것이 아니라, DB가 요청한 사람의 번호(auth.uid())와 자료의 주인(user_id)을 비교한다.
-- 주인이 아니면 그 줄은 읽기·수정·삭제 어느 쪽에서도 "없는 것"처럼 취급된다.
--   - 읽기(select) : 남의 줄이 목록에도, 한 건 조회에도 나오지 않는다.
--   - 수정(update) : 남의 줄은 대상에 잡히지 않아 0건 수정된다.
--   - 삭제(delete) : 남의 줄은 대상에 잡히지 않아 0건 삭제된다.
--   - 넣기(insert) : user_id를 남의 번호로 적어 보내면 규칙 위반으로 거절된다.
-- 로그인하지 않은 요청(anon)에게는 아무 정책도 주지 않으므로 어떤 줄도 보이지 않는다.
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (1단계 t07_01_owner_columns.sql을 먼저 실행해야 한다)

begin;

-- (1) 기존의 "누구나 읽고 쓰기" 정책(6번의 의도된 상태)을 모두 없앤다.
drop policy if exists "public all plans"          on plans;
drop policy if exists "public all psc"            on plan_success_criteria;
drop policy if exists "public all plan_history"   on plan_history;
drop policy if exists "public all todos"          on todos;
drop policy if exists "public all todo_completions" on todo_completions;
drop policy if exists "public all execution_logs" on execution_logs;
drop policy if exists "public all execution_segments" on execution_segments;
drop policy if exists "public all diary_entries"  on diary_entries;
drop policy if exists "public all next_actions"   on next_actions;

-- (2) "로그인한 사람이 자기 자료만" 정책을 만든다.
--   to authenticated : 로그인한 사람에게만 적용 (로그인 안 한 사람은 정책이 없어 전부 막힘)
--   using      : 어떤 줄을 보고·고치고·지울 수 있는가 → 주인이 나인 줄만
--   with check : 어떤 줄을 넣거나 고쳐서 저장할 수 있는가 → 주인이 나인 줄만
--   (select auth.uid()) : 요청한 사람의 번호. select로 감싸면 한 요청에 한 번만 계산해 빠르다.
create policy "own plans" on plans
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own plan_success_criteria" on plan_success_criteria
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own plan_history" on plan_history
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own todos" on todos
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own todo_completions" on todo_completions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own execution_logs" on execution_logs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own execution_segments" on execution_segments
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own diary_entries" on diary_entries
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own next_actions" on next_actions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

commit;
