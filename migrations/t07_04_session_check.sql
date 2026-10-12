-- T07 카드3 — 로그아웃한 토큰이 자료 요청에서 계속 통하던 구멍을 막는다.
--
-- 발견 경위(T07 시험 기록): t07-a로 로그인해 자료 목록을 요청하면 200, 로그아웃(204) 뒤에 같은 토큰으로
--   같은 요청을 다시 보내도 200과 같은 자료가 돌아왔다. 로그인 서버(/auth/v1/user)는 같은 토큰을
--   403 session_not_found로 거절했지만, 자료를 내주는 데이터 API(PostgREST)는 토큰의 서명과 만료 시각만
--   확인하고 세션이 남아 있는지는 보지 않기 때문이다. (토큰 만료 시각까지 최대 3600초 동안 통한다)
--
-- 조치:
--   (1) assert_session(): 토큰 안의 session_id가 auth.sessions에 아직 있는지 확인한다.
--       없으면 401로 거절한다. (PostgREST는 SQLSTATE 'PT401'을 HTTP 401로 돌려준다)
--   (2) 9개 테이블의 정책(t07_02에서 만든 own ...)에 이 확인을 덧붙인다.
--   (3) 로그인하지 않은 요청(anon)의 테이블 접근 권한을 아예 없앤다. 그러면 로그인 없이 자료를 요청했을 때
--       "빈 목록(200)"이 아니라 401 거절이 돌아온다. (옛 테이블 schedules도 함께)
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (t07_01, t07_02 이후)

begin;

-- (1) 로그인 세션이 아직 살아 있는지 확인하는 함수
--   security definer : auth 스키마를 읽을 수 있는 소유자 권한으로 실행된다.
--   set search_path = '' : 이름을 가로채는 공격을 막기 위해 모든 이름을 스키마까지 적는다.
create or replace function public.assert_session()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from auth.sessions s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.user_id = auth.uid()
  ) then
    return true;
  end if;
  raise sqlstate 'PT401' using message = '로그인이 끝난 세션입니다. 다시 로그인해 주세요.';
end;
$$;

revoke all on function public.assert_session() from public, anon;
grant execute on function public.assert_session() to authenticated;

-- (2)(3) 9개 테이블에 같은 규칙을 반복 적용한다.
do $$
declare t text;
begin
  foreach t in array array[
    'plans', 'plan_success_criteria', 'plan_history', 'todos', 'todo_completions',
    'execution_logs', 'execution_segments', 'diary_entries', 'next_actions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'own ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid()) and (select public.assert_session()))
         with check (user_id = (select auth.uid()) and (select public.assert_session()))',
      'own ' || t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- 옛 테이블(앱이 쓰지 않음): 로그인 여부와 상관없이 API 접근 권한을 모두 없앤다.
revoke all on public.schedules from anon, authenticated;

commit;
