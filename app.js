// ============================================================
// 플랜두씨 덱 (PlanDoSee Deck) — app.js
// Stream Deck+ 모양 화면 하나로 고정. 일정(Schedule) 한 건 = 키 한 칸.
// ============================================================
const sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
const $ = (id) => document.getElementById(id);

const KEYS_PER_PAGE = 8;
const DEFAULT_KEY_COLOR = "#1f2430";
const ICONS = ["📚","💻","🏃","🏋️","🎸","🎮","☕","🍽️","🛌","🎓","📝","📞","🛒","🧹","🚌","🎧","🎬","✏️","📅","🧠","🎯","🔔","🏠","⭐"];
const COLORS = ["#1f2430","#2563eb","#7c3aed","#db2777","#dc2626","#ea580c","#ca8a04","#16a34a","#0891b2","#475569"];

const CATEGORY_TEMPLATES = {
  "운동": [{key:"sport", label:"종목"}, {key:"target_intensity", label:"목표 강도/거리"}],
  "공부/자격증": [{key:"subject", label:"과목/범위"}, {key:"materials", label:"학습 자료"}],
  "업무": [{key:"project", label:"프로젝트명"}, {key:"collaborators", label:"협업자"}],
  "게임 연습": [{key:"game", label:"게임/모드"}, {key:"target_rank", label:"목표 랭크"}],
  "ALEPH 진행": [{key:"assignment_no", label:"과제 번호"}],
  "기타": []
};

// ---------- 공통 유틸 ----------
function escapeHtml(s){
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
let toastTimer;
function toast(msg){
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

// ---------- 시간대 ----------
function getDisplayTZ(){
  let saved = null;
  try { saved = localStorage.getItem("pds_display_timezone"); } catch (e) {}
  return saved || "Asia/Seoul";   // 과제 규칙: 지연 판정은 서울 시간 기준. 다른 지역 사용자는 설정에서 바꿀 수 있다.
}
function setDisplayTZ(tz){ try { localStorage.setItem("pds_display_timezone", tz); } catch (e) {} }
function todayInTZ(tz){ return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
function nowHHMM(tz){
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}
function addDays(dateStr, n){
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDateTime(iso, tz){
  if (!iso) return "-";
  try { return new Intl.DateTimeFormat("ko-KR", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)); }
  catch (e) { return iso; }
}
function fmtDate(d){ return d || "-"; }
function fmtHMS(ms){
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}
function parseEstimatedToMinutes(raw){
  if (!raw) return 0;
  let minutes = 0;
  const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:시간|h|hr|hrs|hour|hours)/i);
  const minMatch = raw.match(/(\d+)\s*(?:분|m|min|mins|minute|minutes)(?![a-z])/i);
  if (hourMatch) minutes += Math.round(parseFloat(hourMatch[1]) * 60);
  if (minMatch) minutes += parseInt(minMatch[1], 10);
  return minutes;
}

// ---------- 색 / 아이콘 안전 처리 ----------
function sanitizeColor(c){ return /^#[0-9a-f]{6}$/i.test(c || "") ? c.toLowerCase() : DEFAULT_KEY_COLOR; }
function textColorFor(hex){
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#10131a" : "#ffffff";
}
function limitIcon(s){ return Array.from(String(s || "").trim()).slice(0, 4).join(""); }

// ============================================================
// 화면 전환 (하단 뷰)
// ============================================================
function showView(name){
  document.querySelectorAll(".view").forEach(v => { v.hidden = v.id !== "view-" + name; });
  document.querySelectorAll(".view-tab").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  if (name === "monthly") renderMonthly();
  if (name === "review") renderReview();
  if (name === "diary") renderDiary();
}

// ============================================================
// 페이지 이동 (#/ 덱 · #/key 키 편집 · #/month 월별 · #/menu Plan·Do·See)
// ============================================================
const PAGES = { "": "home", "day": "day", "key": "key", "month": "month", "menu": "menu" };
let currentPage = "home";
function goPage(name){
  const want = name === "home" ? "#/" : "#/" + name;
  if (location.hash === want || (name === "home" && (location.hash === "" || location.hash === "#"))) renderPage();
  else location.hash = want;
}
async function renderPage(){
  const raw = location.hash.replace(/^#\/?/, "");
  let name = PAGES[raw] || "home";
  if (name === "day" && !deck.dayDate) name = "home";
  if (name === "key" && !deck.selected) name = deck.dayDate ? "day" : "home";          // 새로고침으로 편집 상태가 사라졌으면 덱으로
  const prev = currentPage;
  currentPage = name;
  ["home", "day", "key", "month", "menu"].forEach(p => { $("page-" + p).hidden = p !== name; });
  if (prev === "key" && name !== "key") closeInspector(true);
  const wasMonth = deck.monthOpen;
  deck.monthOpen = name === "month";
  if (name === "month") await showMonthTab(monthTab);
  if (name === "day"){ await refreshDeck(); renderDayPage(); }
  if (name === "home" || wasMonth) { renderKnobState(); if (name === "home") await refreshDeck(); }
  if (name === "menu") showView(document.querySelector(".view-tab.active")?.dataset.view || "plans");
  if (name !== prev) window.scrollTo(0, 0);
}

// ---------- 하루 페이지: 요일 키를 누르면 열리는 그 날의 할 일 목록 ----------
function dayProgress(t){
  if (isMultiDay(t)) return "";
  const logged = loggedMinutes(t), goal = Number(t.estimated_minutes) || 0;
  if (!logged && !goal) return "";
  const pct = goal ? Math.min(100, logged / goal * 100) : 0;
  return `<div class="acc"><div class="acc-text">오늘 누적 ${escapeHtml(fmtMin(logged))}${goal ? ` / 목표 ${escapeHtml(fmtMin(goal))}` : ""}</div>${goal ? `<div class="acc-bar${logged >= goal ? " full" : ""}"><i style="width:${pct}%"></i></div>` : ""}</div>`;
}
function renderDayPage(){
  const d = deck.dayDate;
  if (!d) return;
  $("day-title").textContent = `${d.slice(0, 4)}년 ${shortDate(d)}`;
  const list = deck.todos.filter(t => occursOn(t, d)).sort((x, y) => (!x.event_time - !y.event_time) * -1 || compareSchedules(x, y));
  $("day-list").innerHTML = list.length ? list.map(t => {
    const bg = sanitizeColor(t.color || DEFAULT_KEY_COLOR);
    const done = t.status === "done";
    const prio = { high: "높음", medium: "보통", low: "낮음" }[t.priority] || "보통";
    const meta = [isMultiDay(t) ? `${shortDate(t.due_date)} ~ ${shortDate(endOf(t))} · 체크만` : (t.event_time ? t.event_time.slice(0, 5) : "종일"), "우선순위 " + prio, t.estimated_time_raw ? "예상 " + t.estimated_time_raw : "", t.location || ""].filter(Boolean).join(" · ");
    return `<div class="day-row${done ? " done" : ""}">`
      + `<span class="day-chip" style="background:${bg};color:${textColorFor(bg)}">${escapeHtml(limitIcon(t.icon) || "•")}</span>`
      + `<div class="day-main"><b>${escapeHtml(t.title)}</b>${done ? ' <span class="badge-done">완료</span>' : ""}<div class="meta">${escapeHtml(meta)}</div>${dayProgress(t)}</div>`
      + `<div class="day-acts"><button class="btn ghost small" data-act="edit" data-id="${escapeHtml(t.id)}">편집</button>`
      + (timerState.status !== "idle" && timerState.todoId === t.id ? `<span class="badge-run">⏱ 측정 중</span>` : done ? `<button class="btn ghost small" data-act="undo" data-id="${escapeHtml(t.id)}">↩ 취소</button>`
              : (isMultiDay(t) ? "" : `<button class="btn ghost small" data-act="start" data-id="${escapeHtml(t.id)}">▶ 시작</button>`) + `<button class="btn primary small" data-act="done" data-id="${escapeHtml(t.id)}">✔ 완료</button>`)
      + `</div></div>`;
  }).join("") : `<div class="empty">이 날 등록된 할 일이 없어요. 위의 ＋ 버튼으로 추가해 보세요.</div>`;
}
async function dayAction(act, id){
  const t = deck.todos.find(x => x.id === id);
  if (!t) return;
  if (act === "edit"){ openInspector("edit", t); return; }
  if (act === "done"){ await completeTodo(id, null); return; }
  if (act === "undo"){ await undoTodo(id, null); return; }
  if (act === "start"){ deck.selected = { mode: "edit", id }; await keyStart(); deck.selected = null; }
}
function openDay(d){
  deck.viewDate = d;
  deck.dayDate = d;
  goPage("day");
}

// ============================================================
// 덱 (키 한 칸 = 할 일(Todo) 한 건. 일정이 곧 할 일)
// ============================================================
const deck = { actual: {}, viewDate: "", dayDate: "", items: [], todos: [], week: [], todaySchedules: [], monthOpen: false, selected: null, icon: "", color: DEFAULT_KEY_COLOR, saving: false };
let deckReq = 0;

// 여러 날 일정: due_date(시작일) ~ end_date(종료일). end_date가 없으면 하루짜리.
function endOf(t){ return t.end_date && t.end_date > t.due_date ? t.end_date : t.due_date; }
function occursOn(t, d){ return !!t.due_date && t.due_date <= d && d <= endOf(t); }
function loggedMinutes(t){
  let m = deck.actual[t.id] || 0;
  if (timerState.status !== "idle" && timerState.todoId === t.id) m += Math.floor(currentTimerMs() / 60000);
  return m;
}
function fmtMin(m){ m = Math.max(0, Math.round(m)); return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? " " + (m % 60) + "분" : ""}` : `${m}분`; }
function isMultiDay(t){ return !!t.due_date && endOf(t) > t.due_date; }
function compareSchedules(a, b){
  const ta = a.event_time || "99:99:99", tb = b.event_time || "99:99:99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  const ca = String(a.created_at || ""), cb = String(b.created_at || "");
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}

function weekStartOf(d){            // 월요일 시작
  const dt = new Date(d + "T00:00:00Z");
  const dow = (dt.getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}
function monthRange(ym){
  const from = ym + "-01";
  const nx = new Date(from + "T00:00:00Z");
  nx.setUTCMonth(nx.getUTCMonth() + 1);
  return { from, toExcl: nx.toISOString().slice(0, 10) };
}
async function fetchDeckData(date){
  const today = todayInTZ(getDisplayTZ());
  const ws = weekStartOf(date), we = addDays(ws, 6);
  const [t, lg] = await Promise.all([
    sb.from("todos").select("*").eq("is_deleted", false),
    sb.from("execution_logs").select("todo_id,actual_minutes")
  ]);
  const todos = t.data || [];
  const actual = {};
  (lg.data || []).forEach(l => { actual[l.todo_id] = (actual[l.todo_id] || 0) + (Number(l.actual_minutes) || 0); });
  const on = (d) => todos.filter(x => occursOn(x, d)).sort(compareSchedules);
  return {
    todos,
    week: todos.filter(x => x.due_date && x.due_date <= we && endOf(x) >= ws),
    todaySchedules: on(today),
    actual
  };
}
async function refreshDeck(){
  const my = ++deckReq;
  const date = deck.viewDate;
  const data = await fetchDeckData(date);
  if (my !== deckReq) return;            // 더 최신 요청이 있으면 버림
  deck.todos = data.todos;
  deck.week = data.week;
  deck.todaySchedules = data.todaySchedules;
  deck.actual = data.actual;
  renderKeys();
  renderStrip();
  if (deck.monthOpen) await renderMonthPanel();
  if (currentPage === "day") renderDayPage();
}

// ---------- 바로가기 키 (장식용 8번째 키: 누르면 링크로 이동. 이 브라우저에만 저장) ----------
const DEFAULT_SHORTCUT = { label: "YouTube", url: "https://www.youtube.com", icon: "▶", color: "#dc2626" };
function sanitizeUrl(u){
  try {
    const x = new URL(String(u || "").trim());
    return (x.protocol === "https:" || x.protocol === "http:") ? x.href : "";
  } catch (e) { return ""; }
}
function getShortcut(){
  try {
    const raw = JSON.parse(localStorage.getItem("pds_shortcut") || "null");
    if (raw && sanitizeUrl(raw.url)) return { label: String(raw.label || "").slice(0, 12), url: sanitizeUrl(raw.url), icon: limitIcon(raw.icon), color: sanitizeColor(raw.color) };
  } catch (e) {}
  return { ...DEFAULT_SHORTCUT };
}
function saveShortcut(sc){ try { localStorage.setItem("pds_shortcut", JSON.stringify(sc)); } catch (e) {} }

function initShortcutSettings(){
  const fill = () => { const sc = getShortcut(); $("sc-label").value = sc.label; $("sc-url").value = sc.url; $("sc-icon").value = sc.icon; $("sc-color").value = sc.color; };
  fill();
  $("sc-save").addEventListener("click", () => {
    const url = sanitizeUrl($("sc-url").value);
    if (!url){ toast("http:// 또는 https:// 로 시작하는 주소를 입력하세요."); return; }
    saveShortcut({ label: $("sc-label").value.trim().slice(0, 12) || "바로가기", url, icon: limitIcon($("sc-icon").value), color: sanitizeColor($("sc-color").value) });
    fill(); renderKeys(); toast("바로가기 키를 저장했어요.");
  });
  $("sc-reset").addEventListener("click", () => { saveShortcut({ ...DEFAULT_SHORTCUT }); fill(); renderKeys(); toast("기본(YouTube)으로 되돌렸어요."); });
}

function renderKeys(){
  const ws = weekStartOf(deck.viewDate), today = todayInTZ(getDisplayTZ());
  const byDay = {};
  (deck.week || []).forEach(r => { for (let i = 0; i < 7; i++){ const d = addDays(ws, i); if (occursOn(r, d)) (byDay[d] = byDay[d] || []).push(r); } });
  let html = "";
  for (let i = 0; i < 7; i++){
    const d = addDays(ws, i);
    const list = (byDay[d] || []).slice().sort(compareSchedules);
    const done = list.filter(x => x.status === "done").length;
    const more = `<i class="dchip more">+${list.length - 3}</i>`;
    const chips = list.slice(0, list.length > 4 ? 3 : 4).map(it => {
      const bg = sanitizeColor(it.color || DEFAULT_KEY_COLOR);
      return `<i class="dchip${it.status === "done" ? " done" : ""}" style="background:${bg};color:${textColorFor(bg)}">${escapeHtml(limitIcon(it.icon) || "•")}</i>`;
    }).join("");
    const prog = list.length ? `${done}/${list.length}` : "비어 있음";
    const cls = "key day" + (d === today ? " today" : "") + (d === deck.viewDate ? " selected" : "") + (list.length && done === list.length ? " alldone" : "");
    html += `<button class="${cls}" data-day="${d}" aria-label="${escapeHtml(shortDate(d) + " — " + (list.length ? list.length + "개 중 " + done + "개 완료" : "할 일 없음"))}">`
      + `<span class="key-face"><span class="kd-dow">${DOW_KO[dowOf(d)]}</span><span class="kd-num">${Number(d.slice(8, 10))}</span>`
      + `<span class="kd-chips">${chips}${list.length > 4 ? more : ""}</span><span class="kd-prog">${escapeHtml(prog)}</span></span></button>`;
  }
  const sc = getShortcut();
  html += `<button class="key shortcut" data-shortcut="1" aria-label="바로가기: ${escapeHtml(sc.label)}"><span class="key-face" style="--kbg:${sc.color};--kfg:${textColorFor(sc.color)}">`
    + `<span class="key-icon">${escapeHtml(sc.icon || "🔗")}</span><span class="key-title">${escapeHtml(sc.label)}</span></span></button>`;
  $("deck-keys").innerHTML = html;
  $("deck-date-input").value = deck.viewDate;
  $("deck-week-label").textContent = `${shortDate(ws)} ~ ${shortDate(addDays(ws, 6))}`;
  renderKnobState();
}


const DOW_KO = ["일","월","화","수","목","금","토"];
function dowOf(d){ return new Date(d + "T00:00:00Z").getUTCDay(); }
function shortDate(d){ return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${DOW_KO[dowOf(d)]})`; }

// 터치 스트립은 "오늘" 기준: 날짜·시계, 오늘 일정, 알림(곧 시작/지연), 타이머
function renderStrip(){
  const tz = getDisplayTZ(), today = todayInTZ(tz), now = nowHHMM(tz);
  $("strip-clock-name").textContent = shortDate(today);
  $("strip-clock-val").textContent = now;
  $("strip-clock-sub").textContent = tz;
  const [hh, mm] = now.split(":").map(Number);
  $("strip-clock-bar").style.width = ((hh * 60 + mm) / 1440 * 100) + "%";

  const list = deck.todaySchedules || [];
  const upcoming = list.filter(it => it.status !== "done" && it.event_time && it.event_time.slice(0, 5) >= now);
  const nextIt = upcoming[0] || null;
  const doneToday = list.filter(it => it.status === "done").length;
  $("strip-today-val").textContent = list.length ? `${doneToday}/${list.length} 완료` : "0개";
  $("strip-today-sub").textContent = list.length
    ? (nextIt ? `다음 ${nextIt.event_time.slice(0, 5)} ${nextIt.title}` : (doneToday === list.length ? "오늘 할 일 모두 끝!" : "시간 지정된 남은 일정 없음"))
    : "오늘 등록된 일정 없음";
  $("strip-today-bar").style.width = list.length ? (doneToday / list.length * 100) + "%" : "0%";

  const open = deck.todos.filter(t => t.status !== "done");
  const over = open.filter(t => t.due_date && endOf(t) < today);
  const dueToday = open.filter(t => occursOn(t, today));
  let val = "없음", sub = "오늘은 조용해요", bar = 0;
  if (nextIt){
    const [nh, nm] = nextIt.event_time.slice(0, 5).split(":").map(Number);
    const diff = nh * 60 + nm - (hh * 60 + mm);
    val = diff <= 0 ? "지금!" : diff < 60 ? `${diff}분 뒤` : `${Math.floor(diff / 60)}시간 ${diff % 60}분 뒤`;
    sub = nextIt.title;
    bar = diff <= 60 ? 100 - diff / 60 * 100 : 0;
  } else if (over.length){
    val = `지연 ${over.length}건`; sub = over[0].title; bar = 100;
  } else if (dueToday.length){
    val = `오늘 마감 ${dueToday.length}건`; sub = dueToday[0].title; bar = 50;
  }
  $("strip-alert-val").textContent = val;
  $("strip-alert-sub").textContent = (nextIt && over.length) ? `${sub} · 지연 ${over.length}건` : sub;
  $("strip-alert-bar").style.width = bar + "%";

  updateStripTimer();
}
function tickStripClock(){
  const tz = getDisplayTZ();
  const now = nowHHMM(tz);
  if ($("strip-clock-val").textContent !== now) renderStrip();
}

// ---------- 주간 바 / 월간 패널 / 노브 상태 ----------
function weekOffsetOf(d){
  const t = weekStartOf(todayInTZ(getDisplayTZ()));
  return Math.round((new Date(weekStartOf(d) + "T00:00:00Z") - new Date(t + "T00:00:00Z")) / (7 * 86400000));
}
function renderKnobState(){
  const st = timerState.status;
  const act = (n, on) => { const u = document.querySelector(`.knob-unit[data-knob="${n}"]`); if (u) u.classList.toggle("active", !!on); };
  act(1, false); act(2, st === "running"); act(3, false); act(4, currentPage === "month");
  $("knob-label-1").textContent = "Plan";
  $("knob-label-2").textContent = st === "running" ? "Do ⏸ 진행 중" : st === "paused" ? "Do ▶ 재개" : "Do ▶ 시작";
  $("knob-label-3").textContent = "See";
  $("knob-label-4").textContent = `월별 ${Number(deck.viewDate.slice(5, 7))}월`;
}
let monthTab = "calendar";
async function showMonthTab(name){
  monthTab = name;
  document.querySelectorAll(".mtab").forEach(b => b.classList.toggle("active", b.dataset.mtab === name));
  $("month-panel").hidden = name !== "calendar";
  $("view-todos").hidden = name !== "list";
  $("view-search").hidden = name !== "list";
  $("view-monthly").hidden = name !== "stats";
  if (name === "calendar") await renderMonthPanel();
  else if (name === "list") await renderTodosList();
  else await renderMonthly();
}
async function renderMonthPanel(){
  const ym = deck.viewDate.slice(0, 7);
  const { from, toExcl } = monthRange(ym);
  const myReq = ++monthReq;
  const t = await sb.from("todos").select("*").eq("is_deleted", false);
  if (myReq !== monthReq || !deck.monthOpen) return;
  const byDay = {}, todoByDay = {};
  const monthDays = Math.round((new Date(toExcl + "T00:00:00Z") - new Date(from + "T00:00:00Z")) / 86400000);
  (t.data || []).slice().sort(compareSchedules).forEach(r => {
    for (let i = 1; i <= monthDays; i++){
      const d = `${ym}-${String(i).padStart(2, "0")}`;
      if (occursOn(r, d)){ (byDay[d] = byDay[d] || []).push(r); (todoByDay[d] = todoByDay[d] || []).push(r); }
    }
  });
  const today = todayInTZ(getDisplayTZ());
  const lead = (dowOf(from) + 6) % 7;                 // 월요일 시작
  const days = Math.round((new Date(toExcl + "T00:00:00Z") - new Date(from + "T00:00:00Z")) / 86400000);
  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<div class="mcell blank"></div>`;
  for (let i = 1; i <= days; i++){
    const d = `${ym}-${String(i).padStart(2, "0")}`;
    const items = byDay[d] || [], tds = todoByDay[d] || [];
    const chips = items.slice(0, 3).map(it => {
      const bg = sanitizeColor(it.color || DEFAULT_KEY_COLOR);
      return `<span class="mchip${it.status === "done" ? " done" : ""}" style="--kbg:${bg};--kfg:${textColorFor(bg)}">${it.icon ? escapeHtml(limitIcon(it.icon)) + " " : ""}${escapeHtml(it.title)}</span>`;
    }).join("");
    const more = items.length > 3 ? `<span class="mmore">+${items.length - 3}</span>` : "";
    const td = tds.length ? `<span class="mtodo">✔ ${tds.filter(x => x.status === "done").length}/${tds.length}</span>` : "";
    cells += `<button type="button" class="mcell${d === today ? " today" : ""}${d === deck.viewDate ? " on" : ""}" data-day="${d}"><span class="mnum">${i}</span>${chips}${more}${td}</button>`;
  }
  $("month-panel").innerHTML =
    `<div class="month-head"><button class="tool-btn" id="month-prev" aria-label="지난달">◀</button><b>${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월</b><button class="tool-btn" id="month-next" aria-label="다음달">▶</button><button class="tool-btn text" id="month-today">오늘</button><button class="tool-btn text" id="month-close">닫기</button></div>`
    + `<div class="month-grid">${["월","화","수","목","금","토","일"].map(x => `<div class="mdow">${x}</div>`).join("")}${cells}</div>`;
}
function shiftMonth(dir){
  const d = new Date(deck.viewDate.slice(0, 7) + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + dir);
  return d.toISOString().slice(0, 10);
}

let monthReq = 0;
async function goToDate(d){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return;
  deck.viewDate = d;
  closeInspector(true);
  await refreshDeck();
}
// ---------- 키 인스펙터 ----------
function buildInspectorPalettes(){
  $("insp-icon-grid").innerHTML = ICONS.map(ic => `<button type="button" class="icon-btn" data-icon="${ic}" aria-label="아이콘 ${ic}">${ic}</button>`).join("");
  $("insp-color-grid").innerHTML = COLORS.map(c => `<button type="button" class="swatch" data-color="${c}" style="background:${c}" aria-label="색 ${c}"></button>`).join("");
}
function setPick(icon, color){
  deck.icon = icon || "";
  deck.color = sanitizeColor(color);
  document.querySelectorAll("#insp-icon-grid .icon-btn").forEach(b => b.classList.toggle("on", b.dataset.icon === deck.icon));
  document.querySelectorAll("#insp-color-grid .swatch").forEach(b => b.classList.toggle("on", b.dataset.color === deck.color));
  $("insp-icon-custom").value = ICONS.includes(deck.icon) ? "" : deck.icon;
  $("insp-color-input").value = deck.color;
  renderPreview();
}
function renderPreview(){
  const bg = sanitizeColor(deck.color), fg = textColorFor(bg);
  const time = $("insp-time").value, title = $("insp-title").value.trim();
  const el = $("insp-preview");
  el.style.setProperty("--kbg", bg);
  el.style.setProperty("--kfg", fg);
  el.innerHTML = (time ? `<span class="key-time">${escapeHtml(time)}</span>` : "")
    + (deck.icon ? `<span class="key-icon">${escapeHtml(deck.icon)}</span>` : "")
    + `<span class="key-title">${escapeHtml(title || "새 매크로")}</span>`;
}
async function fillInspPlans(selected){
  const plans = await loadPlans();
  $("insp-plan").innerHTML = `<option value="">(계획에 속하지 않음)</option>` + plans.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}</option>`).join("");
  $("insp-plan").value = selected || "";
}
function openInspector(mode, item, slot){
  deck.selected = mode === "edit" ? { mode, id: item.id } : { mode, slot };
  $("insp-empty").hidden = true;
  $("insp-form").hidden = false;
  $("insp-close").hidden = false;
  $("insp-date").value = item ? item.due_date : (deck.dayDate || deck.viewDate);
  $("insp-end").value = item && item.end_date ? item.end_date : "";
  $("insp-time").value = item && item.event_time ? item.event_time.slice(0, 5) : "";
  $("insp-title").value = item ? item.title : "";
  $("insp-location").value = item ? (item.location || "") : "";
  $("insp-memo").value = item ? (item.memo || "") : "";
  $("insp-delete").hidden = mode !== "edit";
  $("insp-save").textContent = mode === "edit" ? "저장" : "키에 등록";
  $("insp-priority").value = item && item.priority ? item.priority : "medium";
  $("insp-estimated").value = item ? (item.estimated_time_raw || "") : "";
  fillInspPlans(item ? item.plan_id : "");
  $("insp-run-actions").hidden = mode !== "edit";
  if (item){
    $("insp-complete").textContent = item.status === "done" ? "↩ 완료 취소" : "✔ 완료";
    $("insp-start").hidden = item.status === "done" || isMultiDay(item);
  }
  setPick(item ? (item.icon || "") : "", item ? item.color : DEFAULT_KEY_COLOR);
  goPage("key");
  setTimeout(() => $("insp-title").focus(), 50);
}
function closeInspector(skipRender){
  deck.selected = null;
  $("insp-empty").hidden = false;
  $("insp-form").hidden = true;
  $("insp-close").hidden = true;
  if (!skipRender) renderKeys();
}
async function saveKey(){
  if (deck.saving) return;
  const title = $("insp-title").value.trim();
  if (!title){ toast("내용을 입력하세요."); return; }
  const estRaw = $("insp-estimated").value.trim();
  const endVal = $("insp-end").value;
  const payload = {
    due_date: $("insp-date").value || deck.viewDate,
    end_date: null,
    event_time: $("insp-time").value || null,
    title,
    location: $("insp-location").value.trim(),
    memo: $("insp-memo").value.trim(),
    icon: deck.icon,
    color: sanitizeColor(deck.color),
    priority: $("insp-priority").value || "medium",
    plan_id: $("insp-plan").value || null,
    estimated_time_raw: estRaw,
    estimated_minutes: parseEstimatedToMinutes(estRaw)
  };
  if (endVal){
    if (endVal < payload.due_date){ toast("종료일은 시작일보다 빠를 수 없어요."); return; }
    if (endVal > payload.due_date) payload.end_date = endVal;
  }
  deck.saving = true;
  $("insp-save").disabled = true;
  try {
    const sel = deck.selected;
    let error;
    if (sel && sel.mode === "edit") ({ error } = await sb.from("todos").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", sel.id));
    else ({ error } = await sb.from("todos").insert({ ...payload, status: "in_progress" }));
    if (error){ toast("저장 실패: " + error.message); return; }
    toast(sel && sel.mode === "edit" ? "키를 수정했습니다." : "키에 일정을 등록했습니다.");
    closeInspector(true);
    deck.viewDate = payload.due_date; deck.dayDate = payload.due_date;
    goPage("day");
    await refreshDeck();
  } finally {
    deck.saving = false;
    $("insp-save").disabled = false;
  }
}
async function keyComplete(){
  const sel = deck.selected;
  if (!sel || sel.mode !== "edit") return;
  const it = deck.todos.find(x => x.id === sel.id);
  if (!it) return;
  if (it.status === "done") await undoTodo(sel.id, null);
  else await completeTodo(sel.id, null);
  goPage("day");
}
async function keyStart(){
  const sel = deck.selected;
  if (!sel || sel.mode !== "edit") return;
  if (timerState.status !== "idle"){ toast("이미 실행 중인 타이머가 있어요. 먼저 멈춰 주세요."); return; }
  const id = sel.id;
  await fillDoTodoSelector();
  $("do-todo-select").value = id;
  onDoTodoChanged();
  await timerStart();
  if (!deck.dayDate) deck.dayDate = deck.viewDate;
  goPage("day");
  renderKeys();
}
async function deleteKey(){
  const sel = deck.selected;
  if (!sel || sel.mode !== "edit") return;
  if (!confirm("이 키(일정)를 삭제할까요?")) return;
  const { error } = await sb.from("todos").update({ is_deleted: true, updated_at: new Date().toISOString() }).eq("id", sel.id);
  if (error){ toast("삭제 실패: " + error.message); return; }
  toast("할 일을 삭제했습니다.");
  closeInspector(true);
  goPage("day");
  await refreshDeck();
}

// ---------- 노브 ----------
const knobAngle = [0, 0, 0, 0];
let lastWheel = 0;
function spinKnob(n, dir){
  knobAngle[n - 1] += dir * 36;
  $("knob-dial-" + n).style.transform = `rotate(${knobAngle[n - 1]}deg)`;
}
// 노브 4개 = Plan · Do · See · 월별
//   누르기: Plan→계획 페이지 / Do→타이머 시작·일시정지·재개 / See→돌아보기 / 월별→월간 달력
//   돌리기: Plan→이전/다음 주 / Do→오늘 할 일 선택 / See→계획 선택 / 월별→이전/다음 달
function undoneTodayFirst(){
  const today = todayInTZ(getDisplayTZ());
  const open = deck.todos.filter(t => t.status !== "done" && !isMultiDay(t));
  const todayList = open.filter(t => t.due_date === today).sort(compareSchedules);
  return todayList.length ? todayList : open.slice().sort((x, y) => String(x.due_date || "9").localeCompare(String(y.due_date || "9")) || compareSchedules(x, y));
}
function cycleDoTarget(dir){
  if (timerState.status !== "idle"){ toast("타이머 실행 중에는 할 일을 바꿀 수 없어요."); return; }
  const list = undoneTodayFirst();
  if (!list.length){ toast("진행할 할 일이 없어요. 요일 키에서 할 일을 추가해 보세요."); return; }
  const sel = $("do-todo-select");
  let i = list.findIndex(t => t.id === sel.value);
  i = i < 0 ? 0 : (i + dir + list.length) % list.length;
  sel.value = list[i].id;
  onDoTodoChanged();
  toast("▸ Do 대상: " + list[i].title);
}
function cycleReviewPlan(dir){
  const sel = $("review-plan-select");
  const opts = [...sel.options].filter(o => o.value);
  if (!opts.length){ toast("아직 계획이 없어요. Plan 노브를 눌러 계획을 만들어 보세요."); return; }
  let i = opts.findIndex(o => o.value === sel.value);
  i = i < 0 ? 0 : (i + dir + opts.length) % opts.length;
  sel.value = opts[i].value;
  toast("▸ See 대상: " + opts[i].textContent);
  if (currentPage === "menu") renderReview();
}
async function knobTurn(n, dir){
  spinKnob(n, dir);
  if (n === 1) await goToDate(addDays(deck.viewDate, dir * 7));
  else if (n === 2){ if (timerState.status === "idle") toast("측정할 할 일은 노브를 눌러 오늘 페이지에서 ▶ 시작으로 고르세요."); }
  else if (n === 3) cycleReviewPlan(dir);
  else await goToDate(shiftMonth(dir));
}
async function knobPress(n){
  if (n === 1){ showView("plans"); goPage("menu"); }
  else if (n === 2){
    if (timerState.status === "idle"){
      // 무엇을 측정할지 고르는 곳 = 오늘의 할 일 페이지 (각 할 일 옆 ▶ 시작)
      openDay(todayInTZ(getDisplayTZ()));
      toast("측정할 할 일의 ▶ 시작을 눌러 주세요.");
    }
    else if (timerState.status === "running") await timerPause();
    else await timerResume();
    renderKnobState();
  }
  else if (n === 3){ showView("review"); goPage("menu"); }
  else goPage("month");
}

// ============================================================
// Plan
// ============================================================
let editingPlanId = null;
let criteriaRowSeq = 0;

function renderCategoryOptions(){
  const sel = $("plan-category");
  sel.innerHTML = Object.keys(CATEGORY_TEMPLATES).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  sel.addEventListener("change", () => renderPlanDetailsExtra());
  renderPlanDetailsExtra();
}
function renderPlanDetailsExtra(existing){
  const cat = $("plan-category").value;
  const fields = CATEGORY_TEMPLATES[cat] || [];
  const wrap = $("plan-details-extra");
  const vals = existing || {};
  if (cat === "기타"){
    wrap.innerHTML = `<div id="freeform-rows"></div><button type="button" class="btn ghost small" id="add-freeform-row">+ 필드 추가</button>`;
    const rows = $("freeform-rows");
    const entries = Object.entries(vals).length ? Object.entries(vals) : [["", ""]];
    entries.forEach(([k, v]) => addFreeformRow(rows, k, v));
    $("add-freeform-row").addEventListener("click", () => addFreeformRow(rows, "", ""));
  } else if (fields.length){
    wrap.innerHTML = `<div class="grid-2">` + fields.map(f =>
      `<div class="field"><label>${escapeHtml(f.label)}</label><input data-key="${escapeHtml(f.key)}" class="cat-field" value="${escapeHtml(vals[f.key] || "")}"></div>`
    ).join("") + `</div>`;
  } else {
    wrap.innerHTML = "";
  }
}
function addFreeformRow(container, k, v){
  const row = document.createElement("div");
  row.className = "grid-2";
  row.style.marginBottom = "8px";
  row.innerHTML = `<input placeholder="필드명" class="ff-key" value="${escapeHtml(k)}"><input placeholder="값" class="ff-val" value="${escapeHtml(v)}">`;
  container.appendChild(row);
}
function collectPlanDetails(){
  const cat = $("plan-category").value;
  const details = {};
  if (cat === "기타"){
    document.querySelectorAll("#freeform-rows > div").forEach(row => {
      const k = row.querySelector(".ff-key").value.trim(), v = row.querySelector(".ff-val").value.trim();
      if (k) details[k] = v;
    });
  } else {
    document.querySelectorAll(".cat-field").forEach(inp => { if (inp.value.trim()) details[inp.dataset.key] = inp.value.trim(); });
  }
  return details;
}
function addCriterionRow(label, checked){
  const row = document.createElement("div");
  row.className = "criterion-row";
  row.id = "crit-" + (criteriaRowSeq++);
  row.innerHTML = `<input type="checkbox" class="crit-checked" ${checked ? "checked" : ""} aria-label="달성 여부">
    <input class="crit-label" placeholder="예: 주 3회 실행" value="${escapeHtml(label || "")}" style="flex:1;">
    <button type="button" class="btn ghost small crit-remove">삭제</button>`;
  row.querySelector(".crit-remove").addEventListener("click", () => row.remove());
  $("plan-criteria-rows").appendChild(row);
}
function collectCriteria(){
  return [...document.querySelectorAll(".criterion-row")].map((row, i) => ({
    label: row.querySelector(".crit-label").value.trim(),
    is_checked: row.querySelector(".crit-checked").checked,
    order_no: i
  })).filter(c => c.label);
}

async function submitPlan(){
  const title = $("plan-title").value.trim();
  const category = $("plan-category").value;
  const details = collectPlanDetails();
  const period_start = $("plan-period-start").value;
  const period_end = $("plan-period-end").value;
  const priority = $("plan-priority").value || null;
  const estimated_time_raw = $("plan-estimated-raw").value.trim();
  const estimated_minutes = parseInt($("plan-estimated-minutes").value, 10) || parseEstimatedToMinutes(estimated_time_raw);
  const criteria = collectCriteria();

  if (!title || !period_start || !period_end){ toast("제목과 기간은 필수입니다."); return; }
  if (period_end < period_start){ toast("종료일이 시작일보다 앞서 있어요."); return; }

  if (editingPlanId){
    const { data: current } = await sb.from("plans").select("*").eq("id", editingPlanId).single();
    const { data: currentCriteria } = await sb.from("plan_success_criteria").select("*").eq("plan_id", editingPlanId);
    const { count } = await sb.from("plan_history").select("*", { count: "exact", head: true }).eq("plan_id", editingPlanId);
    await sb.from("plan_history").insert({
      plan_id: editingPlanId, version_no: (count || 0) + 1,
      snapshot: { plan: current, success_criteria: currentCriteria }
    });
    await sb.from("plans").update({
      title, category, details, period_start, period_end, priority, estimated_time_raw, estimated_minutes,
      updated_at: new Date().toISOString()
    }).eq("id", editingPlanId);
    await sb.from("plan_success_criteria").delete().eq("plan_id", editingPlanId);
    if (criteria.length) await sb.from("plan_success_criteria").insert(criteria.map(c => ({ ...c, plan_id: editingPlanId })));
    toast("계획을 수정했습니다. (이전 내용은 이력에 보존됨)");
    cancelPlanEdit();
  } else {
    const { data: newPlan, error } = await sb.from("plans").insert({
      title, category, details, period_start, period_end, priority, estimated_time_raw, estimated_minutes
    }).select().single();
    if (error){ toast("저장 실패: " + error.message); return; }
    if (criteria.length) await sb.from("plan_success_criteria").insert(criteria.map(c => ({ ...c, plan_id: newPlan.id })));
    toast("새 계획을 저장했습니다.");
  }
  $("plan-title").value = "";
  $("plan-estimated-raw").value = "";
  $("plan-estimated-minutes").value = "";
  $("plan-criteria-rows").innerHTML = "";
  addCriterionRow("", false);
  renderPlanDetailsExtra();
  await refreshAll();
}
function startPlanEdit(plan, criteria){
  editingPlanId = plan.id;
  showView("plans");
  $("plan-title").value = plan.title;
  $("plan-category").value = plan.category;
  renderPlanDetailsExtra(plan.details);
  $("plan-period-start").value = plan.period_start;
  $("plan-period-end").value = plan.period_end;
  $("plan-priority").value = plan.priority || "";
  $("plan-estimated-raw").value = plan.estimated_time_raw || "";
  $("plan-estimated-minutes").value = plan.estimated_minutes || "";
  $("plan-criteria-rows").innerHTML = "";
  (criteria || []).forEach(c => addCriterionRow(c.label, c.is_checked));
  if (!(criteria || []).length) addCriterionRow("", false);
  $("plan-edit-hint").hidden = false;
  $("views").scrollIntoView({ behavior: "smooth" });
}
function cancelPlanEdit(){ editingPlanId = null; $("plan-edit-hint").hidden = true; }

async function loadPlans(){
  const { data, error } = await sb.from("plans").select("*").eq("is_deleted", false).order("created_at", { ascending: false });
  if (error){ toast("계획 로드 실패: " + error.message); return []; }
  return data || [];
}
async function renderPlansList(){
  const plans = await loadPlans();
  const wrap = $("plans-list");
  if (!plans.length){ wrap.innerHTML = `<div class="empty">아직 계획이 없습니다.</div>`; return; }
  const ids = plans.map(p => p.id);
  const { data: allCrit } = await sb.from("plan_success_criteria").select("*").in("plan_id", ids).order("order_no", { ascending: true });
  const critByPlan = {};
  (allCrit || []).forEach(c => { (critByPlan[c.plan_id] = critByPlan[c.plan_id] || []).push(c); });

  wrap.innerHTML = plans.map(p => `
    <div class="list-item">
      <div class="row">
        <div><strong>${escapeHtml(p.title)}</strong> <span class="tag">${escapeHtml(p.category)}</span>${p.priority ? `<span class="tag">${p.priority === "high" ? "높음" : p.priority === "low" ? "낮음" : "보통"}</span>` : ""}</div>
        <div><button class="btn ghost small" data-edit-plan="${escapeHtml(p.id)}">수정</button> <button class="btn danger small" data-delete-plan="${escapeHtml(p.id)}">삭제</button></div>
      </div>
      <div class="meta">기간 ${escapeHtml(fmtDate(p.period_start))} ~ ${escapeHtml(fmtDate(p.period_end))} · 예상 ${escapeHtml(p.estimated_time_raw || "")} (${Number(p.estimated_minutes) || 0}분)</div>
      ${Object.keys(p.details || {}).length ? `<div class="meta">${Object.entries(p.details).map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`).join(" · ")}</div>` : ""}
      ${(critByPlan[p.id] || []).map(c => `<div class="meta"><label><input type="checkbox" data-crit-toggle="${escapeHtml(c.id)}" ${c.is_checked ? "checked" : ""}> ${escapeHtml(c.label)}</label></div>`).join("")}
      <div class="meta"><button class="btn ghost small" data-show-history="${escapeHtml(p.id)}">🕓 수정 이력 보기</button></div>
      <div id="history-${escapeHtml(p.id)}"></div>
    </div>`).join("");

  wrap.querySelectorAll("[data-edit-plan]").forEach(btn => btn.addEventListener("click", () =>
    startPlanEdit(plans.find(p => p.id === btn.dataset.editPlan), critByPlan[btn.dataset.editPlan])));
  wrap.querySelectorAll("[data-delete-plan]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("이 계획을 삭제할까요? (딸린 할 일은 그대로 남지만 계획과의 연결 집계에서는 빠집니다)")) return;
    await sb.from("plans").update({ is_deleted: true }).eq("id", btn.dataset.deletePlan);
    toast("삭제했습니다.");
    refreshAll();
  }));
  wrap.querySelectorAll("[data-crit-toggle]").forEach(chk => chk.addEventListener("change", async () => {
    await sb.from("plan_success_criteria").update({ is_checked: chk.checked }).eq("id", chk.dataset.critToggle);
    toast("체크리스트를 갱신했습니다.");
  }));
  wrap.querySelectorAll("[data-show-history]").forEach(btn => btn.addEventListener("click", async () => {
    const pid = btn.dataset.showHistory;
    const { data } = await sb.from("plan_history").select("*").eq("plan_id", pid).order("version_no", { ascending: false });
    const tz = getDisplayTZ();
    $("history-" + pid).innerHTML = (data || []).map(h => `
      <div class="history-item">v${Number(h.version_no)} (${escapeHtml(fmtDateTime(h.edited_at, tz))}) — "${escapeHtml(h.snapshot.plan.title)}", 기간 ${escapeHtml(h.snapshot.plan.period_start)}~${escapeHtml(h.snapshot.plan.period_end)}, 예상 ${Number(h.snapshot.plan.estimated_minutes) || 0}분
      ${(h.snapshot.success_criteria || []).length ? " · 성공 기준: " + (h.snapshot.success_criteria || []).map(c => escapeHtml(c.label)).join(", ") : ""}</div>`).join("")
      || `<div class="empty">이력 없음</div>`;
  }));
}

// ============================================================
// Todo
// ============================================================
let editingTodoId = null;

async function fillPlanSelectors(){
  const plans = await loadPlans();
  const opts = plans.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}</option>`).join("");
  const prevTodoPlan = $("todo-plan-select").value;
  $("todo-plan-select").innerHTML = `<option value="">연결 안 함</option>` + opts;
  if (plans.find(p => p.id === prevTodoPlan)) $("todo-plan-select").value = prevTodoPlan;
  const reviewSel = $("review-plan-select"), prevReview = reviewSel.value;
  reviewSel.innerHTML = opts || `<option value="">(계획 없음)</option>`;
  if (plans.find(p => p.id === prevReview)) reviewSel.value = prevReview;
  const scopeSel = $("todo-scope-select"), prevScope = scopeSel.value;
  scopeSel.innerHTML = `<option value="all">전체 Todo</option>` + opts;
  if (prevScope === "all" || plans.find(p => p.id === prevScope)) scopeSel.value = prevScope;
}
async function submitTodo(){
  const title = $("todo-title").value.trim();
  if (!title){ toast("제목을 입력하세요."); return; }
  const due_date = $("todo-due").value || null;
  const plan_id = $("todo-plan-select").value || null;
  const priority = $("todo-priority").value;
  const tags = $("todo-tags").value.split(",").map(s => s.trim()).filter(Boolean);
  const estimated_time_raw = $("todo-estimated-raw").value.trim();
  const estimated_minutes = parseInt($("todo-estimated-minutes").value, 10) || parseEstimatedToMinutes(estimated_time_raw);
  const memo = $("todo-memo").value;

  if (editingTodoId){
    const { error } = await sb.from("todos").update({
      title, due_date, plan_id, priority, tags, estimated_time_raw, estimated_minutes, memo, updated_at: new Date().toISOString()
    }).eq("id", editingTodoId);
    if (error){ toast("수정 실패: " + error.message); return; }
    toast("할 일을 수정했습니다.");
    cancelTodoEdit();
  } else {
    const { error } = await sb.from("todos").insert({
      title, due_date, plan_id, priority, tags, estimated_time_raw, estimated_minutes, memo, status: "in_progress"
    });
    if (error){ toast("저장 실패: " + error.message); return; }
    toast("할 일을 추가했습니다.");
  }
  ["todo-title", "todo-due", "todo-tags", "todo-estimated-raw", "todo-estimated-minutes", "todo-memo"].forEach(id => { $(id).value = ""; });
  await renderTodosList();
  await fillDoTodoSelector();
  await refreshDeck();
}
function startTodoEdit(t){
  editingTodoId = t.id;
  $("todo-title").value = t.title;
  $("todo-due").value = t.due_date || "";
  $("todo-plan-select").value = t.plan_id || "";
  $("todo-priority").value = t.priority || "medium";
  $("todo-tags").value = (t.tags || []).join(",");
  $("todo-estimated-raw").value = t.estimated_time_raw || "";
  $("todo-estimated-minutes").value = t.estimated_minutes;
  $("todo-memo").value = t.memo || "";
  $("todo-detail-fields").hidden = false;
  $("todo-edit-hint").hidden = false;
  $("todo-title").focus();
}
function cancelTodoEdit(){ editingTodoId = null; $("todo-edit-hint").hidden = true; }

async function loadTodosForScope(scope){
  let q = sb.from("todos").select("*").eq("is_deleted", false);
  if (scope && scope !== "all") q = q.eq("plan_id", scope);
  const { data, error } = await q;
  if (error){ toast("할 일 로드 실패: " + error.message); return []; }
  return data || [];
}
function applySearchFilterSort(todos){
  const q = $("todo-search").value.trim().toLowerCase();
  const statusFilter = $("todo-filter-status").value;
  const sortKey = $("todo-sort").value;
  const result = todos.filter(t => {
    if (q && !String(t.title).toLowerCase().includes(q)) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });
  const prioRank = { high: 0, medium: 1, low: 2 };
  const pr = (t) => prioRank[t.priority] ?? 1;
  const dueOf = (t) => t.due_date || "9999-99-99";
  const byCreated = (a, b) => new Date(a.created_at) - new Date(b.created_at);
  if (sortKey === "due_asc"){
    result.sort((a, b) => dueOf(a) !== dueOf(b) ? (dueOf(a) < dueOf(b) ? -1 : 1) : (pr(a) - pr(b)) || byCreated(a, b));
  } else if (sortKey === "priority_desc"){
    result.sort((a, b) => (pr(a) - pr(b)) || (dueOf(a) < dueOf(b) ? -1 : dueOf(a) > dueOf(b) ? 1 : byCreated(a, b)));
  } else {
    result.sort((a, b) => byCreated(b, a));
  }
  return result;
}
async function renderTodosList(){
  const todos = await loadTodosForScope($("todo-scope-select").value);
  const filtered = applySearchFilterSort(todos);
  const wrap = $("todos-list");
  if (!filtered.length){ wrap.innerHTML = `<div class="empty">조건에 맞는 할 일이 없습니다.</div>`; return; }
  wrap.innerHTML = filtered.map(t => `
    <div class="list-item ${t.status === "done" ? "done" : ""}">
      <div class="row">
        <div>
          <label style="display:inline-flex;align-items:center;gap:8px;color:var(--text);font-size:14px;margin:0;">
            <input type="checkbox" data-toggle="${escapeHtml(t.id)}" ${t.status === "done" ? "checked" : ""}>
            <strong>${escapeHtml(t.title)}</strong>
          </label>
          <span class="tag">${t.priority === "high" ? "높음" : t.priority === "low" ? "낮음" : "보통"}</span>
          ${(t.tags || []).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}
        </div>
        <div><button class="btn ghost small" data-edit-todo="${escapeHtml(t.id)}">수정</button> <button class="btn danger small" data-delete-todo="${escapeHtml(t.id)}">삭제</button></div>
      </div>
      <div class="meta">마감 ${escapeHtml(fmtDate(t.due_date))} · 예상 ${escapeHtml(t.estimated_time_raw || (Number(t.estimated_minutes) || 0) + "분")}</div>
      ${t.memo ? `<div class="meta">${escapeHtml(t.memo)}</div>` : ""}
    </div>`).join("");
  wrap.querySelectorAll("[data-toggle]").forEach(chk => chk.addEventListener("change", () =>
    chk.checked ? completeTodo(chk.dataset.toggle, chk) : undoTodo(chk.dataset.toggle, chk)));
  wrap.querySelectorAll("[data-edit-todo]").forEach(btn => btn.addEventListener("click", () =>
    startTodoEdit(todos.find(t => t.id === btn.dataset.editTodo))));
  wrap.querySelectorAll("[data-delete-todo]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("이 할 일을 삭제할까요?")) return;
    await sb.from("todos").update({ is_deleted: true }).eq("id", btn.dataset.deleteTodo);
    toast("삭제했습니다.");
    await renderTodosList();
    await fillDoTodoSelector();
    await refreshDeck();
  }));
}
// 완료: 버튼 잠금은 보조일 뿐, 실제 방지는 "status<>'done' 조건부 UPDATE"가 DB에서 원자적으로 처리한다.
async function completeTodo(todoId, chkEl){
  if (chkEl) chkEl.disabled = true;
  const { data, error } = await sb.from("todos")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", todoId).neq("status", "done").select();
  if (error){ toast("처리 실패: " + error.message); if (chkEl) chkEl.disabled = false; return; }
  if (data && data.length > 0){
    // DB에 todo_id UNIQUE 제약이 있어서, 혹시 위 조건부 갱신을 우회한 중복 요청이 와도 두 번째 INSERT는 거부된다(23505).
    const ins = await sb.from("todo_completions").insert({ todo_id: todoId });
    if (ins.error && ins.error.code !== "23505") toast("완료 기록 저장 실패: " + ins.error.message);
    toast("완료로 표시했어요 ✔");
  } else {
    toast("이미 완료 상태입니다. (중복 기록되지 않음)");
  }
  await renderTodosList();
  await fillDoTodoSelector();
  await refreshDeck();
}
async function undoTodo(todoId, chkEl){
  if (chkEl) chkEl.disabled = true;
  const { data: undone } = await sb.from("todos").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", todoId).eq("status", "done").select();
  if (undone && undone.length > 0) await sb.from("todo_completions").delete().eq("todo_id", todoId);   // 되돌리면 완료 기록도 지워 "현재 완료 수"와 맞춘다
  toast("진행 중으로 되돌렸습니다.");
  await renderTodosList();
  await fillDoTodoSelector();
  await refreshDeck();
}

// ============================================================
// Do — 타이머 (START/PAUSE/RESUME/STOP/COMPLETE) + 수동 기록
// ============================================================
function freshTimerState(){
  return { logId: null, todoId: null, status: "idle", accumulatedMs: 0, segmentStart: null, intervalHandle: null, pendingEnd: null, busy: false };
}
let timerState = freshTimerState();

function setTimerButtons(state){
  $("timer-start-btn").hidden = state !== "idle";
  $("timer-pause-btn").hidden = state !== "running";
  $("timer-resume-btn").hidden = state !== "paused";
  $("timer-stop-btn").hidden = state === "idle";
  $("timer-complete-btn").hidden = state === "idle";
}
function currentTimerMs(){
  return timerState.accumulatedMs + (timerState.status === "running" ? Date.now() - timerState.segmentStart : 0);
}
let lastBarKey = "idle";
function updateTimerBar(){
  const st = timerState.status, bar = $("timer-bar");
  const key = st + ":" + (timerState.todoId || "");
  bar.hidden = st === "idle";
  if (st !== "idle"){
    const t = deck.todos.find(x => x.id === timerState.todoId);
    $("tb-title").textContent = t ? t.title : "측정 중";
    $("tb-time").textContent = fmtHMS(currentTimerMs());
    $("tb-state").textContent = st === "running" ? "측정 중" : "일시정지";
    $("tb-pause").hidden = st !== "running";
    $("tb-resume").hidden = st !== "paused";
    bar.classList.toggle("paused", st === "paused");
  } else {
    $("tb-reason").hidden = true; $("tb-reason-input").value = "";
  }
  if (key !== lastBarKey){ lastBarKey = key; if (currentPage === "day") renderDayPage(); }
}
function updateStripTimer(){
  updateTimerBar();
  const ms = currentTimerMs();
  $("strip-timer-val").textContent = fmtHMS(ms);
  $("timer-display").textContent = fmtHMS(ms);
  const sel = $("do-todo-select");
  const opt = sel.selectedOptions && sel.selectedOptions[0];
  $("strip-timer-sub").textContent = opt && sel.value ? opt.textContent : "할 일 없음";
  const todoId = timerState.todoId || sel.value;
  const t = deck.todos.find(x => x.id === todoId);
  const est = t ? (Number(t.estimated_minutes) || 0) : 0;
  const acc = t ? loggedMinutes(t) : 0;
  if (t && !isMultiDay(t) && (acc || est)) $("strip-timer-sub").textContent = `${t.title} · 누적 ${fmtMin(acc)}${est ? " / " + fmtMin(est) : ""}`;
  $("strip-timer-bar").style.width = est > 0 ? Math.min(100, acc / est * 100) + "%" : "0%";
  renderKnobState();
}
function resetTimerUI(){
  clearInterval(timerState.intervalHandle);
  timerState = freshTimerState();
  setTimerButtons("idle");
  $("stop-reason-box").hidden = true;
  $("stop-reason-input").value = "";
  updateStripTimer();
}
async function fillDoTodoSelector(){
  const { data } = await sb.from("todos").select("id,title,status").eq("is_deleted", false).order("created_at", { ascending: false });
  const sel = $("do-todo-select");
  const prev = timerState.status !== "idle" ? timerState.todoId : sel.value;
  sel.innerHTML = (data || []).map(t => `<option value="${escapeHtml(t.id)}">${t.status === "done" ? "✔ " : ""}${escapeHtml(t.title)}</option>`).join("")
    || `<option value="">(할 일 없음)</option>`;
  if ((data || []).find(t => t.id === prev)) sel.value = prev;
  if (timerState.status === "idle") resetTimerUI(); else updateStripTimer();
}
function onDoTodoChanged(){
  renderLogsList();
  updateStripTimer();
}
async function closeOpenSegment(type, whenIso){
  await sb.from("execution_segments").update({ segment_end: whenIso })
    .eq("execution_log_id", timerState.logId).eq("segment_type", type).is("segment_end", null);
}
async function timerStart(){
  if (timerState.status !== "idle" || timerState.busy) return;
  const todoId = $("do-todo-select").value;
  if (!todoId){ toast("할 일을 먼저 선택하세요."); return; }
  timerState.busy = true;
  try {
    const now = new Date().toISOString();
    const { data: log, error } = await sb.from("execution_logs").insert({ todo_id: todoId, status: "running", started_at: now }).select().single();
    if (error){ toast("시작 실패: " + error.message); return; }
    const { error: segErr } = await sb.from("execution_segments").insert({ execution_log_id: log.id, segment_type: "work", segment_start: now });
    if (segErr){
      await sb.from("execution_logs").delete().eq("id", log.id);
      toast("시작 실패: " + segErr.message);
      return;
    }
    timerState = { ...timerState, logId: log.id, todoId, status: "running", accumulatedMs: 0, segmentStart: Date.now() };
    timerState.intervalHandle = setInterval(updateStripTimer, 1000);
    setTimerButtons("running");
    updateStripTimer();
    toast("타이머를 시작했습니다.");
    renderLogsList();
  } finally { timerState.busy = false; }
}
async function timerPause(){
  if (timerState.status !== "running" || timerState.busy) return;
  timerState.busy = true;
  try {
    const now = new Date().toISOString();
    timerState.accumulatedMs += Date.now() - timerState.segmentStart;
    clearInterval(timerState.intervalHandle);
    await closeOpenSegment("work", now);
    await sb.from("execution_segments").insert({ execution_log_id: timerState.logId, segment_type: "pause", segment_start: now });
    await sb.from("execution_logs").update({ status: "paused" }).eq("id", timerState.logId);
    timerState.status = "paused";
    setTimerButtons("paused");
    updateStripTimer();
    toast("일시정지했습니다.");
  } finally { timerState.busy = false; }
}
async function timerResume(){
  if (timerState.status !== "paused" || timerState.busy) return;
  timerState.busy = true;
  try {
    const now = new Date().toISOString();
    await closeOpenSegment("pause", now);
    await sb.from("execution_segments").insert({ execution_log_id: timerState.logId, segment_type: "work", segment_start: now });
    await sb.from("execution_logs").update({ status: "running" }).eq("id", timerState.logId);
    timerState.status = "running";
    timerState.segmentStart = Date.now();
    timerState.intervalHandle = setInterval(updateStripTimer, 1000);
    setTimerButtons("running");
    updateStripTimer();
    toast("다시 시작합니다.");
  } finally { timerState.busy = false; }
}
async function computeActualMinutes(logId){
  const { data: segs } = await sb.from("execution_segments").select("*").eq("execution_log_id", logId).eq("segment_type", "work");
  let totalMs = 0;
  (segs || []).forEach(s => {
    const end = s.segment_end ? new Date(s.segment_end) : new Date();
    totalMs += end - new Date(s.segment_start);
  });
  return Math.round(totalMs / 60000);
}
function timerStopClicked(){
  if (timerState.status === "idle" || timerState.busy) return;
  timerState.pendingEnd = "stopped";
  $("stop-reason-box").hidden = false;
  $("stop-reason-input").focus();
}
async function timerCompleteClicked(){
  if (timerState.status === "idle" || timerState.busy) return;
  timerState.pendingEnd = "completed";
  await finalizeTimer("");
}
async function finalizeTimer(reason){
  if (timerState.status === "idle" || timerState.busy) return;
  timerState.busy = true;
  const doneTodoId = timerState.todoId;
  try {
    clearInterval(timerState.intervalHandle);
    const now = new Date().toISOString();
    await closeOpenSegment(timerState.status === "running" ? "work" : "pause", now);
    const actual_minutes = await computeActualMinutes(timerState.logId);
    const endStatus = timerState.pendingEnd || "stopped";
    await sb.from("execution_logs").update({
      status: endStatus, ended_at: now, actual_minutes, blocker_reason: reason || ""
    }).eq("id", timerState.logId);
    toast(endStatus === "completed" ? "실행을 완료로 기록했습니다." : "실행을 중단으로 기록했습니다.");
  } finally { timerState.busy = false; }
  const wasCompleted = timerState.pendingEnd === "completed";
  resetTimerUI();
  if (wasCompleted && doneTodoId) await completeTodo(doneTodoId, null);   // COMPLETE = 할 일도 완료(중복 방지 조건부 UPDATE)
  await renderLogsList();
  await refreshDeck();
}

async function submitLog(){
  const todoId = $("do-todo-select").value;
  if (!todoId){ toast("할 일을 먼저 선택하세요."); return; }
  const startVal = $("log-start").value;
  if (!startVal){ toast("시작 시각은 필수입니다."); return; }
  const endVal = $("log-end").value;
  const actual_minutes = parseInt($("log-actual").value, 10) || 0;
  const blocker_reason = $("log-blocker").value.trim();
  const { error } = await sb.from("execution_logs").insert({
    todo_id: todoId, status: "completed",
    started_at: new Date(startVal).toISOString(), ended_at: endVal ? new Date(endVal).toISOString() : null,
    actual_minutes, blocker_reason
  });
  if (error){ toast("저장 실패: " + error.message); return; }
  toast("수동 기록을 저장했습니다. (계획 원본 값은 그대로 유지됩니다)");
  ["log-start", "log-end", "log-actual", "log-blocker"].forEach(id => { $(id).value = ""; });
  renderLogsList();
}
async function renderLogsList(){
  const todoId = $("do-todo-select").value;
  const wrap = $("logs-list");
  if (!todoId){ wrap.innerHTML = `<div class="empty">할 일을 먼저 선택하세요.</div>`; return; }
  const { data, error } = await sb.from("execution_logs").select("*").eq("todo_id", todoId).order("started_at", { ascending: false });
  if (error){ wrap.innerHTML = `<div class="empty">로드 실패</div>`; return; }
  const tz = getDisplayTZ();
  if (!data.length){ wrap.innerHTML = `<div class="empty">아직 실행 기록이 없습니다.</div>`; return; }
  wrap.innerHTML = data.map(l => `
    <div class="list-item">
      <div class="meta">[${escapeHtml(l.status)}] 시작 ${escapeHtml(fmtDateTime(l.started_at, tz))} → 끝 ${escapeHtml(fmtDateTime(l.ended_at, tz))}</div>
      <div class="meta">실제 ${Number(l.actual_minutes) || 0}분${l.blocker_reason ? " · 막힘: " + escapeHtml(l.blocker_reason) : ""}</div>
    </div>`).join("");
}

// ============================================================
// Diary
// ============================================================
async function submitDiary(){
  const entry_date = $("diary-date").value || todayInTZ(getDisplayTZ());
  const row = {
    entry_date,
    mood: $("diary-mood").value.trim(),
    mood_music: $("diary-music").value.trim(),
    food: $("diary-food").value.trim(),
    event: $("diary-event").value.trim(),
    wanted_to_say: $("diary-wanted").value.trim(),
    free_text: $("diary-free").value.trim()
  };
  const { error } = await sb.from("diary_entries").insert(row);
  if (error){ toast("저장 실패: " + error.message); return; }
  toast("오늘의 기록을 저장했습니다.");
  ["diary-mood", "diary-music", "diary-food", "diary-event", "diary-wanted", "diary-free"].forEach(id => { $(id).value = ""; });
  renderDiary();
}
async function renderDiary(){
  const { data, error } = await sb.from("diary_entries").select("*").order("entry_date", { ascending: false });
  const wrap = $("diary-list");
  if (error){ wrap.innerHTML = `<div class="empty">로드 실패</div>`; return; }
  wrap.innerHTML = (data || []).map(d => `
    <div class="list-item">
      <div class="row"><strong>${escapeHtml(fmtDate(d.entry_date))}</strong>${d.mood ? ` <span class="tag">${escapeHtml(d.mood)}</span>` : ""}</div>
      ${d.mood_music ? `<div class="meta">🎵 ${escapeHtml(d.mood_music)}</div>` : ""}
      ${d.food ? `<div class="meta">🍚 ${escapeHtml(d.food)}</div>` : ""}
      ${d.event ? `<div class="meta">✨ ${escapeHtml(d.event)}</div>` : ""}
      ${d.wanted_to_say ? `<div class="meta">💬 ${escapeHtml(d.wanted_to_say)}</div>` : ""}
      ${d.free_text ? `<div style="margin-top:6px;">${escapeHtml(d.free_text)}</div>` : ""}
    </div>`).join("") || `<div class="empty">아직 기록이 없습니다.</div>`;
}

// ============================================================
// 월간
// ============================================================
async function renderMonthly(){
  const ym = $("monthly-select").value || todayInTZ(getDisplayTZ()).slice(0, 7);
  $("monthly-select").value = ym;
  const from = ym + "-01";
  const next = new Date(from + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  const to = next.toISOString().slice(0, 10);

  const { data: todos } = await sb.from("todos").select("*").eq("is_deleted", false).gte("due_date", from).lt("due_date", to);
  const list = todos || [];
  const today = todayInTZ(getDisplayTZ());
  const planIds = new Set(list.map(t => t.plan_id).filter(Boolean));
  const doneList = list.filter(t => t.status === "done");
  const overdueList = list.filter(t => t.status !== "done" && t.due_date && endOf(t) < today);
  const ids = list.map(t => t.id);
  let logs = [];
  if (ids.length){ const { data } = await sb.from("execution_logs").select("*").in("todo_id", ids); logs = data || []; }
  const blockedIds = new Set(logs.filter(l => l.blocker_reason && l.blocker_reason.trim()).map(l => l.todo_id));
  const expected = list.reduce((s, t) => s + (Number(t.estimated_minutes) || 0), 0);
  const actual = logs.reduce((s, l) => s + (Number(l.actual_minutes) || 0), 0);

  $("monthly-stats").innerHTML = `
    <button class="stat" id="m-plan"><div class="num">${planIds.size}</div><div class="lbl">PLAN</div></button>
    <button class="stat" id="m-done"><div class="num">${doneList.length}</div><div class="lbl">COMPLETED</div></button>
    <button class="stat" id="m-delay"><div class="num">${overdueList.length}</div><div class="lbl">DELAYED</div></button>
    <button class="stat" id="m-block"><div class="num">${blockedIds.size}</div><div class="lbl">BLOCKED</div></button>
    <button class="stat" id="m-time"><div class="num">${actual - expected >= 0 ? "+" : ""}${actual - expected}분</div><div class="lbl">실제−예상</div></button>`;
  const drill = $("monthly-drilldown");
  const show = (title, arr) => {
    drill.innerHTML = `<h3>${escapeHtml(title)}</h3>` + (arr.length
      ? arr.map(t => `<div class="list-item">${escapeHtml(t.title)} <span class="meta">마감 ${escapeHtml(fmtDate(t.due_date))}</span></div>`).join("")
      : `<div class="empty">해당 기록 없음</div>`);
  };
  $("m-plan").onclick = () => show("이번 달 Todo 전체", list);
  $("m-done").onclick = () => show("완료", doneList);
  $("m-delay").onclick = () => show("지연", overdueList);
  $("m-block").onclick = () => show("막힘", list.filter(t => blockedIds.has(t.id)));
  $("m-time").onclick = () => { drill.innerHTML = `<h3>예상 ${expected}분 · 실제 ${actual}분</h3>`; };
}

// ============================================================
// Search
// ============================================================
async function runSearch(){
  const from = $("search-from").value, to = $("search-to").value;
  const kw = $("search-keyword").value.trim();
  const safe = kw.replace(/[,()%*\\]/g, " ").trim();   // or() 필터 구문을 깨는 문자 제거
  const wrap = $("search-results");
  if (!safe && !from && !to){ wrap.innerHTML = `<div class="empty">검색어나 기간을 입력하세요.</div>`; return; }
  const results = [];

  let tq = sb.from("todos").select("*").eq("is_deleted", false);
  if (from) tq = tq.gte("due_date", from);
  if (to) tq = tq.lte("due_date", to);
  if (safe) tq = tq.or(`title.ilike.%${safe}%,memo.ilike.%${safe}%`);
  const { data: todos } = await tq;
  (todos || []).forEach(t => results.push({ type: t.status === "done" ? "할 일(완료)" : "할 일", date: t.due_date, title: t.title }));

  let dq = sb.from("diary_entries").select("*");
  if (from) dq = dq.gte("entry_date", from);
  if (to) dq = dq.lte("entry_date", to);
  if (safe) dq = dq.or(`free_text.ilike.%${safe}%,event.ilike.%${safe}%,wanted_to_say.ilike.%${safe}%,mood.ilike.%${safe}%`);
  const { data: diaries } = await dq;
  (diaries || []).forEach(d => results.push({ type: "Diary", date: d.entry_date, title: d.event || (d.free_text || "").slice(0, 30) || "(내용 없음)" }));

  results.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  wrap.innerHTML = results.length ? results.map(r => `
    <div class="list-item${r.date ? " clickable" : ""}" ${r.date ? `data-date="${escapeHtml(r.date)}"` : ""}>
      <span class="tag">${escapeHtml(r.type)}</span> <strong>${escapeHtml(r.title)}</strong> <span class="meta">${escapeHtml(fmtDate(r.date))}</span>
    </div>`).join("") : `<div class="empty">검색 결과가 없습니다.</div>`;
  wrap.querySelectorAll("[data-date]").forEach(el => el.addEventListener("click", async () => {
    openDay(el.dataset.date);
    toast(`${el.dataset.date} 페이지로 이동했어요.`);
  }));
}

// ============================================================
// See / Review
// ============================================================
async function renderReview(){
  const planId = $("review-plan-select").value;
  if (!planId){
    ["stat-plan-num", "stat-done-num", "stat-overdue-num", "stat-blocked-num"].forEach(id => { $(id).textContent = "0"; });
    $("stat-diff-num").textContent = "0분";
    $("review-time-detail").textContent = "계획을 먼저 만들어 주세요.";
    return;
  }
  const { data: todos } = await sb.from("todos").select("*").eq("plan_id", planId).eq("is_deleted", false);
  const list = todos || [];
  const tz = getDisplayTZ(), today = todayInTZ(tz);
  const doneList = list.filter(t => t.status === "done");
  const overdueList = list.filter(t => t.status !== "done" && t.due_date && endOf(t) < today);
  const ids = list.map(t => t.id);
  let logs = [];
  if (ids.length){ const { data } = await sb.from("execution_logs").select("*").in("todo_id", ids); logs = data || []; }
  const blockedIds = new Set(logs.filter(l => l.blocker_reason && l.blocker_reason.trim()).map(l => l.todo_id));
  const expected = list.reduce((s, t) => s + (Number(t.estimated_minutes) || 0), 0);
  const actual = logs.reduce((s, l) => s + (Number(l.actual_minutes) || 0), 0);
  const diff = actual - expected;

  $("stat-plan-num").textContent = list.length;
  $("stat-done-num").textContent = doneList.length;
  $("stat-overdue-num").textContent = overdueList.length;
  $("stat-blocked-num").textContent = blockedIds.size;
  $("stat-diff-num").textContent = (diff >= 0 ? "+" : "") + diff + "분";
  $("review-time-detail").textContent = `예상 ${expected}분 · 실제 ${actual}분 (표시 시간대: ${tz}, 오늘=${today})`;

  const drill = $("review-drilldown");
  const show = (title, arr) => {
    drill.innerHTML = arr.length
      ? `<h3>${escapeHtml(title)}</h3>` + arr.map(t => `<div class="list-item"><strong>${escapeHtml(t.title)}</strong> <span class="meta">마감 ${escapeHtml(fmtDate(t.due_date))} · ${t.status === "done" ? "완료" : "진행중"}</span></div>`).join("")
      : `<div class="empty">${escapeHtml(title)}: 해당 기록 없음</div>`;
  };
  $("stat-plan").onclick = () => show("전체 할 일", list);
  $("stat-done").onclick = () => show("완료", doneList);
  $("stat-overdue").onclick = () => show("지연", overdueList);
  $("stat-blocked").onclick = () => show("막힘", list.filter(t => blockedIds.has(t.id)));
  $("stat-diff").onclick = () => {
    drill.innerHTML = `<h3>시간 근거 기록</h3>` + (logs.length
      ? logs.map(l => `<div class="list-item"><span class="meta">${escapeHtml(fmtDateTime(l.started_at, tz))} · 실제 ${Number(l.actual_minutes) || 0}분${l.blocker_reason ? " · " + escapeHtml(l.blocker_reason) : ""}</span></div>`).join("")
      : `<div class="empty">실행 기록 없음</div>`);
  };
  renderNextActions(planId);
}
async function saveNextAction(){
  const planId = $("review-plan-select").value;
  const note = $("next-action-input").value.trim();
  if (!planId){ toast("먼저 계획을 선택하세요."); return; }
  if (!note){ toast("내용을 입력하세요."); return; }
  const plan = (await loadPlans()).find(p => p.id === planId);
  await sb.from("next_actions").insert({ plan_id: planId, period_label: plan ? plan.title : "미지정", note });
  toast("다음 계획으로 넘길 한 줄을 저장했습니다.");
  $("next-action-input").value = "";
  renderNextActions(planId);
}
async function renderNextActions(planId){
  const { data } = await sb.from("next_actions").select("*").eq("plan_id", planId).order("created_at", { ascending: false });
  $("next-actions-list").innerHTML = (data || []).map(n => `<div class="history-item">${escapeHtml(n.note)}</div>`).join("") || `<div class="empty">아직 없음</div>`;
}

// ============================================================
// Settings — 시간대 / 내보내기
// ============================================================
function initTimezonePicker(){
  const sel = $("display-timezone");
  let zones;
  try { zones = Intl.supportedValuesOf("timeZone"); }
  catch (e) { zones = ["UTC", "Asia/Seoul", "Asia/Tokyo", "America/New_York", "America/Los_Angeles", "Europe/London"]; }
  const cur = getDisplayTZ();
  if (!zones.includes(cur)) zones = [cur, ...zones];
  sel.innerHTML = zones.map(z => `<option value="${escapeHtml(z)}" ${z === cur ? "selected" : ""}>${escapeHtml(z)}</option>`).join("");
  $("tz-chip").textContent = "🕒 " + cur;
  sel.addEventListener("change", async () => {
    setDisplayTZ(sel.value);
    $("tz-chip").textContent = "🕒 " + sel.value;
    deck.viewDate = todayInTZ(sel.value);
    toast("표시 시간대를 변경했습니다.");
    await refreshAll();
  });
}
async function exportAll(){
  const tables = ["plans", "plan_success_criteria", "plan_history", "todos", "todo_completions", "execution_logs", "execution_segments", "diary_entries", "next_actions"];
  const payload = { exported_at: new Date().toISOString(), display_timezone_at_export: getDisplayTZ() };
  for (const t of tables){
    const { data, error } = await sb.from(t).select("*");
    if (error){ toast(`내보내기 실패(${t}): ` + error.message); return; }
    payload[t] = data;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plandosee-export-${todayInTZ(getDisplayTZ())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("내보내기 완료.");
}

// ============================================================
// 초기화
// ============================================================
async function refreshAll(){
  await fillPlanSelectors();
  await renderPlansList();
  await renderTodosList();
  await fillDoTodoSelector();
  await renderLogsList();
  await refreshDeck();
  await renderDiary();
  if ($("review-plan-select").value) await renderReview();
  await renderMonthly();
}

function bindEvents(){
  // 하단 뷰 탭
  document.querySelectorAll(".view-tab").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

  // 덱 툴바
  $("deck-date-prev").addEventListener("click", () => goToDate(addDays(deck.viewDate, -7)));
  $("deck-date-next").addEventListener("click", () => goToDate(addDays(deck.viewDate, 7)));
  $("deck-date-today").addEventListener("click", () => goToDate(todayInTZ(getDisplayTZ())));
  $("deck-date-input").addEventListener("change", (e) => goToDate(e.target.value));

  // 키: 요일 키 → 그 날 페이지, 마지막 키 → 바로가기 링크
  $("deck-keys").addEventListener("click", (e) => {
    const btn = e.target.closest(".key");
    if (!btn) return;
    if (btn.dataset.day) openDay(btn.dataset.day);
    else if (btn.dataset.shortcut){
      const sc = getShortcut();
      window.open(sc.url, "_blank", "noopener,noreferrer");
    }
  });
  $("day-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b) dayAction(b.dataset.act, b.dataset.id);
  });
  $("day-add").addEventListener("click", () => openInspector("new", null, null));
  $("day-back").addEventListener("click", () => goPage("home"));
  initShortcutSettings();

  // 노브: 클릭=누르기, 휠=돌리기, −/+ 버튼=돌리기
  document.querySelectorAll(".knob").forEach(k => {
    const n = Number(k.dataset.knob);
    k.addEventListener("click", () => knobPress(n));
    {
      k.addEventListener("wheel", (e) => {
        e.preventDefault();
        const now = Date.now();
        if (now - lastWheel < 140) return;
        lastWheel = now;
        knobTurn(n, e.deltaY > 0 ? 1 : -1);
      }, { passive: false });
    }
  });
  document.querySelectorAll(".knob-step").forEach(b => b.addEventListener("click", () => knobTurn(Number(b.dataset.knob), Number(b.dataset.dir))));

  $("month-panel").addEventListener("click", async (e) => {
    const day = e.target.closest("[data-day]");
    if (day){ openDay(day.dataset.day); return; }
    if (e.target.closest("#month-prev")) await goToDate(shiftMonth(-1));
    else if (e.target.closest("#month-next")) await goToDate(shiftMonth(1));
    else if (e.target.closest("#month-today")) await goToDate(todayInTZ(getDisplayTZ()));
    else if (e.target.closest("#month-close")) goPage("home");
  });
  setInterval(tickStripClock, 1000);

  // 인스펙터
  $("insp-close").addEventListener("click", () => goPage("day"));
  $("key-back").addEventListener("click", () => goPage("day"));
  $("nav-home").addEventListener("click", () => goPage("home"));
  $("nav-menu").addEventListener("click", () => { showView("settings"); goPage("menu"); });
  $("btn-diary").addEventListener("click", () => { showView("diary"); goPage("menu"); });
  $("mtabs").addEventListener("click", (e) => { const b = e.target.closest("[data-mtab]"); if (b) showMonthTab(b.dataset.mtab); });
  window.addEventListener("hashchange", renderPage);
  $("insp-save").addEventListener("click", saveKey);
  $("insp-complete").addEventListener("click", keyComplete);
  $("insp-start").addEventListener("click", keyStart);
  $("insp-delete").addEventListener("click", deleteKey);
  $("insp-time").addEventListener("input", renderPreview);
  $("insp-title").addEventListener("input", renderPreview);
  $("insp-title").addEventListener("keydown", (e) => { if (e.key === "Enter"){ e.preventDefault(); saveKey(); } });
  $("insp-icon-grid").addEventListener("click", (e) => {
    const b = e.target.closest(".icon-btn");
    if (b) setPick(b.dataset.icon === deck.icon ? "" : b.dataset.icon, deck.color);
  });
  $("insp-icon-custom").addEventListener("input", (e) => setPick(limitIcon(e.target.value), deck.color));
  $("insp-color-grid").addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (b) setPick(deck.icon, b.dataset.color);
  });
  $("insp-color-input").addEventListener("input", (e) => {
    deck.color = sanitizeColor(e.target.value);
    document.querySelectorAll("#insp-color-grid .swatch").forEach(s => s.classList.toggle("on", s.dataset.color === deck.color));
    renderPreview();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && currentPage === "key") goPage("day"); });

  // Plan
  $("plan-add-criterion").addEventListener("click", () => addCriterionRow("", false));
  $("plan-submit-btn").addEventListener("click", submitPlan);
  $("plan-cancel-edit").addEventListener("click", cancelPlanEdit);
  document.addEventListener("blur", (e) => {
    if (e.target && e.target.id === "plan-estimated-raw"){
      const m = parseEstimatedToMinutes(e.target.value);
      if (m > 0) $("plan-estimated-minutes").value = m;
    }
    if (e.target && e.target.id === "todo-estimated-raw"){
      const m = parseEstimatedToMinutes(e.target.value);
      if (m > 0) $("todo-estimated-minutes").value = m;
    }
  }, true);

  // Todo
  $("todo-toggle-detail").addEventListener("click", () => { $("todo-detail-fields").hidden = !$("todo-detail-fields").hidden; });
  $("todo-scope-select").addEventListener("change", renderTodosList);
  $("todo-submit-btn").addEventListener("click", submitTodo);
  $("todo-cancel-edit").addEventListener("click", cancelTodoEdit);
  $("todo-search").addEventListener("input", renderTodosList);
  $("todo-filter-status").addEventListener("change", renderTodosList);
  $("todo-sort").addEventListener("change", renderTodosList);

  // Do
  $("do-todo-select").addEventListener("change", () => {
    if (timerState.status !== "idle"){
      $("do-todo-select").value = timerState.todoId;
      toast("실행 중에는 할 일을 바꿀 수 없어요. 먼저 STOP 또는 COMPLETE 하세요.");
      return;
    }
    onDoTodoChanged();
  });
  $("timer-start-btn").addEventListener("click", timerStart);
  $("timer-pause-btn").addEventListener("click", timerPause);
  $("timer-resume-btn").addEventListener("click", timerResume);
  $("timer-stop-btn").addEventListener("click", timerStopClicked);
  $("timer-complete-btn").addEventListener("click", timerCompleteClicked);
  $("tb-pause").addEventListener("click", () => timerPause());
  $("tb-resume").addEventListener("click", () => timerResume());
  $("tb-stop").addEventListener("click", () => { if (timerState.status === "idle") return; $("tb-reason").hidden = false; $("tb-reason-input").focus(); });
  $("tb-reason-cancel").addEventListener("click", () => { $("tb-reason").hidden = true; });
  $("tb-reason-skip").addEventListener("click", () => { timerState.pendingEnd = "stopped"; finalizeTimer(""); });
  $("tb-reason-save").addEventListener("click", () => { timerState.pendingEnd = "stopped"; finalizeTimer($("tb-reason-input").value.trim()); });
  $("tb-complete").addEventListener("click", () => timerCompleteClicked());
  $("stop-skip-btn").addEventListener("click", () => finalizeTimer(""));
  $("stop-save-btn").addEventListener("click", () => finalizeTimer($("stop-reason-input").value.trim()));
  $("log-submit-btn").addEventListener("click", submitLog);

  // 나머지
  $("diary-submit-btn").addEventListener("click", submitDiary);
  $("monthly-select").addEventListener("change", renderMonthly);
  $("search-btn").addEventListener("click", runSearch);
  $("search-keyword").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
  $("review-plan-select").addEventListener("change", renderReview);
  $("next-action-save").addEventListener("click", saveNextAction);
  $("export-btn").addEventListener("click", exportAll);
}

// ============================================================
// 인증 — Supabase Auth (이메일 + 비밀번호)
//  - 비밀번호는 이 코드가 저장하거나 해시하지 않는다. Supabase Auth 서버가 맡는다.
//  - 로그인 상태(세션)는 supabase-js가 브라우저 저장소에 보관한다. 주소창(URL)에는 싣지 않는다.
//  - 이 파일의 어디에서도 비밀번호·토큰을 console에 찍지 않는다.
// ============================================================
const AUTH_MIN_PASSWORD = 8;
const AUTH_MSG = {
  badLogin: "이메일 또는 비밀번호가 올바르지 않습니다.",   // 아이디가 없을 때와 비밀번호가 틀렸을 때 문구를 똑같이 쓴다
  dup: "이미 가입된 이메일입니다. 로그인 탭에서 로그인해 주세요.",
  email: "이메일 형식이 올바르지 않습니다.",
  short: `비밀번호는 ${AUTH_MIN_PASSWORD}자 이상으로 입력해 주세요.`,
  empty: "이메일과 비밀번호를 입력해 주세요.",
  weak: "비밀번호가 너무 약합니다. 더 길고 다양한 글자로 만들어 주세요.",
  limit: "시도가 너무 많습니다. 잠시 뒤에 다시 해 주세요.",
  generic: "처리하지 못했습니다. 잠시 뒤에 다시 시도해 주세요.",
  needConfirm: "가입 요청을 받았습니다. 이메일로 온 확인 링크를 누른 뒤 로그인해 주세요."
};
let authMode = "login";
let authBusy = false;
let appStarted = false;
let leavingToLogin = false;

function setAuthMsg(text, ok){
  const el = $("auth-msg");
  el.textContent = text || "";
  el.classList.toggle("ok", !!ok);
}
function setAuthMode(mode){
  authMode = mode === "signup" ? "signup" : "login";
  $("auth-tab-login").classList.toggle("active", authMode === "login");
  $("auth-tab-signup").classList.toggle("active", authMode === "signup");
  $("auth-submit").textContent = authMode === "login" ? "로그인" : "가입하기";
  $("auth-password").autocomplete = authMode === "login" ? "current-password" : "new-password";
  $("auth-hint").textContent = authMode === "login"
    ? "아직 계정이 없다면 위의 \"가입\" 탭을 눌러 주세요."
    : `비밀번호는 ${AUTH_MIN_PASSWORD}자 이상. 가입하면 바로 로그인돼요.`;
  setAuthMsg("");
}
function showAuthScreen(){ $("app-shell").hidden = true; $("auth-screen").hidden = false; }
function showAppShell(user){
  $("auth-screen").hidden = true;
  $("app-shell").hidden = false;
  $("user-chip").textContent = "👤 " + (user && user.email ? user.email : "");
}
// Supabase 오류 → 사람이 읽는 문구. 로그인 실패는 이유(아이디 없음/비밀번호 틀림)를 구분하지 않고 한 문구로 통일한다.
function authErrorText(error, mode){
  const code = error && error.code ? String(error.code) : "";
  const status = error && error.status ? Number(error.status) : 0;
  if (status === 429 || /rate_limit/.test(code)) return AUTH_MSG.limit;
  if (mode === "login") return (code === "invalid_credentials" || status === 400) ? AUTH_MSG.badLogin : AUTH_MSG.generic;
  if (code === "user_already_exists" || /already registered/i.test((error && error.message) || "")) return AUTH_MSG.dup;
  if (code === "weak_password") return AUTH_MSG.weak;
  if (code === "email_address_invalid" || code === "validation_failed") return AUTH_MSG.email;
  return AUTH_MSG.generic;
}
async function submitAuth(){
  if (authBusy) return;
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  if (!email || !password){ setAuthMsg(AUTH_MSG.empty); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ setAuthMsg(AUTH_MSG.email); return; }
  if (authMode === "signup" && password.length < AUTH_MIN_PASSWORD){ setAuthMsg(AUTH_MSG.short); return; }
  authBusy = true;
  $("auth-submit").disabled = true;
  setAuthMsg("");
  try {
    if (authMode === "login"){
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error){ setAuthMsg(authErrorText(error, "login")); return; }
      $("auth-password").value = "";
      await startApp(data.user);
    } else {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error){ setAuthMsg(authErrorText(error, "signup")); return; }
      // 이미 가입된 이메일인데 오류 없이 돌아오는 경우(확인 메일 설정이 켜져 있을 때): identities가 비어 있다
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0){ setAuthMsg(AUTH_MSG.dup); return; }
      if (!data.session){ setAuthMsg(AUTH_MSG.needConfirm, true); return; }
      $("auth-password").value = "";
      await startApp(data.user);
    }
  } catch (e) {
    setAuthMsg(AUTH_MSG.generic);
  } finally {
    authBusy = false;
    $("auth-submit").disabled = false;
  }
}
// 로그아웃 뒤에는 페이지를 새로 읽어서, 이전 사람의 자료가 화면 메모리에 남지 않게 한다.
function leaveToLogin(){
  if (leavingToLogin) return;
  leavingToLogin = true;
  location.hash = "";
  location.reload();
}
async function doLogout(){
  try { await sb.auth.signOut(); } catch (e) { /* 서버에 못 닿아도 이 브라우저의 로그인 상태는 지운다 */ }
  leaveToLogin();
}

// 앱 본체 시작: 로그인이 확인된 뒤에만 한 번 실행한다.
async function startApp(user){
  if (appStarted) return;
  appStarted = true;
  showAppShell(user);
  deck.viewDate = todayInTZ(getDisplayTZ());
  buildInspectorPalettes();
  initTimezonePicker();
  renderCategoryOptions();
  addCriterionRow("", false);
  $("diary-date").value = deck.viewDate;
  $("monthly-select").value = deck.viewDate.slice(0, 7);
  $("todo-filter-status").value = "in_progress";
  bindEvents();
  setTimerButtons("idle");
  await refreshAll();
  await renderPage();
}

window.addEventListener("DOMContentLoaded", async () => {
  $("auth-tab-login").addEventListener("click", () => setAuthMode("login"));
  $("auth-tab-signup").addEventListener("click", () => setAuthMode("signup"));
  $("auth-form").addEventListener("submit", (e) => { e.preventDefault(); submitAuth(); });
  $("nav-logout").addEventListener("click", doLogout);
  setAuthMode("login");

  // 다른 탭에서 로그아웃했거나 로그인 상태가 끝나면 이 탭도 로그인 화면으로 돌린다. (콜백 안에서는 await 하지 않는다)
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT"){ if (appStarted) leaveToLogin(); else showAuthScreen(); }
  });

  let session = null;
  try { ({ data: { session } } = await sb.auth.getSession()); } catch (e) { session = null; }
  if (session && session.user) await startApp(session.user);
  else showAuthScreen();
});
