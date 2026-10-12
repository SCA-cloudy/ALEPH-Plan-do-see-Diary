-- T07 카드3 — 비밀번호를 바꾸면 이전에 발급한 로그인 표(토큰)가 더는 통하지 않게 한다. (T07-C114)
--
-- 발견 경위(T07 시험 기록): 임시 계정 t07-c로 비밀번호를 바꾼(PUT /auth/v1/user → 200) 뒤에도
--   바꾸기 전에 받은 같은 토큰으로 자료 목록 요청 200, /auth/v1/user 200이 돌아왔고,
--   옛 refresh 토큰으로 새 토큰까지 발급(200)되었다. 비밀번호가 바뀌어도 기존 로그인이 전부 살아 있었다.
--
-- 조치: auth.users의 비밀번호 칸(encrypted_password)이 바뀌면, 그 사람의 로그인 세션을 모두 지운다.
--   - 세션이 지워지면 t07_04의 assert_session()이 자료 요청을 401로 거절한다.
--   - 로그인 서버도 그 세션의 토큰을 거절하고, 세션에 딸린 refresh 토큰도 함께 사라진다.
--   - 비밀번호를 바꾼 본인도 다시 로그인해야 한다. (의도한 동작)
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (t07_04 이후)

begin;

create or replace function public.revoke_sessions_on_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    delete from auth.sessions where user_id = new.id;
  end if;
  return new;
end;
$$;

-- 이 함수는 트리거만 부른다. API로 직접 부를 수 없게 실행 권한을 모두 거둔다.
revoke all on function public.revoke_sessions_on_password_change() from public, anon, authenticated;

drop trigger if exists revoke_sessions_on_password_change on auth.users;
create trigger revoke_sessions_on_password_change
  after update of encrypted_password on auth.users
  for each row execute function public.revoke_sessions_on_password_change();

commit;
