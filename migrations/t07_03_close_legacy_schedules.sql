-- T07 카드4 보완 — 옛 테이블 schedules에 남아 있던 "누구나 읽고 쓰기" 정책을 없앤다.
--
-- 발견 경위: 2단계(t07_02_owner_rls.sql)로 9개 테이블을 잠근 뒤, 확인용 조회(pg_policies)를 해 보니
--   6번 이전 버전에서 만들어져 지금은 앱이 쓰지 않는 테이블 schedules에
--   'public all schedules → public' 정책이 남아 있었다. (로그인 없이도 읽고 쓸 수 있는 열린 문)
--   앱 코드와 schema.sql 어디에도 schedules가 없어서 2단계 목록에서 빠져 있었다.
--
-- 조치: 테이블과 자료는 지우지 않고(옛 자료 보존), 정책만 없앤다.
--   RLS가 켜져 있는데 정책이 하나도 없으면 API(로그인 여부 무관)로는 아무도 접근하지 못한다.
--
-- 실행 위치: Supabase 대시보드 > SQL Editor
-- 실행 결과 확인: pg_policies 조회에서 schedules의 정책 수가 0이 되었다.

drop policy if exists "public all schedules" on schedules;
