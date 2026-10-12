-- T07 카드5 — 내 계정과 내 자료를 내가 직접 지우는 기능.
--
-- 로그인한 본인(auth.uid())의 계정만 지운다. 함수가 받는 값은 없다. (남의 번호를 넘길 방법이 없다)
-- auth.users 한 줄이 지워지면, t07_01에서 건 외래키(on delete cascade)로
--   9개 자료 테이블의 내 줄과 auth.sessions(로그인 세션)도 함께 지워진다.
-- 살아 있는 세션 확인(assert_session)을 먼저 거치므로, 로그아웃된 토큰으로는 부를 수 없다.
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (t07_01, t07_04 이후)

begin;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise sqlstate 'PT401' using message = '로그인이 필요합니다.';
  end if;
  perform public.assert_session();
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
