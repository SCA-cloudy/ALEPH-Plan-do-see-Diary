// Supabase 프로젝트 설정
// - publishable key는 브라우저에서 쓰도록 만든 "공개용" 키라 코드에 보여도 괜찮습니다.
// - 이 키만으로는 자료를 읽거나 쓸 수 없습니다. 로그인한 사람의 토큰과 DB의 주인 확인(RLS, migrations/t07_*.sql)이 있어야 합니다.
// - 비밀 키(service_role / secret)는 이 저장소 어디에도 두지 않습니다.
const SUPABASE_CONFIG = {
  url: "https://ljmjupdisabyqvoalkez.supabase.co",
  anonKey: "sb_publishable_q4es5GFGJDazfnBKrUTlvA_WLBSkEYN"
};
