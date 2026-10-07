// Supabase 프로젝트 설정
// - anon/publishable key는 "공개용" 키라 브라우저에 노출돼도 괜찮습니다 (service_role 키와는 다름).
// - RLS 정책이 schema.sql에서 이미 "무로그인 공개 읽기/쓰기"로 설정되어 있어야 앱이 동작합니다.
const SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_PUBLISHABLE_ANON_KEY"
};
