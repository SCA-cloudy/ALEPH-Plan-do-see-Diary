// ============================================================
// PlanDoSee v2 — app.js
// ============================================================
const sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

const CATEGORY_TEMPLATES = {
  "운동": [{key:"sport", label:"종목"}, {key:"target_intensity", label:"목표 강도/거리"}],
  "공부/자격증": [{key:"subject", label:"과목/범위"}, {key:"materials", label:"학습 자료"}],
  "업무": [{key:"project", label:"프로젝트명"}, {key:"collaborators", label:"협업자"}],
  "게임 연습": [{key:"game", label:"게임/모드"}, {key:"target_rank", label:"목표 랭크"}],
  "ALEPH 진행": [{key:"assignment_no", label:"과제 번호"}],
  "기타": []
};

const THEME_LABELS = {
  cd_player:   { icon:"💿", name:"CD Player",   newPlan:"앨범 등록", complete:"Track Complete", timerTitle:"재생 컨트롤", start:"PLAY", pause:"PAUSE", resume:"RESUME", stop:"STOP", complete_btn:"COMPLETE", doTitle:"Do — 트랙 재생" },
  diary_desk:  { icon:"📔", name:"Diary Desk",  newPlan:"새 페이지 생성", complete:"기록 완료", timerTitle:"실행 타이머", start:"시작", pause:"일시정지", resume:"다시 시작", stop:"멈춤", complete_btn:"완료", doTitle:"Do — 실제로 한 일" },
  stream_deck: { icon:"🎛️", name:"Stream Deck+", newPlan:"Macro 지정", complete:"MACRO 완료", timerTitle:"컨트롤 패널", start:"START", pause:"PAUSE", resume:"RESUME", stop:"STOP", complete_btn:"COMPLETE", doTitle:"Do — Macro 실행" }
};
let CURRENT_THEME = "diary_desk";

// ---------- 시간대 ----------
function getDisplayTZ(){ return localStorage.getItem("pds_display_timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
function setDisplayTZ(tz){ localStorage.setItem("pds_display_timezone", tz); }
function todayInTZ(tz){ return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
function fmtDateTime(iso, tz){ if(!iso) return "-"; try{ return new Intl.DateTimeFormat("ko-KR",{timeZone:tz,dateStyle:"medium",timeStyle:"short"}).format(new Date(iso)); }catch{return iso;} }
function fmtDate(d){ return d || "-"; }
function escapeHtml(s){ if(s===null||s===undefined) return ""; return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
let toastTimer;
function toast(msg){ const el=document.getElementById("toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2200); }

function initTimezonePicker(){
  const sel = document.getElementById("display-timezone");
  let zones; try{ zones = Intl.supportedValuesOf("timeZone"); }catch{ zones=["UTC","Asia/Seoul","Asia/Tokyo","America/New_York","America/Los_Angeles","Europe/London"]; }
  const cur = getDisplayTZ();
  sel.innerHTML = zones.map(z=>`<option value="${z}" ${z===cur?"selected":""}>${z}</option>`).join("");
  sel.addEventListener("change", ()=>{ setDisplayTZ(sel.value); toast("표시 시간대를 변경했습니다."); refreshAll(); });
}

// ---------- 예상시간 자유입력 → 분 정규화 ----------
function parseEstimatedToMinutes(raw){
  if(!raw) return 0;
  let minutes = 0;
  const hourMatch = raw.match(/(\d+(\.\d+)?)\s*시간/);
  const minMatch = raw.match(/(\d+)\s*분/);
  if(hourMatch) minutes += Math.round(parseFloat(hourMatch[1]) * 60);
  if(minMatch) minutes += parseInt(minMatch[1]);
  return minutes;
}

// ---------- 테마 ----------
function applyTheme(theme){
  CURRENT_THEME = theme;
  localStorage.setItem("pds_theme", theme);
  document.body.className = "theme-" + theme;
  const L = THEME_LABELS[theme];
  document.getElementById("theme-icon").textContent = L.icon;
  document.getElementById("theme-name").textContent = L.name;
  document.getElementById("plan-section-title").textContent = L.newPlan.includes("생성")||L.newPlan.includes("등록")||L.newPlan.includes("지정") ? L.newPlan : "계획 세우기";
  document.getElementById("plan-submit-btn").textContent = L.newPlan;
  document.getElementById("do-section-title").textContent = L.doTitle;
  document.getElementById("timer-title").textContent = L.timerTitle;
  document.getElementById("timer-start-btn").textContent = L.start;
  document.getElementById("timer-pause-btn").textContent = L.pause;
  document.getElementById("timer-resume-btn").textContent = L.resume;
  document.getElementById("timer-stop-btn").textContent = L.stop;
  document.getElementById("timer-complete-btn").textContent = L.complete_btn;
}
function goToSpace(theme){
  applyTheme(theme);
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("space").style.display = "block";
  refreshAll();
}
function initThemeCards(){
  document.querySelectorAll(".theme-card").forEach(btn=>{
    btn.addEventListener("click", ()=> goToSpace(btn.dataset.theme));
  });
}

// ---------- 탭 전환 ----------
function initTabs(){
  document.querySelectorAll(".side-tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".side-tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p=>p.style.display="none");
      document.getElementById("tab-"+btn.dataset.tab).style.display="block";
    });
  });
}

// ============================================================
// Schedule
// ============================================================
async function submitSchedule(){
  const event_date = document.getElementById("sched-view-date").value || todayInTZ(getDisplayTZ());
  const event_time = document.getElementById("sched-time").value || null;
  const title = document.getElementById("sched-title").value.trim();
  if(!title){ toast("일정 내용을 입력하세요."); return; }
  const location = document.getElementById("sched-location").value.trim();
  const memo = document.getElementById("sched-memo").value.trim();
  const { error } = await sb.from("schedules").insert({ event_date, event_time, title, location, memo });
  if(error){ toast("저장 실패: "+error.message); return; }
  toast("일정을 저장했습니다.");
  ["sched-time","sched-title","sched-location","sched-memo"].forEach(id=>document.getElementById(id).value="");
  renderSchedule();
}
async function renderSchedule(){
  const date = document.getElementById("sched-view-date").value || todayInTZ(getDisplayTZ());
  document.getElementById("sched-view-date").value = date;
  const { data, error } = await sb.from("schedules").select("*").eq("event_date", date).order("event_time", { ascending: true });
  const wrap = document.getElementById("schedule-list");
  if(error){ wrap.innerHTML = `<div class="empty">로드 실패</div>`; return; }
  if(!data.length){ wrap.innerHTML = `<div class="empty">이 날짜엔 일정이 없습니다.</div>`; return; }
  wrap.innerHTML = data.map(s=>`
    <div class="list-item">
      <div class="row"><strong>${s.event_time ? s.event_time.slice(0,5)+" " : ""}${escapeHtml(s.title)}</strong></div>
      ${s.location ? `<div class="meta">📍 ${escapeHtml(s.location)}</div>` : ""}
      ${s.memo ? `<div class="meta">${escapeHtml(s.memo)}</div>` : ""}
    </div>
  `).join("");
}

// ============================================================
// Plan
// ============================================================
let editingPlanId = null;
let criteriaRowSeq = 0;

function renderCategoryOptions(){
  const sel = document.getElementById("plan-category");
  sel.innerHTML = Object.keys(CATEGORY_TEMPLATES).map(c=>`<option value="${c}">${c}</option>`).join("");
  sel.addEventListener("change", ()=>renderPlanDetailsExtra());
  renderPlanDetailsExtra();
}
function renderPlanDetailsExtra(existing){
  const cat = document.getElementById("plan-category").value;
  const fields = CATEGORY_TEMPLATES[cat] || [];
  const wrap = document.getElementById("plan-details-extra");
  const vals = existing || {};
  if(cat === "기타"){
    wrap.innerHTML = `<div id="freeform-rows"></div><button type="button" class="ghost small" id="add-freeform-row">+ 필드 추가</button>`;
    const rows = document.getElementById("freeform-rows");
    const entries = Object.entries(vals).length ? Object.entries(vals) : [["",""]];
    entries.forEach(([k,v])=>addFreeformRow(rows,k,v));
    document.getElementById("add-freeform-row").addEventListener("click", ()=>addFreeformRow(rows,"",""));
  } else if(fields.length){
    wrap.innerHTML = `<div class="grid-2">` + fields.map(f=>`<div class="field"><label>${f.label}</label><input data-key="${f.key}" class="cat-field" value="${vals[f.key]||""}"></div>`).join("") + `</div>`;
  } else { wrap.innerHTML=""; }
}
function addFreeformRow(container,k,v){
  const row=document.createElement("div"); row.className="grid-2"; row.style.marginBottom="6px";
  row.innerHTML = `<input placeholder="필드명" class="ff-key" value="${k}"><input placeholder="값" class="ff-val" value="${v}">`;
  container.appendChild(row);
}
function collectPlanDetails(){
  const cat = document.getElementById("plan-category").value;
  const details = {};
  if(cat==="기타"){
    document.querySelectorAll("#freeform-rows > div").forEach(row=>{
      const k=row.querySelector(".ff-key").value.trim(); const v=row.querySelector(".ff-val").value.trim();
      if(k) details[k]=v;
    });
  } else {
    document.querySelectorAll(".cat-field").forEach(inp=>{ if(inp.value.trim()) details[inp.dataset.key]=inp.value.trim(); });
  }
  return details;
}

function addCriterionRow(label, checked){
  const id = "crit-" + (criteriaRowSeq++);
  const wrap = document.getElementById("plan-criteria-rows");
  const row = document.createElement("div");
  row.className = "criterion-row"; row.id = id;
  row.innerHTML = `<input type="checkbox" class="crit-checked" ${checked?"checked":""}>
    <input class="crit-label" placeholder="예: 주 3회 실행" value="${escapeHtml(label||"")}" style="flex:1;">
    <button type="button" class="ghost small crit-remove">삭제</button>`;
  row.querySelector(".crit-remove").addEventListener("click", ()=>row.remove());
  wrap.appendChild(row);
}
function collectCriteria(){
  return [...document.querySelectorAll(".criterion-row")].map((row,i)=>({
    label: row.querySelector(".crit-label").value.trim(),
    is_checked: row.querySelector(".crit-checked").checked,
    order_no: i
  })).filter(c=>c.label);
}

document.addEventListener("blur", (e)=>{
  if(e.target && e.target.id === "plan-estimated-raw"){
    const m = parseEstimatedToMinutes(e.target.value);
    if(m>0) document.getElementById("plan-estimated-minutes").value = m;
  }
}, true);

async function submitPlan(){
  const title = document.getElementById("plan-title").value.trim();
  const category = document.getElementById("plan-category").value;
  const details = collectPlanDetails();
  const period_start = document.getElementById("plan-period-start").value;
  const period_end = document.getElementById("plan-period-end").value;
  const priority = document.getElementById("plan-priority").value || null;
  const estimated_time_raw = document.getElementById("plan-estimated-raw").value.trim();
  const estimated_minutes = parseInt(document.getElementById("plan-estimated-minutes").value) || parseEstimatedToMinutes(estimated_time_raw);
  const criteria = collectCriteria();

  if(!title || !period_start || !period_end){ toast("제목과 기간은 필수입니다."); return; }

  if(editingPlanId){
    const { data: current } = await sb.from("plans").select("*").eq("id", editingPlanId).single();
    const { data: currentCriteria } = await sb.from("plan_success_criteria").select("*").eq("plan_id", editingPlanId);
    const { count } = await sb.from("plan_history").select("*", { count:"exact", head:true }).eq("plan_id", editingPlanId);
    await sb.from("plan_history").insert({
      plan_id: editingPlanId, version_no: (count||0)+1,
      snapshot: { plan: current, success_criteria: currentCriteria }
    });
    await sb.from("plans").update({ title, category, details, period_start, period_end, priority, estimated_time_raw, estimated_minutes, updated_at: new Date().toISOString() }).eq("id", editingPlanId);
    await sb.from("plan_success_criteria").delete().eq("plan_id", editingPlanId);
    if(criteria.length) await sb.from("plan_success_criteria").insert(criteria.map(c=>({...c, plan_id: editingPlanId})));
    toast("계획을 수정했습니다. (이전 내용은 이력에 보존됨)");
    cancelPlanEdit();
  } else {
    const { data: newPlan, error } = await sb.from("plans").insert({ title, category, details, period_start, period_end, priority, estimated_time_raw, estimated_minutes }).select().single();
    if(error){ toast("저장 실패: "+error.message); return; }
    if(criteria.length) await sb.from("plan_success_criteria").insert(criteria.map(c=>({...c, plan_id: newPlan.id})));
    toast("새 계획을 저장했습니다.");
    document.getElementById("plan-title").value=""; document.getElementById("plan-estimated-raw").value=""; document.getElementById("plan-estimated-minutes").value="";
    document.getElementById("plan-criteria-rows").innerHTML=""; addCriterionRow("",false);
  }
  await refreshAll();
}
function startPlanEdit(plan, criteria){
  editingPlanId = plan.id;
  document.getElementById("plan-title").value = plan.title;
  document.getElementById("plan-category").value = plan.category;
  renderPlanDetailsExtra(plan.details);
  document.getElementById("plan-period-start").value = plan.period_start;
  document.getElementById("plan-period-end").value = plan.period_end;
  document.getElementById("plan-priority").value = plan.priority || "";
  document.getElementById("plan-estimated-raw").value = plan.estimated_time_raw || "";
  document.getElementById("plan-estimated-minutes").value = plan.estimated_minutes || "";
  document.getElementById("plan-criteria-rows").innerHTML = "";
  (criteria||[]).forEach(c=>addCriterionRow(c.label, c.is_checked));
  document.getElementById("plan-edit-hint").style.display = "inline";
  window.scrollTo({top:0, behavior:"smooth"});
}
function cancelPlanEdit(){ editingPlanId=null; document.getElementById("plan-edit-hint").style.display="none"; }

async function loadPlans(){
  const { data, error } = await sb.from("plans").select("*").eq("is_deleted", false).order("created_at",{ascending:false});
  if(error){ toast("계획 로드 실패: "+error.message); return []; }
  return data || [];
}
async function renderPlansList(){
  const plans = await loadPlans();
  const wrap = document.getElementById("plans-list");
  if(!plans.length){ wrap.innerHTML = `<div class="empty">아직 계획이 없습니다.</div>`; return; }
  const criteriaByPlan = {};
  for(const p of plans){
    const { data } = await sb.from("plan_success_criteria").select("*").eq("plan_id", p.id).order("order_no");
    criteriaByPlan[p.id] = data || [];
  }
  wrap.innerHTML = plans.map(p=>`
    <div class="list-item">
      <div class="row">
        <div><strong>${escapeHtml(p.title)}</strong> <span class="tag">${escapeHtml(p.category)}</span> ${p.priority ? `<span class="tag">${p.priority==="high"?"높음":p.priority==="low"?"낮음":"보통"}</span>`:""}</div>
        <div><button class="ghost small" data-edit-plan="${p.id}">수정</button><button class="ghost small danger" data-delete-plan="${p.id}">삭제</button></div>
      </div>
      <div class="meta">기간 ${fmtDate(p.period_start)} ~ ${fmtDate(p.period_end)} · 예상 ${p.estimated_time_raw||""} (${p.estimated_minutes}분)</div>
      ${criteriaByPlan[p.id].map(c=>`<div class="meta"><label style="display:inline;"><input type="checkbox" data-crit-toggle="${c.id}" ${c.is_checked?"checked":""}> ${escapeHtml(c.label)}</label></div>`).join("")}
      <div class="meta"><button class="ghost small" data-show-history="${p.id}">🕓 수정 이력 보기</button></div>
      <div id="history-${p.id}"></div>
    </div>
  `).join("");
  wrap.querySelectorAll("[data-edit-plan]").forEach(btn=>btn.addEventListener("click", ()=>startPlanEdit(plans.find(p=>p.id===btn.dataset.editPlan), criteriaByPlan[btn.dataset.editPlan])));
  wrap.querySelectorAll("[data-delete-plan]").forEach(btn=>btn.addEventListener("click", async ()=>{
    if(!confirm("삭제할까요?")) return;
    await sb.from("plans").update({ is_deleted:true }).eq("id", btn.dataset.deletePlan);
    toast("삭제했습니다."); refreshAll();
  }));
  wrap.querySelectorAll("[data-crit-toggle]").forEach(chk=>chk.addEventListener("change", async ()=>{
    await sb.from("plan_success_criteria").update({ is_checked: chk.checked }).eq("id", chk.dataset.critToggle);
    toast("체크리스트를 갱신했습니다.");
  }));
  wrap.querySelectorAll("[data-show-history]").forEach(btn=>btn.addEventListener("click", async ()=>{
    const pid = btn.dataset.showHistory;
    const { data } = await sb.from("plan_history").select("*").eq("plan_id", pid).order("version_no",{ascending:false});
    const tz = getDisplayTZ();
    document.getElementById("history-"+pid).innerHTML = (data||[]).map(h=>`
      <div class="history-item">v${h.version_no} (${fmtDateTime(h.edited_at, tz)}) — "${escapeHtml(h.snapshot.plan.title)}", 기간 ${h.snapshot.plan.period_start}~${h.snapshot.plan.period_end}, 예상 ${h.snapshot.plan.estimated_minutes}분</div>
    `).join("") || `<div class="empty">이력 없음</div>`;
  }));
}

// ============================================================
// Todo
// ============================================================
let editingTodoId = null;
async function fillPlanSelectors(){
  const plans = await loadPlans();
  const opts = plans.map(p=>`<option value="${p.id}">${escapeHtml(p.title)}</option>`).join("");
  const todoSel = document.getElementById("todo-plan-select");
  todoSel.innerHTML = `<option value="">연결 안 함</option>` + opts;
  const reviewSel = document.getElementById("review-plan-select");
  const prevReview = reviewSel.value;
  reviewSel.innerHTML = opts || `<option value="">(계획 없음)</option>`;
  if(plans.find(p=>p.id===prevReview)) reviewSel.value = prevReview;
  const scopeSel = document.getElementById("todo-scope-select");
  scopeSel.innerHTML = `<option value="all">전체 Todo</option>` + opts;
}
document.addEventListener("click", (e)=>{
  if(e.target && e.target.id === "todo-toggle-detail"){
    const box = document.getElementById("todo-detail-fields");
    box.style.display = box.style.display==="none" ? "block" : "none";
  }
});
async function submitTodo(){
  const title = document.getElementById("todo-title").value.trim();
  if(!title){ toast("제목을 입력하세요."); return; }
  const due_date = document.getElementById("todo-due").value || null;
  const plan_id = document.getElementById("todo-plan-select").value || null;
  const priority = document.getElementById("todo-priority").value;
  const tags = document.getElementById("todo-tags").value.split(",").map(s=>s.trim()).filter(Boolean);
  const estimated_time_raw = document.getElementById("todo-estimated-raw").value.trim();
  const estimated_minutes = parseInt(document.getElementById("todo-estimated-minutes").value) || parseEstimatedToMinutes(estimated_time_raw);
  const memo = document.getElementById("todo-memo").value;

  if(editingTodoId){
    const { error } = await sb.from("todos").update({ title, due_date, plan_id, priority, tags, estimated_time_raw, estimated_minutes, memo, updated_at:new Date().toISOString() }).eq("id", editingTodoId);
    if(error){ toast("수정 실패: "+error.message); return; }
    toast("할 일을 수정했습니다."); cancelTodoEdit();
  } else {
    const { error } = await sb.from("todos").insert({ title, due_date, plan_id, priority, tags, estimated_time_raw, estimated_minutes, memo, status:"in_progress" });
    if(error){ toast("저장 실패: "+error.message); return; }
    toast("할 일을 추가했습니다.");
  }
  ["todo-title","todo-due","todo-tags","todo-estimated-raw","todo-estimated-minutes","todo-memo"].forEach(id=>document.getElementById(id).value="");
  await renderTodosList();
}
function startTodoEdit(t){
  editingTodoId = t.id;
  document.getElementById("todo-title").value = t.title;
  document.getElementById("todo-due").value = t.due_date || "";
  document.getElementById("todo-plan-select").value = t.plan_id || "";
  document.getElementById("todo-priority").value = t.priority;
  document.getElementById("todo-tags").value = (t.tags||[]).join(",");
  document.getElementById("todo-estimated-raw").value = t.estimated_time_raw || "";
  document.getElementById("todo-estimated-minutes").value = t.estimated_minutes;
  document.getElementById("todo-memo").value = t.memo || "";
  document.getElementById("todo-detail-fields").style.display = "block";
  document.getElementById("todo-edit-hint").style.display = "inline";
}
function cancelTodoEdit(){ editingTodoId=null; document.getElementById("todo-edit-hint").style.display="none"; }

async function loadTodosForScope(scope){
  let q = sb.from("todos").select("*").eq("is_deleted", false);
  if(scope && scope !== "all") q = q.eq("plan_id", scope);
  const { data, error } = await q;
  if(error){ toast("할 일 로드 실패: "+error.message); return []; }
  return data || [];
}
function applySearchFilterSort(todos){
  const q = document.getElementById("todo-search").value.trim().toLowerCase();
  const statusFilter = document.getElementById("todo-filter-status").value;
  const sortKey = document.getElementById("todo-sort").value;
  let result = todos.filter(t=>{
    if(q && !t.title.toLowerCase().includes(q)) return false;
    if(statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });
  const prioRank = {high:0, medium:1, low:2};
  if(sortKey==="due_asc"){
    result.sort((a,b)=>{ const da=a.due_date||"9999-99-99", db=b.due_date||"9999-99-99"; if(da!==db) return da<db?-1:1; if(prioRank[a.priority]!==prioRank[b.priority]) return prioRank[a.priority]-prioRank[b.priority]; return new Date(a.created_at)-new Date(b.created_at); });
  } else if(sortKey==="priority_desc"){
    result.sort((a,b)=>{ if(prioRank[a.priority]!==prioRank[b.priority]) return prioRank[a.priority]-prioRank[b.priority]; const da=a.due_date||"9999-99-99", db=b.due_date||"9999-99-99"; return da<db?-1:da>db?1:0; });
  } else { result.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)); }
  return result;
}
async function renderTodosList(){
  const scope = document.getElementById("todo-scope-select").value;
  const todos = await loadTodosForScope(scope);
  const filtered = applySearchFilterSort(todos);
  const wrap = document.getElementById("todos-list");
  if(!filtered.length){ wrap.innerHTML = `<div class="empty">조건에 맞는 할 일이 없습니다.</div>`; return; }
  const L = THEME_LABELS[CURRENT_THEME];
  wrap.innerHTML = filtered.map(t=>`
    <div class="list-item ${t.status==="done"?"done":""}">
      <div class="row">
        <div>
          <label style="display:inline-flex;align-items:center;gap:6px;">
            <input type="checkbox" data-toggle="${t.id}" ${t.status==="done"?"checked":""}>
            <strong>${escapeHtml(t.title)}</strong>
          </label>
          <span class="tag">${t.priority==="high"?"높음":t.priority==="low"?"낮음":"보통"}</span>
          ${(t.tags||[]).map(tag=>`<span class="tag">#${escapeHtml(tag)}</span>`).join("")}
        </div>
        <div><button class="ghost small" data-edit-todo="${t.id}">수정</button><button class="ghost small danger" data-delete-todo="${t.id}">삭제</button></div>
      </div>
      <div class="meta">마감 ${fmtDate(t.due_date)} · 예상 ${t.estimated_time_raw||t.estimated_minutes+"분"}</div>
      ${t.memo ? `<div class="meta">${escapeHtml(t.memo)}</div>` : ""}
    </div>
  `).join("");
  wrap.querySelectorAll("[data-toggle]").forEach(chk=>chk.addEventListener("change", ()=> chk.checked ? completeTodo(chk.dataset.toggle, chk, L) : undoTodo(chk.dataset.toggle, chk) ));
  wrap.querySelectorAll("[data-edit-todo]").forEach(btn=>btn.addEventListener("click", ()=>startTodoEdit(todos.find(t=>t.id===btn.dataset.editTodo))));
  wrap.querySelectorAll("[data-delete-todo]").forEach(btn=>btn.addEventListener("click", async ()=>{
    if(!confirm("이 할 일을 삭제할까요?")) return;
    await sb.from("todos").update({ is_deleted:true }).eq("id", btn.dataset.deleteTodo);
    toast("삭제했습니다."); renderTodosList();
  }));
}
async function completeTodo(todoId, chkEl, L){
  if(chkEl) chkEl.disabled = true;
  const { data, error } = await sb.from("todos").update({ status:"done", updated_at:new Date().toISOString() }).eq("id", todoId).neq("status","done").select();
  if(error){ toast("처리 실패: "+error.message); if(chkEl) chkEl.disabled=false; return; }
  if(data && data.length>0){ await sb.from("todo_completions").insert({ todo_id: todoId }); toast(L.complete+"!"); }
  else { toast("이미 완료 상태입니다. (중복 기록되지 않음)"); }
  renderTodosList();
}
async function undoTodo(todoId, chkEl){
  if(chkEl) chkEl.disabled = true;
  await sb.from("todos").update({ status:"in_progress", updated_at:new Date().toISOString() }).eq("id", todoId).eq("status","done");
  toast("진행 중으로 되돌렸습니다.");
  renderTodosList();
}

// ============================================================
// Do — 타이머 (START/PAUSE/RESUME/STOP/COMPLETE) + 수동 기록
// ============================================================
let timerState = { logId:null, status:"idle", accumulatedMs:0, segmentStart:null, intervalHandle:null, pendingStopComplete:false };

async function fillDoTodoSelector(){
  const { data } = await sb.from("todos").select("*").eq("is_deleted", false).order("created_at",{ascending:false});
  const sel = document.getElementById("do-todo-select");
  const prev = sel.value;
  sel.innerHTML = (data||[]).map(t=>`<option value="${t.id}">${escapeHtml(t.title)}</option>`).join("") || `<option value="">(할 일 없음)</option>`;
  if(data && data.find(t=>t.id===prev)) sel.value = prev;
  resetTimerUI();
}
function resetTimerUI(){
  timerState = { logId:null, status:"idle", accumulatedMs:0, segmentStart:null, intervalHandle:null, pendingStopComplete:false };
  clearInterval(timerState.intervalHandle);
  document.getElementById("timer-display").textContent = "00:00:00";
  document.getElementById("timer-start-btn").style.display = "inline-block";
  document.getElementById("timer-pause-btn").style.display = "none";
  document.getElementById("timer-resume-btn").style.display = "none";
  document.getElementById("timer-stop-btn").style.display = "none";
  document.getElementById("timer-complete-btn").style.display = "none";
  document.getElementById("stop-reason-box").style.display = "none";
}
function fmtHMS(ms){
  const s = Math.floor(ms/1000);
  const h = String(Math.floor(s/3600)).padStart(2,"0");
  const m = String(Math.floor((s%3600)/60)).padStart(2,"0");
  const sec = String(s%60).padStart(2,"0");
  return `${h}:${m}:${sec}`;
}
function tickTimer(){
  const live = timerState.status==="running" ? (Date.now() - timerState.segmentStart) : 0;
  document.getElementById("timer-display").textContent = fmtHMS(timerState.accumulatedMs + live);
}
async function timerStart(){
  const todoId = document.getElementById("do-todo-select").value;
  if(!todoId){ toast("할 일을 먼저 선택하세요."); return; }
  const now = new Date().toISOString();
  const { data: log, error } = await sb.from("execution_logs").insert({ todo_id: todoId, status:"running", started_at: now }).select().single();
  if(error){ toast("시작 실패: "+error.message); return; }
  await sb.from("execution_segments").insert({ execution_log_id: log.id, segment_type:"work", segment_start: now });
  timerState.logId = log.id; timerState.status="running"; timerState.accumulatedMs=0; timerState.segmentStart = Date.now();
  timerState.intervalHandle = setInterval(tickTimer, 1000);
  document.getElementById("timer-start-btn").style.display="none";
  document.getElementById("timer-pause-btn").style.display="inline-block";
  document.getElementById("timer-stop-btn").style.display="inline-block";
  document.getElementById("timer-complete-btn").style.display="inline-block";
  toast("타이머를 시작했습니다.");
}
async function closeOpenSegment(type){
  const now = new Date().toISOString();
  await sb.from("execution_segments").update({ segment_end: now }).eq("execution_log_id", timerState.logId).eq("segment_type", type).is("segment_end", null);
}
async function timerPause(){
  if(timerState.status!=="running") return;
  timerState.accumulatedMs += Date.now() - timerState.segmentStart;
  clearInterval(timerState.intervalHandle);
  await closeOpenSegment("work");
  const now = new Date().toISOString();
  await sb.from("execution_segments").insert({ execution_log_id: timerState.logId, segment_type:"pause", segment_start: now });
  await sb.from("execution_logs").update({ status:"paused" }).eq("id", timerState.logId);
  timerState.status = "paused";
  document.getElementById("timer-pause-btn").style.display="none";
  document.getElementById("timer-resume-btn").style.display="inline-block";
  toast("일시정지했습니다.");
}
async function timerResume(){
  if(timerState.status!=="paused") return;
  await closeOpenSegment("pause");
  const now = new Date().toISOString();
  await sb.from("execution_segments").insert({ execution_log_id: timerState.logId, segment_type:"work", segment_start: now });
  await sb.from("execution_logs").update({ status:"running" }).eq("id", timerState.logId);
  timerState.status = "running"; timerState.segmentStart = Date.now();
  timerState.intervalHandle = setInterval(tickTimer, 1000);
  document.getElementById("timer-resume-btn").style.display="none";
  document.getElementById("timer-pause-btn").style.display="inline-block";
  toast("다시 시작합니다.");
}
async function computeActualMinutesForLog(logId){
  const { data: segs } = await sb.from("execution_segments").select("*").eq("execution_log_id", logId).eq("segment_type","work");
  let totalMs = 0;
  (segs||[]).forEach(s=>{ const end = s.segment_end ? new Date(s.segment_end) : new Date(); totalMs += (end - new Date(s.segment_start)); });
  return Math.round(totalMs/60000);
}
function timerStopOrComplete(willComplete){
  if(timerState.status==="idle") return;
  timerState.pendingStopComplete = willComplete ? "completed" : "stopped";
  document.getElementById("stop-reason-box").style.display = "flex";
}
async function finalizeTimer(reason){
  clearInterval(timerState.intervalHandle);
  const type = timerState.status==="running" ? "work" : "pause";
  await closeOpenSegment(type);
  const actual_minutes = await computeActualMinutesForLog(timerState.logId);
  await sb.from("execution_logs").update({
    status: timerState.pendingStopComplete, ended_at: new Date().toISOString(),
    actual_minutes, blocker_reason: reason || ""
  }).eq("id", timerState.logId);
  toast(timerState.pendingStopComplete==="completed" ? "실행을 완료로 기록했습니다." : "실행을 중단으로 기록했습니다.");
  resetTimerUI();
  renderLogsList();
}

// ---------- 수동 기록 ----------
async function submitLog(){
  const todoId = document.getElementById("do-todo-select").value;
  if(!todoId){ toast("할 일을 먼저 선택하세요."); return; }
  const startVal = document.getElementById("log-start").value;
  if(!startVal){ toast("시작 시각은 필수입니다."); return; }
  const endVal = document.getElementById("log-end").value;
  const actual_minutes = parseInt(document.getElementById("log-actual").value) || 0;
  const blocker_reason = document.getElementById("log-blocker").value.trim();
  const { error } = await sb.from("execution_logs").insert({
    todo_id: todoId, status:"completed",
    started_at: new Date(startVal).toISOString(), ended_at: endVal ? new Date(endVal).toISOString() : null,
    actual_minutes, blocker_reason
  });
  if(error){ toast("저장 실패: "+error.message); return; }
  toast("수동 기록을 저장했습니다. (계획 원본 값은 그대로 유지됩니다)");
  ["log-start","log-end","log-actual","log-blocker"].forEach(id=>document.getElementById(id).value="");
  renderLogsList();
}
async function renderLogsList(){
  const todoId = document.getElementById("do-todo-select").value;
  const wrap = document.getElementById("logs-list");
  if(!todoId){ wrap.innerHTML = `<div class="empty">할 일을 먼저 선택하세요.</div>`; return; }
  const { data, error } = await sb.from("execution_logs").select("*").eq("todo_id", todoId).order("started_at",{ascending:false});
  if(error){ wrap.innerHTML = `<div class="empty">로드 실패</div>`; return; }
  const tz = getDisplayTZ();
  if(!data.length){ wrap.innerHTML = `<div class="empty">아직 실행 기록이 없습니다.</div>`; return; }
  wrap.innerHTML = data.map(l=>`
    <div class="list-item">
      <div class="meta">[${l.status}] 시작 ${fmtDateTime(l.started_at, tz)} → 끝 ${fmtDateTime(l.ended_at, tz)}</div>
      <div class="meta">실제 ${l.actual_minutes}분${l.blocker_reason ? " · 막힘: "+escapeHtml(l.blocker_reason) : ""}</div>
    </div>
  `).join("");
}

// ============================================================
// Diary
// ============================================================
async function submitDiary(){
  const entry_date = document.getElementById("diary-date").value || todayInTZ(getDisplayTZ());
  const mood = document.getElementById("diary-mood").value.trim();
  const mood_music = document.getElementById("diary-music").value.trim();
  const food = document.getElementById("diary-food").value.trim();
  const event = document.getElementById("diary-event").value.trim();
  const wanted_to_say = document.getElementById("diary-wanted").value.trim();
  const free_text = document.getElementById("diary-free").value.trim();
  const { error } = await sb.from("diary_entries").insert({ entry_date, mood, mood_music, food, event, wanted_to_say, free_text });
  if(error){ toast("저장 실패: "+error.message); return; }
  toast("오늘의 기록을 저장했습니다.");
  ["diary-mood","diary-music","diary-food","diary-event","diary-wanted","diary-free"].forEach(id=>document.getElementById(id).value="");
  renderDiary();
}
async function renderDiary(){
  const { data, error } = await sb.from("diary_entries").select("*").order("entry_date",{ascending:false});
  const wrap = document.getElementById("diary-list");
  if(error){ wrap.innerHTML=`<div class="empty">로드 실패</div>`; return; }
  wrap.innerHTML = (data||[]).map(d=>`
    <div class="list-item">
      <div class="row"><strong>${fmtDate(d.entry_date)}</strong>${d.mood?` <span class="tag">${escapeHtml(d.mood)}</span>`:""}</div>
      ${d.mood_music ? `<div class="meta">🎵 ${escapeHtml(d.mood_music)}</div>` : ""}
      ${d.food ? `<div class="meta">🍚 ${escapeHtml(d.food)}</div>` : ""}
      ${d.event ? `<div class="meta">✨ ${escapeHtml(d.event)}</div>` : ""}
      ${d.wanted_to_say ? `<div class="meta">💬 ${escapeHtml(d.wanted_to_say)}</div>` : ""}
      ${d.free_text ? `<div>${escapeHtml(d.free_text)}</div>` : ""}
    </div>
  `).join("") || `<div class="empty">아직 기록이 없습니다.</div>`;
}

// ============================================================
// 월간
// ============================================================
async function renderMonthly(){
  const ym = document.getElementById("monthly-select").value || todayInTZ(getDisplayTZ()).slice(0,7);
  document.getElementById("monthly-select").value = ym;
  const from = ym + "-01";
  const toDate = new Date(ym+"-01"); toDate.setMonth(toDate.getMonth()+1);
  const to = toDate.toISOString().slice(0,10);

  const { data: todos } = await sb.from("todos").select("*").eq("is_deleted", false).gte("due_date", from).lt("due_date", to);
  const list = todos || [];
  const tz = getDisplayTZ(); const today = todayInTZ(tz);
  const planIds = new Set(list.map(t=>t.plan_id).filter(Boolean));
  const doneList = list.filter(t=>t.status==="done");
  const overdueList = list.filter(t=>t.status!=="done" && t.due_date && t.due_date<today);
  const ids = list.map(t=>t.id);
  let logs = [];
  if(ids.length){ const { data } = await sb.from("execution_logs").select("*").in("todo_id", ids); logs = data||[]; }
  const blockedIds = new Set(logs.filter(l=>l.blocker_reason && l.blocker_reason.trim()).map(l=>l.todo_id));
  const expected = list.reduce((s,t)=>s+(t.estimated_minutes||0),0);
  const actual = logs.reduce((s,l)=>s+(l.actual_minutes||0),0);

  const wrap = document.getElementById("monthly-stats");
  wrap.innerHTML = `
    <button class="stat" id="m-plan"><div class="num">${planIds.size}</div><div class="lbl">PLAN</div></button>
    <button class="stat" id="m-done"><div class="num">${doneList.length}</div><div class="lbl">COMPLETED</div></button>
    <button class="stat" id="m-delay"><div class="num">${overdueList.length}</div><div class="lbl">DELAYED</div></button>
    <button class="stat" id="m-block"><div class="num">${blockedIds.size}</div><div class="lbl">BLOCKED</div></button>
    <button class="stat" id="m-time"><div class="num">${actual-expected>=0?"+":""}${actual-expected}분</div><div class="lbl">실제−예상</div></button>
  `;
  const drill = document.getElementById("monthly-drilldown");
  function show(title, arr){ drill.innerHTML = `<h3 style="font-size:14px;">${title}</h3>` + (arr.length ? arr.map(t=>`<div class="list-item">${escapeHtml(t.title)} <span class="meta">마감 ${fmtDate(t.due_date)}</span></div>`).join("") : `<div class="empty">해당 기록 없음</div>`); }
  document.getElementById("m-plan").onclick = ()=>show("이번 달 Todo 전체", list);
  document.getElementById("m-done").onclick = ()=>show("완료", doneList);
  document.getElementById("m-delay").onclick = ()=>show("지연", overdueList);
  document.getElementById("m-block").onclick = ()=>show("막힘", list.filter(t=>blockedIds.has(t.id)));
  document.getElementById("m-time").onclick = ()=>{ drill.innerHTML = `<h3 style="font-size:14px;">예상 ${expected}분 · 실제 ${actual}분</h3>`; };
}

// ============================================================
// Search
// ============================================================
async function runSearch(){
  const from = document.getElementById("search-from").value;
  const to = document.getElementById("search-to").value;
  const kw = document.getElementById("search-keyword").value.trim();
  const wrap = document.getElementById("search-results");
  if(!kw && !from && !to){ wrap.innerHTML = `<div class="empty">검색어나 기간을 입력하세요.</div>`; return; }
  const results = [];

  let sq = sb.from("schedules").select("*");
  if(from) sq = sq.gte("event_date", from); if(to) sq = sq.lte("event_date", to);
  if(kw) sq = sq.or(`title.ilike.%${kw}%,memo.ilike.%${kw}%,location.ilike.%${kw}%`);
  const { data: scheds } = await sq;
  (scheds||[]).forEach(s=>results.push({type:"Schedule", date:s.event_date, title:s.title}));

  let tq = sb.from("todos").select("*").eq("is_deleted", false);
  if(from) tq = tq.gte("due_date", from); if(to) tq = tq.lte("due_date", to);
  if(kw) tq = tq.or(`title.ilike.%${kw}%,memo.ilike.%${kw}%`);
  const { data: todos } = await tq;
  (todos||[]).forEach(t=>results.push({type:"Todo", date:t.due_date, title:t.title}));

  let dq = sb.from("diary_entries").select("*");
  if(from) dq = dq.gte("entry_date", from); if(to) dq = dq.lte("entry_date", to);
  if(kw) dq = dq.or(`free_text.ilike.%${kw}%,event.ilike.%${kw}%,wanted_to_say.ilike.%${kw}%,mood.ilike.%${kw}%`);
  const { data: diaries } = await dq;
  (diaries||[]).forEach(d=>results.push({type:"Diary", date:d.entry_date, title: d.event || d.free_text?.slice(0,30) || "(내용 없음)"}));

  results.sort((a,b)=> (b.date||"") < (a.date||"") ? -1 : 1);
  wrap.innerHTML = results.length ? results.map(r=>`
    <div class="list-item"><span class="tag">${r.type}</span> <strong>${escapeHtml(r.title)}</strong> <span class="meta">${fmtDate(r.date)}</span></div>
  `).join("") : `<div class="empty">검색 결과가 없습니다.</div>`;
}

// ============================================================
// See / Review
// ============================================================
async function renderReview(){
  const planId = document.getElementById("review-plan-select").value;
  if(!planId) return;
  const { data: todos } = await sb.from("todos").select("*").eq("plan_id", planId).eq("is_deleted", false);
  const list = todos || [];
  const tz = getDisplayTZ(); const today = todayInTZ(tz);
  const doneList = list.filter(t=>t.status==="done");
  const overdueList = list.filter(t=>t.status!=="done" && t.due_date && t.due_date<today);
  const ids = list.map(t=>t.id);
  let logs = [];
  if(ids.length){ const { data } = await sb.from("execution_logs").select("*").in("todo_id", ids); logs = data||[]; }
  const blockedIds = new Set(logs.filter(l=>l.blocker_reason && l.blocker_reason.trim()).map(l=>l.todo_id));
  const expected = list.reduce((s,t)=>s+(t.estimated_minutes||0),0);
  const actual = logs.reduce((s,l)=>s+(l.actual_minutes||0),0);
  const diff = actual - expected;

  document.getElementById("stat-plan-num").textContent = list.length;
  document.getElementById("stat-done-num").textContent = doneList.length;
  document.getElementById("stat-overdue-num").textContent = overdueList.length;
  document.getElementById("stat-blocked-num").textContent = blockedIds.size;
  document.getElementById("stat-diff-num").textContent = (diff>=0?"+":"")+diff+"분";
  document.getElementById("review-time-detail").textContent = `예상 ${expected}분 · 실제 ${actual}분 (표시 시간대: ${tz}, 오늘=${today})`;

  const drill = document.getElementById("review-drilldown");
  function show(title, arr){ drill.innerHTML = arr.length ? `<h3 style="font-size:14px;">${title}</h3>` + arr.map(t=>`<div class="list-item"><strong>${escapeHtml(t.title)}</strong> <span class="meta">마감 ${fmtDate(t.due_date)} · ${t.status==="done"?"완료":"진행중"}</span></div>`).join("") : `<div class="empty">${title}: 해당 기록 없음</div>`; }
  document.getElementById("stat-plan").onclick = ()=>show("전체 할 일", list);
  document.getElementById("stat-done").onclick = ()=>show("완료", doneList);
  document.getElementById("stat-overdue").onclick = ()=>show("지연", overdueList);
  document.getElementById("stat-blocked").onclick = ()=>show("막힘", list.filter(t=>blockedIds.has(t.id)));
  document.getElementById("stat-diff").onclick = ()=>{
    drill.innerHTML = `<h3 style="font-size:14px;">시간 근거 기록</h3>` + (logs.length ? logs.map(l=>`<div class="list-item"><span class="meta">${fmtDateTime(l.started_at, tz)} · 실제 ${l.actual_minutes}분${l.blocker_reason?" · "+escapeHtml(l.blocker_reason):""}</span></div>`).join("") : `<div class="empty">실행 기록 없음</div>`);
  };
  renderNextActions(planId);
}
async function saveNextAction(){
  const planId = document.getElementById("review-plan-select").value;
  const note = document.getElementById("next-action-input").value.trim();
  if(!note){ toast("내용을 입력하세요."); return; }
  const plan = (await loadPlans()).find(p=>p.id===planId);
  await sb.from("next_actions").insert({ plan_id: planId, period_label: plan?plan.title:"미지정", note });
  toast("다음 계획으로 넘길 한 줄을 저장했습니다.");
  document.getElementById("next-action-input").value = "";
  renderNextActions(planId);
}
async function renderNextActions(planId){
  const { data } = await sb.from("next_actions").select("*").eq("plan_id", planId).order("created_at",{ascending:false});
  document.getElementById("next-actions-list").innerHTML = (data||[]).map(n=>`<div class="history-item">${escapeHtml(n.note)}</div>`).join("") || `<div class="empty">아직 없음</div>`;
}

// ============================================================
// Export
// ============================================================
async function exportAll(){
  const tables = ["plans","plan_success_criteria","plan_history","todos","todo_completions","execution_logs","execution_segments","schedules","diary_entries","next_actions"];
  const payload = { exported_at: new Date().toISOString(), display_timezone_at_export: getDisplayTZ(), theme_at_export: CURRENT_THEME };
  for(const t of tables){ const { data } = await sb.from(t).select("*"); payload[t] = data; }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `plandosee-export-${todayInTZ(getDisplayTZ())}.json`; a.click();
  URL.revokeObjectURL(url);
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
  await renderSchedule();
  await renderDiary();
  if(document.getElementById("review-plan-select").value) await renderReview();
  document.getElementById("monthly-select").value = todayInTZ(getDisplayTZ()).slice(0,7);
  await renderMonthly();
}

window.addEventListener("DOMContentLoaded", async ()=>{
  initTabs(); initThemeCards(); initTimezonePicker(); renderCategoryOptions();
  addCriterionRow("", false);
  document.getElementById("sched-view-date").value = todayInTZ(getDisplayTZ());
  document.getElementById("diary-date").value = todayInTZ(getDisplayTZ());
  document.getElementById("todo-filter-status").value = "in_progress";

  document.getElementById("sched-submit-btn").addEventListener("click", submitSchedule);
  document.getElementById("sched-view-date").addEventListener("change", renderSchedule);

  document.getElementById("plan-add-criterion").addEventListener("click", ()=>addCriterionRow("", false));
  document.getElementById("plan-submit-btn").addEventListener("click", submitPlan);
  document.getElementById("plan-cancel-edit").addEventListener("click", cancelPlanEdit);

  document.getElementById("todo-scope-select").addEventListener("change", renderTodosList);
  document.getElementById("todo-submit-btn").addEventListener("click", submitTodo);
  document.getElementById("todo-cancel-edit").addEventListener("click", cancelTodoEdit);
  document.getElementById("todo-search").addEventListener("input", renderTodosList);
  document.getElementById("todo-filter-status").addEventListener("change", renderTodosList);
  document.getElementById("todo-sort").addEventListener("change", renderTodosList);

  document.getElementById("do-todo-select").addEventListener("change", async ()=>{ resetTimerUI(); renderLogsList(); });
  document.getElementById("timer-start-btn").addEventListener("click", timerStart);
  document.getElementById("timer-pause-btn").addEventListener("click", timerPause);
  document.getElementById("timer-resume-btn").addEventListener("click", timerResume);
  document.getElementById("timer-stop-btn").addEventListener("click", ()=>timerStopOrComplete(false));
  document.getElementById("timer-complete-btn").addEventListener("click", ()=>timerStopOrComplete(true));
  document.getElementById("stop-skip-btn").addEventListener("click", ()=>finalizeTimer(""));
  document.getElementById("stop-save-btn").addEventListener("click", ()=>finalizeTimer(document.getElementById("stop-reason-input").value.trim()));
  document.getElementById("log-submit-btn").addEventListener("click", submitLog);

  document.getElementById("diary-submit-btn").addEventListener("click", submitDiary);

  document.getElementById("monthly-select").addEventListener("change", renderMonthly);

  document.getElementById("search-btn").addEventListener("click", runSearch);

  document.getElementById("review-plan-select").addEventListener("change", renderReview);
  document.getElementById("next-action-save").addEventListener("click", saveNextAction);

  document.getElementById("export-btn").addEventListener("click", exportAll);

  // 저장된 테마가 있으면 START 화면 건너뛰고 바로 Space로
  const savedTheme = localStorage.getItem("pds_theme");
  if(savedTheme && THEME_LABELS[savedTheme]) goToSpace(savedTheme);
});
