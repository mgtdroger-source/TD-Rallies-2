/*!
 * timeline_widget_v1_85.js
 * Extracted from Timeline_Shell_v0_81_soften_sg1_only_embedded_gate.html
 * Phase-1: widget-only (no storage wiring). Host owns overlay/card.
 */
(function (global) {
  'use strict';
  const TLW_VERSION = '1.85';

  const _instances = new WeakMap();
  // In-memory persistence used only while the widget is open.
  const _memFocus = new Map();
  const _memStartDelays = new Map();
  // Route 2 car counts are stored/read separately from Route 1 car counts.
  // Current lane model: shared time-to-distance solver for Route 1 and Route 2.
  // AT rows add onward timing per SG; A/D labels are staggered for readability without moving lane geometry.
  const _memApplyStartDelays = new Map();

  let _styleInjected = false;

  function injectStylesOnce() {
    if (_styleInjected) return;
    _styleInjected = true;

    const css = `
/* Timeline Widget (scoped under .tlw-root) */
.tlw-root{ --bg:#f9fafb; --panel:#f5f5f7; --border:#d3d7df; --text:#111827; --accent:#2563eb; color:var(--text); font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.tlw-root *{ box-sizing:border-box; }
.tlw-widget-title{ font-size:15px; line-height:1.2; margin:0 0 8px; font-weight:600; color:#111827; }
.tlw-row{ display:flex; gap:12px; align-items:stretch; }
.tlw-panel{ background:var(--panel); border-radius:10px; border:1px solid var(--border); padding:10px 12px; }
.tlw-panel h2{ font-size:14px; margin:0 0 6px; }
.tlw-panel small{ font-size:11px; color:#6b7280; }
.tlw-panel-controls{ width:220px; flex-shrink:0; display:flex; flex-direction:column; gap:8px; }
.tlw-panel-timeline{ flex:1; min-width:0; display:flex; flex-direction:column; gap:8px; }

.tlw-delay-table{ width:100%; border-collapse:collapse; table-layout:fixed; }
.tlw-delay-table th,.tlw-delay-table td{ padding:4px 4px; text-align:left; white-space:nowrap; font-size:12px; }
.tlw-delay-table th{ font-weight:600; border-bottom:1px solid #e5e7eb; background:#f3f4f6; }
.tlw-delay-table th:nth-child(1), .tlw-delay-table td:nth-child(1){ width:68px; }
.tlw-delay-table td:first-child{ font-weight:600; }
.tlw-delay-table th:nth-child(2), .tlw-delay-table td:nth-child(2){ width:72px; }
.tlw-delay-table th:nth-child(3), .tlw-delay-table td:nth-child(3){ width:48px; text-align:center; padding-left:2px; padding-right:2px; }
.tlw-delay-table.tlw-route2-cars th,.tlw-delay-table.tlw-route2-cars td{ text-align:center; }
.tlw-delay-table.tlw-route2-cars th:nth-child(1), .tlw-delay-table.tlw-route2-cars td:nth-child(1){ width:72px; }
.tlw-delay-table.tlw-route2-cars th:nth-child(2), .tlw-delay-table.tlw-route2-cars td:nth-child(2){ width:58px; }
.tlw-delay-table.tlw-route2-cars th:nth-child(3), .tlw-delay-table.tlw-route2-cars td:nth-child(3){ width:58px; }

.tlw-num{ text-align:center; } /* keep spinners */
.tlw-delay-input, .tlw-cars-input{ width:44px; padding:2px 4px; font-size:12px; text-align:center; display:block; margin:0 auto; box-sizing:border-box; }

.tlw-focus{ line-height:1.4; margin-top:6px; padding:6px 8px; border-radius:8px; border:1px solid var(--border); background:#fff; min-height:34px; white-space:normal; font-size:11px; color:#111; font-weight:500; }
.tlw-summary{ font-size:11px; color:#374151; white-space:pre-line; }
.tlw-viewport{ position:relative; border-radius:10px; border:1px solid var(--border); background:#fff; overflow:hidden; padding:8px; }
.tlw-inner{ width:100%; min-width:100%; }
.tlw-svg{ display:block; }
.tlw-legend{ display:none; } /* hidden per v0.81 */
.tlw-scanner{ margin-top:8px; display:flex; flex-direction:column; gap:4px; }
.tlw-scanner-label{ font-size:11px; color:#4b5563; }
.tlw-range{ width:100%; }

.tlw-nav-btn{
  position:absolute; bottom:12px;
  width:32px; height:32px; border-radius:999px;
  border:1px solid #9ca3af;
  background:rgba(255,255,255,0.96);
  display:flex; align-items:center; justify-content:center;
  font-size:18px; line-height:1; cursor:pointer;
  box-shadow:0 1px 3px rgba(15,23,42,0.15);
  user-select:none;
}
.tlw-nav-btn:hover{ box-shadow:0 2px 6px rgba(15,23,42,0.25); }
.tlw-nav-btn:active{ transform:translateY(1px); }
.tlw-nav-btn.left{ left:50%; margin-left:-56px; }
.tlw-nav-btn.right{ left:50%; margin-left:24px; }

.tlw-focus-select{
  width:100%; font-size:12px;
  box-sizing:border-box;
  min-height:28px; height:28px; line-height:20px;
  padding:3px 8px;
}
.tlw-delay-section.tlw-delay-locked .tlw-delay-input{ opacity:.55; filter:grayscale(1); background:#f3f4f6; color:#6b7280; cursor:not-allowed; }
.tlw-delay-section.tlw-delay-locked .tlw-delay-input:disabled{ cursor:not-allowed; }
.tlw-delay-section.tlw-delay-locked .tlw-cars-input{ opacity:1; filter:none; background:#fff; color:#111827; cursor:text; }
.tlw-delay-lock-note{ display:none; margin:6px 0; padding:6px 8px; border:1px solid #d1d5db; border-radius:8px; background:#f3f4f6; color:#6b7280; font-size:11px; line-height:1.3; }
.tlw-delay-section.tlw-delay-locked .tlw-delay-lock-note{ display:block; }
`;
    const st = document.createElement('style');
    st.id = 'timeline-widget-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function makeTemplate(prefix) {
    // Note: IDs are prefixed to avoid collisions when multiple instances exist.
    const id = (s) => `${prefix}${s}`;
    return `
<div class="tlw-root" data-tlw-root="1">
  <div class="tlw-row">
    <div class="tlw-panel tlw-panel-controls">
      <div class="tlw-delay-section">
      <h2>Start delays</h2>
      <small>Adjust start delay per group (minutes). Blocks move along the road.</small>
      <div class="tlw-delay-lock-note">Start delays are editable on Route 1 only. Viewing in read-only mode.</div>

      <div style="margin-top:6px; font-size:11px;">
        <label style="display:flex; align-items:center; gap:4px;">
          <input id="${id('elasticToggle')}" type="checkbox" checked>
          Apply start delays
        </label>
      </div>

      <table class="tlw-delay-table">
        <thead><tr><th>Group</th><th>Delay (min)</th><th>Cars</th></tr></thead>
        <tbody id="${id('delayTableBody')}"></tbody>
      </table>
      <div style="margin-top:8px; font-size:11px;">
        <label style="display:flex; align-items:center; gap:4px;">
          <input id="${id('showCarsToggle')}" type="checkbox" checked>
          Show individual cars inside each group
        </label>
      </div>
      </div>

      <h2 style="margin-top:10px;">Focus row</h2>
      <small>Select a row to centre the scanner on that point.</small>

      <div style="margin-top:4px;">
        <select id="${id('focusRowSelect')}" class="tlw-focus-select"></select>
      </div>

      <div class="tlw-focus" id="${id('focusInstruction')}" style="margin-top:6px;"></div>
      <div class="tlw-summary" id="${id('rowSummary')}" style="margin-top:8px;"></div>
      <div class="tlw-summary" id="${id('gapSummary')}" style="margin-top:4px;"></div>
    </div>

    <div class="tlw-panel tlw-panel-timeline">
      <h2>Distance lanes (30 km window) <small id="${id('laneStyleNote')}" style="font-size:11px; font-weight:500; color:inherit; margin-left:8px;">— Route 1 is shown in stronger text; Route 2 in lighter text.</small></h2>
      <small id="${id('laneNote')}"></small>

      <div class="tlw-viewport">
        <div class="tlw-inner">
          <svg id="${id('timelineSvg')}" class="tlw-svg" width="800" height="280"></svg>
        </div>
        <div id="${id('timelinePrevBtn')}" class="tlw-nav-btn left" title="Previous waypoint" aria-label="Previous waypoint">◀</div>
        <div id="${id('timelineNextBtn')}" class="tlw-nav-btn right" title="Next waypoint" aria-label="Next waypoint">▶</div>
      </div>

      <div id="${id('legend')}" class="tlw-legend"></div>

      <div class="tlw-scanner">
        <div id="${id('scannerLabel')}" class="tlw-scanner-label">Route scanner – initialising…</div>
        <input id="${id('routeScanner')}" class="tlw-range" type="range">

        <div id="${id('timeOffsetLabel')}" class="tlw-scanner-label" style="margin-top:6px; text-align:center;">
          Time offset around this row (–20 to +20 min): 0.0 min
        </div>
        <input id="${id('timeOffsetSlider')}" type="range" min="-20" max="20" step="0.5" value="0"
               style="width:220px; margin:4px auto 0 auto; display:block;">
      </div>
    </div>
  </div>
</div>`;
  }

  function updateHostTitle(containerEl) {
    const wanted = 'Timeline - Routes 1 and 2 - Slower groups starting first';
    try {
      const scope = containerEl.closest('.modal, .dialog, .timeline-widget-wrap, .tlw-host, section, article, main') || containerEl.parentElement || document;
      const heads = Array.from(scope.querySelectorAll('h1,h2,h3'));
      const old = heads.find(h => (h.textContent || '').trim() === 'Timeline - Slower groups starting first');
      if (old) old.textContent = wanted;
    } catch (_e) {}
  }

  function createInstance(containerEl, opts) {
    injectStylesOnce();

    const prefix = `tlw_${Math.random().toString(36).slice(2)}_`;
    updateHostTitle(containerEl);
    containerEl.innerHTML = makeTemplate(prefix);

    const root = containerEl.querySelector('[data-tlw-root="1"]');

    const rallyId = (opts && opts.rallyId) ? String(opts.rallyId) : '';
    const dayKey  = (opts && opts.dayKey != null) ? String(opts.dayKey) : '1';
    // v1.33 — route-aware store read. Prefer live Schedule route selector, then opts.
    function resolveRouteKey(){
      try{
        if (global && typeof global.getScheduleRouteKey_ === 'function') {
          const n = Number(global.getScheduleRouteKey_());
          if (n === 2) return '2';
        }
      }catch(_){}
      try{
        const lbl = global.document && global.document.getElementById('routePillLabel');
        const txt = lbl ? String(lbl.textContent || '') : '';
        if (/\b2\b/.test(txt)) return '2';
      }catch(_){}
      try{
        const checked = global.document && global.document.querySelector('#routePillMenu .daydd-item[aria-checked="true"]');
        const idx = checked && checked.dataset ? Number(checked.dataset.routeIndex) : NaN;
        if (idx === 1) return '2';
      }catch(_){}
      const raw = opts && (opts.routeKey != null ? opts.routeKey : (opts.routeNo != null ? opts.routeNo : opts.route));
      const n = Number(raw || 1);
      return String(n === 2 ? 2 : 1);
    }
    let routeKey = resolveRouteKey();
    function isDelayLocked(){ return String(routeKey || '1') !== '1'; }
    function isRoute2CompareMode(){ return String(routeKey || '1') === '2'; }
    function applyDelayLockUi(){
      try{
        const panel = root && root.querySelector('.tlw-delay-section');
        if (!panel) return;
        panel.classList.toggle('tlw-delay-locked', isDelayLocked());
        panel.title = isDelayLocked() ? 'Start delays editable on Route 1 only' : '';
      }catch(_e){}
    }

    // Day start clock (host-owned). Admin stores HH:MM:SS; widget displays A/D as dayStart + elapsed.
    let _dayStartStr = (opts && (opts.dayStart || opts.startTime)) ? String(opts.dayStart || opts.startTime) : '00:00:00';
    let _dayStartMin = 0; // computed after parseTime is available

    const q = (id) => root.querySelector('#' + prefix + id);
    let _booting = true;

    const memKey = String((opts && opts.rallyId) || rallyId || 'demo') + '|' + String((opts && opts.dayKey) || dayKey || '1') + '|R' + String(routeKey || '1');
    const _memGet = ()=> _memFocus.get(memKey) || null;
    const _memSet = (st)=> { try{ _memFocus.set(memKey, st); }catch(_e){} };

    function persistMemFocus(){
      try{
        const st = _memGet() || {};
        const idx = (focusSelect && !focusSelect.disabled) ? clampInt(focusSelect.value, 0, Math.max(0, hostRows.length-1)) : (st.focusIdx ?? 0);
        const scanner = q('routeScanner');
        const sc = scanner ? parseFloat(scanner.value) : (st.scannerPosKm ?? NaN);
        st.focusIdx = idx;
        if (Number.isFinite(sc)) st.scannerPosKm = sc;
        if (Number.isFinite(windowCenterKm)) st.windowCenterKm = windowCenterKm;
        if (Number.isFinite(timeOffsetMin)) st.timeOffsetMin = timeOffsetMin;
        _memSet(st);
      }catch(_e){}
    }

    function restoreMemFocus(){
      const st = _memGet();
      if (!st) return;
      try{
        if (focusSelect && !focusSelect.disabled && hostRows.length){
          const idx = clampInt(st.focusIdx, 0, hostRows.length-1);
          focusSelect.value = String(idx);
        }
      }catch(_e){}
      try{
        const scanner = q('routeScanner');
        if (scanner && Number.isFinite(st.scannerPosKm)) scanner.value = String(st.scannerPosKm);
        if (Number.isFinite(st.windowCenterKm)) windowCenterKm = st.windowCenterKm;
      }catch(_e){}
      try{
        if (Number.isFinite(st.timeOffsetMin)) timeOffsetMin = st.timeOffsetMin;
      }catch(_e){}
    }



    const ALL_GROUPS = ['SG1', 'SG2', 'SG3', 'SG4'];

    const startDelayMemKey = String((opts && opts.rallyId) || rallyId || 'demo') + '|' + String((opts && opts.dayKey) || dayKey || '1');
    const applyStartDelayMemKey = startDelayMemKey + '|route=' + String(routeKey || '1');
    function rememberApplyStartDelays_(v){
      try{ _memApplyStartDelays.set(applyStartDelayMemKey, !!v); }catch(_e){}
    }
    function recallApplyStartDelays_(){
      try{
        if (_memApplyStartDelays.has(applyStartDelayMemKey)) return !!_memApplyStartDelays.get(applyStartDelayMemKey);
      }catch(_e){}
      return true;
    }
    function rememberStartDelay_(g, v){
      try{
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        const map = _memStartDelays.get(startDelayMemKey) || {};
        map[g] = Math.max(0, Math.min(999, Math.round(n)));
        _memStartDelays.set(startDelayMemKey, map);
      }catch(_e){}
    }
    function recallStartDelay_(g){
      try{
        const map = _memStartDelays.get(startDelayMemKey);
        const n = map ? Number(map[g]) : NaN;
        return Number.isFinite(n) ? Math.max(0, Math.min(999, Math.round(n))) : null;
      }catch(_e){ return null; }
    }

    // Enabled lanes (host-controlled). SG1 + SG2 are always present; SG3/SG4 are optional.
    let _enabled = { SG3: true, SG4: true };
    function getEnabledGroups(){
      const out = ['SG1','SG2'];
      if (_enabled.SG3) out.push('SG3');
      if (_enabled.SG4) out.push('SG4');
      return out;
    }

    // Renderer colours — keyed by SG name
    // NOTE: Train dots (cars) use strokeCol + white surround; keep that logic unchanged.
    const groupStroke = { SG1:'#6d28d9', SG2:'#c58a00', SG3:'#3b82f6', SG4:'#58b879' };
    const groupStrokeOpacity = { SG1:0.75, SG2:1, SG3:1, SG4:1 };
    const groupFill   = { SG1:'#7c3aed', SG2:'#fff8cc', SG3:'#eaf2ff', SG4:'#eaf9ee' };
    const groupFillOpacity   = { SG1:0.15, SG2:1, SG3:1, SG4:1 };

    // Widget-owned controls/state
    const groupMeta = {
      SG1:{ delayMin:0, cars:5, intervalMin:1, allocCars:null },
      SG2:{ delayMin:0, cars:5, intervalMin:1, allocCars:null },
      SG3:{ delayMin:0, cars:5, intervalMin:1, allocCars:null },
      SG4:{ delayMin:0, cars:5, intervalMin:1, allocCars:null }
    };
    ALL_GROUPS.forEach(g=>{
      groupMeta[g].carsR1 = groupMeta[g].cars;
      groupMeta[g].carsR2 = groupMeta[g].cars;
    });


    // ---- Persist (DISABLED) ----
    // v1.16: The widget is READ-ONLY with respect to TD_RALLIES.
    // The host page (Schedule) is the single writer. The widget may still update its in-memory UI state.
    function schedulePersistStartDelays(){
      /* no-op (host-owned persistence) */
    }
    function persistStartDelaysNow(){
      /* no-op (host-owned persistence) */
    }

    // ---- TD_RALLIES (read-only) wiring ----
    function safeJsonParse(str){
      try { return JSON.parse(str); } catch(e){ return null; }
    }
    function readTdRallies(){
      const raw = localStorage.getItem('TD_RALLIES');
      if (!raw) return null;
      return safeJsonParse(raw);
    }
    function resolveRallyObj(td){
      if (!td || !td.rallies) return null;
      if (rallyId && td.rallies[rallyId]) return td.rallies[rallyId];
      const keys = Object.keys(td.rallies);
      if (keys.length === 1) return td.rallies[keys[0]];
      return null;
    }

    function resolveRallyEntry(td){
      if (!td || !td.rallies) return null;
      if (rallyId && td.rallies[rallyId]) return { id: rallyId, rally: td.rallies[rallyId] };
      const keys = Object.keys(td.rallies);
      if (keys.length === 1) return { id: keys[0], rally: td.rallies[keys[0]] };
      return null;
    }

    function _sgStoreKey_(g){
      const n = String(g || '').replace(/[^0-9]/g, '') || '1';
      return 'sg' + n;
    }
    function _ensureDayTimeline_(rally){
      if (!rally) return null;
      rally.schedule = rally.schedule || {};
      rally.schedule.days = rally.schedule.days || {};
      const dk = String(dayKey || '1');
      const dkNum = String(parseInt(dk, 10));
      const dayObj = rally.schedule.days[dk] || rally.schedule.days[dkNum] || (rally.schedule.days[dk] = {});
      dayObj.timeline = dayObj.timeline || {};
      return dayObj.timeline;
    }
    function persistRouteCarsToStore_(changedRouteNo, changedGroup){
      try{
        const raw = localStorage.getItem('TD_RALLIES');
        if (!raw) return;
        const td = safeJsonParse(raw);
        const entry = resolveRallyEntry(td);
        if (!entry || !entry.rally) return;
        const dayTimeline = _ensureDayTimeline_(entry.rally);
        if (!dayTimeline) return;
        dayTimeline.carsEstimate = dayTimeline.carsEstimate || {};
        dayTimeline.carsEstimateR2 = dayTimeline.carsEstimateR2 || {};
        ALL_GROUPS.forEach(g=>{
          const k = _sgStoreKey_(g);
          const meta = groupMeta[g] || {};
          dayTimeline.carsEstimate[k] = clampInt(meta.carsR1 ?? meta.cars ?? 0, 0, 99);
          dayTimeline.carsEstimateR2[k] = clampInt(meta.carsR2 ?? meta.cars ?? 0, 0, 99);
        });
        entry.rally.timeline = entry.rally.timeline || {};
        entry.rally.timeline.days = entry.rally.timeline.days || {};
        entry.rally.timeline.days[String(dayKey || '1')] = entry.rally.timeline.days[String(dayKey || '1')] || {};
        entry.rally.timeline.days[String(dayKey || '1')].carsEstimate = Object.assign({}, dayTimeline.carsEstimate);
        entry.rally.timeline.days[String(dayKey || '1')].carsEstimateR2 = Object.assign({}, dayTimeline.carsEstimateR2);
        localStorage.setItem('TD_RALLIES', JSON.stringify(td));
        try{ window.dispatchEvent(new CustomEvent('td:rallies-updated', { detail:{ source:'timeline-widget', kind:'carsEstimate', route:String(changedRouteNo||''), group:String(changedGroup||'') } })); }catch(_e){}
      }catch(_e){}
    }
    function clampSpeed6_120(v){
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Math.max(6, Math.min(120, Math.round(n)));
    }
    function applyExternalFromStorage(){
      try{ routeKey = resolveRouteKey(); }catch(_e){}
      try{ applyDelayLockUi(); }catch(_e){}
      const td = readTdRallies();
      const rally = resolveRallyObj(td);
      if (!rally) return;

      // A) Entrants -> allocCars (group label allocation ONLY; does NOT touch Cars inputs)
      const entrants = rally.timeline && rally.timeline.entrants;
      if (entrants) {
        const map = { '1':'SG1', '2':'SG2', '3':'SG3', '4':'SG4' };
        Object.keys(map).forEach(k=>{
          const v = Number(entrants[k]);
          if (Number.isFinite(v) && v >= 0) {
            groupMeta[map[k]].allocCars = Math.max(0, Math.min(99, Math.round(v)));
          }
        });
      }

      // A2) Timeline inputs (Delay/Cars) -> groupMeta (drives the UI table)
      const tl = rally.timeline || {};
      const dayTl = (tl.days && tl.days[dayKey]) ? tl.days[dayKey] : null;

      // Authoritative start-delay source is timeline.days[dayKey].delaysMin
      // with keys sg1/sg2/sg3/sg4. Route 2 reads these values read-only.
      function _pickSgVal_(src, k, g){
        if (!src || typeof src !== 'object') return null;
        if (src[k] != null) return src[k];
        if (src[g] != null) return src[g];
        const low = String(g).toLowerCase();
        if (src[low] != null) return src[low];
        if (src['sg' + k] != null) return src['sg' + k];
        return null;
      }
      function _resolveDelaySrc_(){
        const candidates = [];
        if (isRoute2CompareMode()) {
          candidates.push(
            dayTl && dayTl.delaysMin
          );
        }
        candidates.push(
          dayTl && dayTl.delaysMin,
          dayTl && dayTl.startDelays,
          tl && tl.delaysMin,
          tl && tl.startDelays,
          tl && tl.delays,
          tl && tl.delay,
          tl && tl.delayMin,
          tl && tl.startDelayMin
        );
        for (const src of candidates) {
          if (src && typeof src === 'object') return src;
        }
        return null;
      }
      const delaySrc = _resolveDelaySrc_();
      const schedDayForTimeline = rally.schedule && rally.schedule.days && rally.schedule.days[dayKey] ? rally.schedule.days[dayKey] : null;
      const schedDayTl = (schedDayForTimeline && schedDayForTimeline.timeline) ? schedDayForTimeline.timeline : null;
      const carsSrcR1 = (schedDayTl && (schedDayTl.carsEstimate || schedDayTl.cars || schedDayTl.carCounts || schedDayTl.carsByGroup))
        || (dayTl && (dayTl.carsEstimate || dayTl.cars || dayTl.carCounts || dayTl.carsByGroup))
        || (tl && (tl.carsEstimate || tl.cars || tl.carCounts || tl.carsByGroup))
        || null;
      const carsSrcR2 = (schedDayTl && (schedDayTl.carsEstimateR2 || schedDayTl.carsR2 || schedDayTl.route2CarsEstimate || schedDayTl.route2Cars))
        || (dayTl && (dayTl.carsEstimateR2 || dayTl.carsR2 || dayTl.route2CarsEstimate || dayTl.route2Cars))
        || (tl && (tl.carsEstimateR2 || tl.carsR2 || tl.route2CarsEstimate || tl.route2Cars))
        || null;
      const carsSrc  = carsSrcR1;

      // Always run SG mapping so Route 2 can display in-memory Route 1
      // delays even when timeline.days[dayKey] is not found in the store shape.
      const map = { '1':'SG1', '2':'SG2', '3':'SG3', '4':'SG4' };
      Object.keys(map).forEach(k=>{
        const g = map[k];
        let rawDelay = _pickSgVal_(delaySrc, k, g);
        if (rawDelay == null && isRoute2CompareMode()) rawDelay = recallStartDelay_(g);
        if (rawDelay != null) {
          const d = Number(rawDelay);
          if (Number.isFinite(d) && d >= 0) {
            groupMeta[g].delayMin = Math.max(0, Math.min(999, Math.round(d)));
            rememberStartDelay_(g, groupMeta[g].delayMin);
          }
        }
        const rawCars = _pickSgVal_(carsSrc, k, g);
        if (rawCars != null) {
          const c = Number(rawCars);
          if (Number.isFinite(c) && c >= 0) {
            const cv = Math.max(0, Math.min(99, Math.round(c)));
            groupMeta[g].cars = cv;
            groupMeta[g].carsR1 = cv;
            if (!Number.isFinite(Number(groupMeta[g].carsR2))) groupMeta[g].carsR2 = cv;
          }
        }
        const rawCarsR2 = _pickSgVal_(carsSrcR2, k, g);
        if (rawCarsR2 != null) {
          const c2 = Number(rawCarsR2);
          if (Number.isFinite(c2) && c2 >= 0) {
            groupMeta[g].carsR2 = Math.max(0, Math.min(99, Math.round(c2)));
          }
        }
      });

      // v0.90 ensure widget-owned UI always refreshes after applying external state
      try{ buildDelayCarsRows(); }catch(e){}// B) Shared SG max speeds -> display only (labels). Timing uses schedule snapshot row speeds.

      // C) Schedule rows -> hostRows (route-aware from v1.32; fallback to old day.rows)
      const schedDay = rally.schedule && rally.schedule.days && rally.schedule.days[dayKey] ? rally.schedule.days[dayKey] : null;
      const schedRoute = schedDay && schedDay.routes && schedDay.routes[routeKey] ? schedDay.routes[routeKey] : null;
      const schedSrc = schedRoute || schedDay;
      const sched = schedSrc && schedSrc.rows;
      if (Array.isArray(sched)) {
        hostRows = sched.map(r => ({
  id: r.id,
  rowNo: r.rowNo,
  type: r.type,
  dist: Number(r.dist),
  distKm: Number(r.dist),
  label: (r.label != null ? r.label : r.type),
  instruction: r.instr || '',
  instr: r.instr || '',
  // per-row speeds for timing engine: prefer rowSpeedsById, else per-row sgSpeeds
  speeds: (function(){
    const byId = schedSrc && schedSrc.rowSpeedsById;
    const src = (byId && r.id && byId[r.id]) ? byId[r.id] : (r.sgSpeeds || r.speeds || null);
    if (!src) return null;
    // normalise to SG keys
    return {
      SG1: (src.SG1!=null?src.SG1:src['1']),
      SG2: (src.SG2!=null?src.SG2:src['2']),
      SG3: (src.SG3!=null?src.SG3:src['3']),
      SG4: (src.SG4!=null?src.SG4:src['4'])
    };
  })(),
  // added time seconds (one-leg only): allow atSec, or atSecBySg with numeric keys
  atSec: (r.atSec != null ? Number(r.atSec) : null),
  atSecBySg: (r.atSecBySg || null),
  atLabel: (r.atLabel != null ? String(r.atLabel) : '')
}));
        hostRows = sanitizeRowsByDist_(hostRows);
        buildFocusSelect();
        updateFocusSummary();
        if(!_booting){ renderTimeline(); }
      }

      const speeds = rally.shared && rally.shared.sg && rally.shared.sg.speeds;
      if (speeds) {
        const map = { '1':'SG1', '2':'SG2', '3':'SG3', '4':'SG4' };
        Object.keys(map).forEach(k=>{
          const clamped = clampSpeed6_120(speeds[k]);
          if (clamped != null) displaySpeedByGroup[map[k]] = clamped;
        });
      }
      try{ syncIntervalFromAdmin(); }catch(e){}
    }
    // ----


    let hostRows = []; // schedule snapshot from host
    let focusRows = []; // Route 2 compare uses a combined R1/R2 instruction focus list
    let hasAnyTimes = false; // true if any row carries real times

    // DOM
    const delayTableBody = q('delayTableBody');
    const focusSelect    = q('focusRowSelect');
    const focusInstr     = q('focusInstruction');
    const rowSummary     = q('rowSummary');
    const gapSummary     = q('gapSummary');
    const svg            = q('timelineSvg');
    const btnPrev        = q('timelinePrevBtn');
    const btnNext        = q('timelineNextBtn');

    // --- Utilities ---
    function clampInt(n, lo, hi){
      n = Number.isFinite(+n) ? Math.trunc(+n) : lo;
      if (n < lo) n = lo;
      if (n > hi) n = hi;
      return n;
    }
function sanitizeRowsByDist_(rows){
  // Ensure distKm is numeric + non-decreasing to avoid NaN/negative SVG positions.
  // Strategy: invalid dist -> previous valid (or 0 for first); enforce monotonic non-decreasing.
  if (!Array.isArray(rows)) return [];
  let last = 0;
  return rows.map((r, i)=>{
    const out = r || {};
    let d = Number(out.distKm);
    if (!Number.isFinite(d)) d = Number(out.dist);
    if (!Number.isFinite(d)) d = last;
    if (!Number.isFinite(d)) d = 0;
    if (i === 0 && d < 0) d = 0;
    if (d < last) d = last;
    out.distKm = d;
    out.dist = d;
    last = d;
    return out;
  });
}

function _markerRowsForRoute_(routeNo){
  // In Route 2 comparison view, read Route 1/2 rows for top marker rows.
  try{
    const rn = String(Number(routeNo) === 2 ? 2 : 1);
    if (String(routeKey || '1') === rn && Array.isArray(hostRows) && hostRows.length){
      return hostRows;
    }
    const td = readTdRallies();
    const rally = resolveRallyObj(td);
    const schedDay = rally && rally.schedule && rally.schedule.days && rally.schedule.days[dayKey] ? rally.schedule.days[dayKey] : null;
    const src = schedDay && schedDay.routes && schedDay.routes[rn] ? schedDay.routes[rn] : null;
    const rows = src && Array.isArray(src.rows) ? src.rows : [];
    const mapped = sanitizeRowsByDist_(rows.map(r => ({
      id: r.id,
      rowNo: r.rowNo,
      idx: r.idx,
      type: r.type,
      dist: Number(r.dist),
      distKm: Number(r.dist),
      label: (r.label != null ? r.label : r.type),
      instruction: r.instr || r.instruction || '',
      instr: r.instr || r.instruction || '',
      times: r.times || {},
      speeds: (function(){
        const byId = src && src.rowSpeedsById;
        const raw = (byId && r.id && byId[r.id]) ? byId[r.id] : (r.sgSpeeds || r.speeds || null);
        if (!raw) return null;
        return {
          SG1: (raw.SG1!=null?raw.SG1:raw['1']),
          SG2: (raw.SG2!=null?raw.SG2:raw['2']),
          SG3: (raw.SG3!=null?raw.SG3:raw['3']),
          SG4: (raw.SG4!=null?raw.SG4:raw['4'])
        };
      })(),
      atSec: r.atSec,
      atSecBySg: r.atSecBySg,
      atLabel: (r.atLabel != null ? String(r.atLabel) : '')
    })));
    // v1.56: compare route rows may not carry computed times in TD_RALLIES.
    // Compute display-only times per route from that route's own row speeds.
    // This keeps arrival labels independent of the active lane engine.
    try{
      const hasTimes = mapped.some(rr => rr && rr.times && Object.values(rr.times).some(v => String(v||'').trim() !== ''));
      if (!hasTimes) _computeTimesForRowsArray_(mapped);
    }catch(_e){}
    return mapped;
  }catch(_e){ return []; }
}

function _isInstructionFocusRow_(r){
  if (!r) return false;
  const d = Number.isFinite(Number(r.distKm)) ? Number(r.distKm) : Number(r.dist);
  return Number.isFinite(d);
}

function _buildCombinedFocusRows_(){
  // In Route 2 comparison, focus steps through all instruction rows from both routes, sorted by distance.
  if (!isRoute2CompareMode()) {
    focusRows = Array.isArray(hostRows) ? hostRows : [];
    return focusRows;
  }
  const r1 = _markerRowsForRoute_(1).filter(_isInstructionFocusRow_).map((r, i)=>Object.assign({}, r, { _focusRoute:'1', _sourceIndex:i }));
  const r2 = _markerRowsForRoute_(2).filter(_isInstructionFocusRow_).map((r, i)=>Object.assign({}, r, { _focusRoute:'2', _sourceIndex:i }));
  const all = r1.concat(r2).filter(r => Number.isFinite(Number(r.distKm)) || Number.isFinite(Number(r.dist)));
  all.sort((a,b)=>{
    const da = Number.isFinite(Number(a.distKm)) ? Number(a.distKm) : Number(a.dist);
    const db = Number.isFinite(Number(b.distKm)) ? Number(b.distKm) : Number(b.dist);
    if (Math.abs(da-db) > 1e-9) return da-db;
    return String(a._focusRoute||'1').localeCompare(String(b._focusRoute||'1'));
  });

  const merged = [];
  all.forEach(r=>{
    const d = Number.isFinite(Number(r.distKm)) ? Number(r.distKm) : Number(r.dist);
    const last = merged[merged.length-1];
    // v1.57: do not merge unrelated route rows just because they share a distance.
    // Merge only when the focused waypoint identity also matches; otherwise keep
    // adjacent same-distance entries route-owned so arrival labels can be filtered.
    const thisKey = `${String(r.type||'').toUpperCase()}|${String(displayLabel(r)||'').trim().toUpperCase()}`;
    const lastKey = last ? String(last._focusMergeKey || '') : '';
    if (last && Math.abs(Number(last.distKm)-d) < 1e-6 && lastKey === thisKey){
      last._routes = last._routes || [];
      last._routes.push(r);
      const parts = last._routes.map(x => `R${x._focusRoute} ${displayLabel(x)}`.trim()).filter(Boolean);
      last.label = parts.join(' / ');
      last.instr = last._routes.map(x => String(x.instr || x.instruction || '').trim()).filter(Boolean).join(' | ');
      last.instruction = last.instr;
    } else {
      const copy = Object.assign({}, r, { dist:d, distKm:d, _routes:[r], _focusMergeKey:thisKey });
      copy.label = `R${r._focusRoute} ${displayLabel(r)}`.trim();
      merged.push(copy);
    }
  });
  focusRows = merged;
  return focusRows;
}

function _getHostIndexForFocus_(){
  // Keep the calculation lane on the active route. If the focused waypoint is not on the active route, use the nearest existing active-route row only as a render anchor.
  const rows = Array.isArray(hostRows) ? hostRows : [];
  if (!rows.length) return 0;
  const f = getFocusRow();
  if (!f) return getFocusIdx();
  const active = String(routeKey || '1');
  const owned = Array.isArray(f._routes) ? f._routes.find(r => String(r._focusRoute) === active) : (String(f._focusRoute||active) === active ? f : null);
  if (owned && owned.id != null) {
    const byId = rows.findIndex(r => r && r.id === owned.id);
    if (byId >= 0) return byId;
  }
  const fd = Number(f.distKm);
  if (Number.isFinite(fd)) {
    let best = 0, bestDelta = Infinity;
    rows.forEach((r,i)=>{
      const d = Math.abs(Number(r.distKm) - fd);
      if (Number.isFinite(d) && d < bestDelta){ bestDelta = d; best = i; }
    });
    return best;
  }
  return getFocusIdx();
}

function syncIntervalFromAdmin(){
  // Admin-owned "incMin" (minutes between cars) -> applies to all groups for spacing.
  // Widget is read-only; this only updates in-memory intervalMin used for rendering car gaps.
  const td = readTdRallies();
  const rally = resolveRallyObj(td);
  if (!rally) return;
  const days = rally.admin && rally.admin.days;
  if (!days) return;
  const dkNum = String(parseInt(dayKey, 10));
  const dayObj = days[dayKey] || days[dkNum];
  const inc = Number(dayObj && dayObj.incMin);
  if (!Number.isFinite(inc)) return;
  const v = Math.max(1, Math.min(99, Math.round(inc)));
  ALL_GROUPS.forEach(g=>{ groupMeta[g].intervalMin = v; });
}

    function displayType(type){
      const t = (type != null) ? String(type).trim() : '';
      if (!t) return '';
      if (t === 'INSTRUCTION') return 'INST';
      return t;
    }

    function displayLabel(row){
      const r = row || {};
      const label = String(r.label || '').trim();
      if (label) return label;
      return displayType(r.type) || String(r.type || '').trim();
    }
    function getRowLabel(r){
      const km = (typeof r.dist === 'number') ? r.dist.toFixed(1) : '—';
      const rn = (r && (r.rowNo != null)) ? r.rowNo : (r && (r.idx != null) ? r.idx : '');
      const typeTxt = displayLabel(r) || '—';

      const instrFull = (r && r.instr != null) ? String(r.instr).trim() : '';
      let snippet = '';
      if (instrFull){
        const words = instrFull.split(/\s+/).filter(Boolean);
        snippet = words.slice(0, 5).join(' ');
        if (words.length > 5) snippet += '…';
      }

      return `${rn} - ${km} - ${typeTxt}${snippet ? ' - ' + snippet : ''}`.trim();
    }
    function parseTime(str){
      const s = String(str || '').trim();
      const parts = s.split(':').map(n => Number(n));
      const hh = Number.isFinite(parts[0]) ? parts[0] : 0;
      const mm = Number.isFinite(parts[1]) ? parts[1] : 0;
      const ss = Number.isFinite(parts[2]) ? parts[2] : 0;
      return (hh * 60) + mm + (ss / 60);
    }
    function formatTime(totalMinutes){
      let totalSec = Math.round((Number(totalMinutes) || 0) * 60);
      if (!Number.isFinite(totalSec)) totalSec = 0;
      if (totalSec < 0) totalSec = 0;
      const hh = Math.floor(totalSec / 3600);
      const rem = totalSec % 3600;
      const mm = Math.floor(rem / 60);
      const ss = rem % 60;
      return String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
    }

    function setDayStartClock(str){
      _dayStartStr = String(str || '').trim() || '00:00:00';
      _dayStartMin = parseTime(_dayStartStr);
      renderTimeline();
      updateFocusSummary();
    }

    function formatClock(elapsedMinutes){
      return formatTime(_dayStartMin + (Number(elapsedMinutes) || 0));
    }

    // Initialize day start clock now that parseTime exists
    _dayStartMin = parseTime(_dayStartStr);

    // --- Delay / Cars table ---
    function buildDelayCarsRows(){
      // Instruction-only mode: if we have no timing data, keep UI but disable time-dependent controls.
      if (!delayTableBody) return;
      delayTableBody.innerHTML = '';
      const delayLocked = isDelayLocked();
      const route2Compare = isRoute2CompareMode();
      try{ applyDelayLockUi(); }catch(_e){}

      try{
        const table = delayTableBody.closest('table');
        if (table) table.classList.toggle('tlw-route2-cars', route2Compare);
        const headRow = table ? table.querySelector('thead tr') : null;
        if (headRow) {
          headRow.innerHTML = route2Compare
            ? '<th>Delay</th><th>Cars R1</th><th>Cars R2</th>'
            : '<th>Group</th><th>Delay (min)</th><th>Cars</th>';
        }
      }catch(_e){}

      getEnabledGroups().forEach(g => {
        const tr = document.createElement('tr');
        tr.dataset.sg = g;
        tr.title = g;

        if (!route2Compare) {
          const tdG = document.createElement('td');
          tdG.style.fontWeight = '600';
          tdG.style.fontSize = '12px';
          tdG.textContent = g + (Number.isFinite(groupMeta[g].allocCars) ? ` - ${groupMeta[g].allocCars}` : '');
          tr.appendChild(tdG);
        }

        const tdD = document.createElement('td');
        const inpD = document.createElement('input');
        inpD.className = 'tlw-num tlw-delay-input';
        inpD.type = 'number';
        inpD.min = '0';
        inpD.max = '999';
        inpD.step = '1';
        inpD.value = String(groupMeta[g].delayMin ?? 0);
        if (delayLocked || route2Compare) inpD.disabled = true;
        const onDelay = () => {
          groupMeta[g].delayMin = clampInt(inpD.value, 0, 999);
          rememberStartDelay_(g, groupMeta[g].delayMin);
          inpD.value = String(groupMeta[g].delayMin);
          renderTimeline();
          updateFocusSummary();
        };
        inpD.addEventListener('input', onDelay);
        // v1.16: persistence is host-owned (no widget writes)
        // inpD.addEventListener('blur', schedulePersistStartDelays);
        tdD.appendChild(inpD);
        tr.appendChild(tdD);

        if (route2Compare) {
          if (!Number.isFinite(Number(groupMeta[g].carsR1))) groupMeta[g].carsR1 = groupMeta[g].cars ?? 5;
          if (!Number.isFinite(Number(groupMeta[g].carsR2))) groupMeta[g].carsR2 = groupMeta[g].cars ?? 5;
          groupMeta[g].carsR1 = clampInt(groupMeta[g].carsR1, 1, 99);
          groupMeta[g].carsR2 = clampInt(groupMeta[g].carsR2, 1, 99);

          const tdC1 = document.createElement('td');
          const inpC1 = document.createElement('input');
          inpC1.className = 'tlw-num tlw-cars-input tlw-cars-r1-input';
          inpC1.type = 'number';
          inpC1.min = '1';
          inpC1.max = '99';
          inpC1.step = '1';
          inpC1.value = String(groupMeta[g].carsR1 ?? 5);
          const onCarsR1 = () => {
            groupMeta[g].carsR1 = clampInt(inpC1.value, 1, 99);
            inpC1.value = String(groupMeta[g].carsR1);
            persistRouteCarsToStore_(1, g);
            renderTimeline();
            updateFocusSummary();
          };
          inpC1.addEventListener('input', onCarsR1);
          tdC1.appendChild(inpC1);
          tr.appendChild(tdC1);

          const tdC2 = document.createElement('td');
          const inpC2 = document.createElement('input');
          inpC2.className = 'tlw-num tlw-cars-input tlw-cars-r2-input';
          inpC2.type = 'number';
          inpC2.min = '1';
          inpC2.max = '99';
          inpC2.step = '1';
          inpC2.value = String(groupMeta[g].carsR2 ?? groupMeta[g].cars ?? 5);
          const onCarsR2 = () => {
            groupMeta[g].carsR2 = clampInt(inpC2.value, 1, 99);
            inpC2.value = String(groupMeta[g].carsR2);
            // Route 2 cars are stored separately from Route 1 cars.
            persistRouteCarsToStore_(2, g);
            renderTimeline();
            updateFocusSummary();
          };
          inpC2.addEventListener('input', onCarsR2);
          tdC2.appendChild(inpC2);
          tr.appendChild(tdC2);
        } else {
          const tdC = document.createElement('td');
          const inpC = document.createElement('input');
          inpC.className = 'tlw-num tlw-cars-input';
          inpC.type = 'number';
          inpC.min = '0';
          inpC.max = '99';
          inpC.step = '1';
          inpC.value = String(groupMeta[g].cars ?? 5);
          const onCars = () => {
            groupMeta[g].cars = clampInt(inpC.value, 0, 99);
            groupMeta[g].carsR1 = groupMeta[g].cars;
            groupMeta[g].carsR2 = groupMeta[g].cars;
            inpC.value = String(groupMeta[g].cars);
            persistRouteCarsToStore_(1, g);
            renderTimeline();
            updateFocusSummary();
          };
          inpC.addEventListener('input', onCars);
          tdC.appendChild(inpC);
          tr.appendChild(tdC);
        }

        delayTableBody.appendChild(tr);
      });
    }

    // --- Focus list + summary ---
    function buildFocusSelect(){
      if (!focusSelect) return;
      focusSelect.innerHTML = '';

      const rows = _buildCombinedFocusRows_();
      if (!rows.length){
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— no schedule loaded —';
        focusSelect.appendChild(opt);
        focusSelect.disabled = true;
        if (focusInstr) focusInstr.textContent = '';
        if (rowSummary) rowSummary.textContent = '';
        if (gapSummary) gapSummary.textContent = '';
        return;
      }

      focusSelect.disabled = false;
      rows.forEach((r, i)=>{
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = getRowLabel(r);
        focusSelect.appendChild(opt);
      });
      focusSelect.value = '0';
    }

    function updateFocusSummary(){
      const rows = Array.isArray(focusRows) && focusRows.length ? focusRows : _buildCombinedFocusRows_();
      if (!rows.length || !focusSelect || focusSelect.disabled) return;
      const idx = clampInt(focusSelect.value, 0, rows.length-1);
      const row = rows[idx] || {};
      if (focusInstr) {
        const dt = displayLabel(row);
        const instr = (row.instr != null) ? String(row.instr).trim() : '';
        if (dt) {
          focusInstr.textContent = instr ? `${dt} ${instr}` : dt;
        } else {
          focusInstr.textContent = instr;
        }
      }
      if (!rowSummary) return;

      const km = (typeof row.dist === 'number') ? row.dist.toFixed(1) : '—';
      const lines = [];
      lines.push(`Selected point – ${km} km`);
      lines.push(`ETAs at selected point`);
      getEnabledGroups().forEach(g=>{
        const t = row.times && row.times[g] ? row.times[g] : '—';
        const d = groupMeta[g].delayMin ? ` (+${groupMeta[g].delayMin}m)` : '';
        lines.push(`${g}: ${t}${d}`);
      });
      rowSummary.textContent = lines.join('\n');
    }

    // --- Renderer core (from v0.81, adapted to scoped DOM) ---
    const speedKmhByGroup = { SG1: 90, SG2: 80, SG3: 70, SG4: 60 };
    // Display-only max speed per group (from Admin stub / TD_RALLIES); does NOT drive timing maths
    const displaySpeedByGroup = { SG1: 90, SG2: 80, SG3: 70, SG4: 60 };

    function updateLaneNote(){
      const el = q('laneNote');
      if (!el) return;
      const parts = getEnabledGroups().map(g=>{
        const sp = displaySpeedByGroup[g];
        return (Number.isFinite(sp) && sp>0) ? `${g} (${sp})` : g;
      });
      el.textContent = parts.join(', ');
    }



    let elasticEnabled = recallApplyStartDelays_();
    let showCars = true;
    let timeOffsetMin = 0;

    let groupStats = {};

    let windowCenterKm = NaN;
    let scannerPosKm = NaN;
    let _lastFocusIdxForWindow = null;
    const windowWidthKm = 30;
    const scannerConfig = { enabled: false, min: 0, max: 0 };

    let _rendererWired = false;

    function getFocusIdx(){
      const rows = Array.isArray(focusRows) && focusRows.length ? focusRows : _buildCombinedFocusRows_();
      if (!rows.length) return 0;
      if (!focusSelect || focusSelect.disabled) return 0;
      return clampInt(focusSelect.value, 0, rows.length - 1);
    }
    function getFocusRow(){
      const rows = Array.isArray(focusRows) && focusRows.length ? focusRows : _buildCombinedFocusRows_();
      if (!rows.length) return null;
      let i = getFocusIdx();
      if (!Number.isFinite(i)) i = 0;
      i = Math.max(0, Math.min(rows.length - 1, i));
      return rows[i] || rows[0] || null;
    }
    function _getFocusedRouteRow_(routeNo){
      const rn = String(Number(routeNo) === 2 ? 2 : 1);
      const f = getFocusRow();
      if (!f) return null;
      if (Array.isArray(f._routes)) {
        return f._routes.find(r => String(r && r._focusRoute) === rn) || null;
      }
      return String(f._focusRoute || routeKey || '1') === rn ? f : null;
    }

    function _speedFromRowForGroup_(row, group){
      if (!row || !row.speeds) return null;
      const v = Number(row.speeds[group]);
      return Number.isFinite(v) && v > 0 ? v : null;
    }

    function getSpeedForGroupAtFocusRoute(group, routeNo){
      // v1.52: display-only SG labels are route-owned. If the focused waypoint
      // does not belong to that route, that route does not show/update a speed.
      const owned = _getFocusedRouteRow_(routeNo);
      if (!owned) return null;
      const rowSpeed = _speedFromRowForGroup_(owned, group);
      if (rowSpeed != null) return rowSpeed;
      const displaySpeed = Number(displaySpeedByGroup[group]);
      return Number.isFinite(displaySpeed) && displaySpeed > 0 ? displaySpeed : null;
    }

    function _startDelayByGroupForDisplay_(routeNo){
      const enabledOrder = getEnabledGroups().slice().reverse().filter(g => _carsForRouteGroup_(routeNo, g) > 0);
      const startDelayByGroup = {};
      let cursorMin = 0;
      enabledOrder.forEach(g=>{
        startDelayByGroup[g] = cursorMin;
        cursorMin += _groupReleaseSpanMin_(routeNo, g);
      });
      if (elasticEnabled){
        enabledOrder.forEach(g=>{ startDelayByGroup[g] += clampInt(groupMeta[g]?.delayMin ?? 0, 0, 999); });
      }
      return startDelayByGroup;
    }

    function getArrivalMinForFocusRoute(group, routeNo){
      // v1.54: arrival labels are route-owned. No interpolation; if the focused
      // waypoint does not exist for that route, no arrival time is drawn for it.
      const owned = _getFocusedRouteRow_(routeNo);
      if (!owned || !owned.times) return null;
      const raw = owned.times[group];
      if (raw == null || String(raw).trim() === '') return null;
      const base = parseTime(raw);
      if (!Number.isFinite(base)) return null;
      const delays = _startDelayByGroupForDisplay_(routeNo);
      return base + (delays[group] || 0) + _routeLaneOffsetMin_(routeNo, group);
    }

    function getSpeedForGroupAtFocus(group){
      const fallback = speedKmhByGroup[group] || 60;
      // Existing lane engine remains active-route based for this bake.
      const rows = Array.isArray(hostRows) ? hostRows : [];
      const row = rows.length ? rows[_getHostIndexForFocus_()] : null;
      const rowSpeed = _speedFromRowForGroup_(row, group);
      return rowSpeed != null ? rowSpeed : fallback;
    }

    function computeGroupStats(){
      groupStats = {};
      getEnabledGroups().forEach(g => {
        const speedKmh = getSpeedForGroupAtFocus(g);
        let vKmPerMin = speedKmh / 60;
        if (!Number.isFinite(vKmPerMin) || vKmPerMin <= 0) vKmPerMin = 1;

        const meta = groupMeta[g] || {};
        const cars = meta.cars || 5;
        const intervalMin = meta.intervalMin || 1;

        let lengthKm = Math.max(0, (cars - 1)) * intervalMin * vKmPerMin;
        if (!Number.isFinite(lengthKm) || lengthKm < 0) lengthKm = 0;

        groupStats[g] = { avgKmPerMin: vKmPerMin, trainLengthKm: lengthKm, cars, intervalMin };
      });
    }


// --- Schedule timing engine (dist + per-row speeds + one-leg ADDED_TIME) ---
function _getAddedSecForRow(row, sg){
  if (!row) return 0;
  // Prefer per-SG if present, else fall back to single atSec applied to all groups.
  if (row.atSecBySg) {
    const key = (sg === 'SG1') ? '1' : (sg === 'SG2') ? '2' : (sg === 'SG3') ? '3' : '4';
    const v = row.atSecBySg[key];
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  const n = Number(row.atSec);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function _getSpeedForRow(row, sg){
  if (!row || !row.speeds) return null;
  const v = Number(row.speeds[sg]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function _computeTimesForRowsArray_(rows){
  // v1.55: route-specific display timing helper. Mutates the supplied row array only.
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const sgs = ['SG1','SG2','SG3','SG4'];
  for (let i=0;i<rows.length;i++){
    const d = Number(rows[i].distKm);
    if (!Number.isFinite(d)) return false;
    if (i>0 && d < Number(rows[i-1].distKm) - 1e-9) return false;
  }
  if (!sgs.every(sg => _getSpeedForRow(rows[0], sg) != null)) return false;
  const tSec = { SG1:0, SG2:0, SG3:0, SG4:0 };
  rows[0].times = rows[0].times || {};
  sgs.forEach(sg => { rows[0].times[sg] = '00:00:00'; });
  for (let i=1;i<rows.length;i++){
    const prev = rows[i-1];
    const cur  = rows[i];
    const dd = Number(cur.distKm) - Number(prev.distKm);
    cur.times = cur.times || {};
    for (const sg of sgs){
      const sp = _getSpeedForRow(prev, sg);
      if (sp == null || sp <= 0) return false;
      const legSec = Math.round((dd / sp) * 3600);
      const addSec = (String(prev.type||'') === 'ADDED_TIME') ? _getAddedSecForRow(prev, sg) : 0;
      tSec[sg] = Math.max(0, tSec[sg] + Math.max(0, legSec) + addSec);
      cur.times[sg] = formatTime(tSec[sg] / 60);
    }
  }
  return true;
}

function _computeRowTimesFromInputs(){
  // Computes row.times[SGn] for all rows using:
  // time[i] = time[i-1] + legTime(prevRowSpeed, dist[i]-dist[i-1]) + (addedTimeOnPrevRow)
  // Added time applies ONE-LEG ONLY (from AddedTime row to next row).
  // START_STC rows are ignored for timeline timing (treated as markers only).
  const rows = Array.isArray(hostRows) ? hostRows : [];
  if (rows.length === 0) { hasAnyTimes = false; return; }

  const sgs = ['SG1','SG2','SG3','SG4'];

  // Validate distances & monotonicity
  for (let i=0;i<rows.length;i++){
    const d = Number(rows[i].distKm);
    if (!Number.isFinite(d)) { hasAnyTimes = false; return; }
    if (i>0 && d < Number(rows[i-1].distKm) - 1e-9) { hasAnyTimes = false; return; }
  }

  // We need a usable speed on row 0 for each SG (departure speed).
  const speed0Ok = sgs.every(sg => _getSpeedForRow(rows[0], sg) != null);
  if (!speed0Ok) { hasAnyTimes = false; return; }

  // running seconds per SG
  const tSec = { SG1:0, SG2:0, SG3:0, SG4:0 };

  // init row 0
  rows[0].times = rows[0].times || {};
  sgs.forEach(sg => { rows[0].times[sg] = '00:00:00'; });

  for (let i=1;i<rows.length;i++){
    const prev = rows[i-1];
    const cur  = rows[i];

    const d0 = Number(prev.distKm);
    const d1 = Number(cur.distKm);
    const dd = d1 - d0;

    cur.times = cur.times || {};

    sgs.forEach(sg=>{
      const sp = _getSpeedForRow(prev, sg);
      if (sp == null || sp <= 0) { hasAnyTimes = false; return; }

      // leg seconds from prev->cur using prev speed
      const legSec = Math.round((dd / sp) * 3600);

      // one-leg added time from prev row if it is ADDED_TIME
      const addSec = (String(prev.type||'') === 'ADDED_TIME') ? _getAddedSecForRow(prev, sg) : 0;

      tSec[sg] = Math.max(0, tSec[sg] + Math.max(0, legSec) + addSec);
      cur.times[sg] = formatTime(tSec[sg] / 60);
    });
  }

  hasAnyTimes = true;
}
// ---

    function _routeIndexForFocus_(routeNo, rows){
      rows = Array.isArray(rows) ? rows : [];
      if (!rows.length) return 0;
      const owned = _getFocusedRouteRow_(routeNo);
      if (owned){
        const si = Number(owned._sourceIndex);
        if (Number.isInteger(si) && si >= 0 && si < rows.length) return si;
        if (owned.id != null){
          const byId = rows.findIndex(r => r && r.id === owned.id);
          if (byId >= 0) return byId;
        }
      }
      const f = getFocusRow();
      const fd = f ? Number(f.distKm) : NaN;
      if (Number.isFinite(fd)){
        let best = 0, bestDelta = Infinity;
        rows.forEach((r,i)=>{
          const d = Math.abs(Number(r && r.distKm) - fd);
          if (Number.isFinite(d) && d < bestDelta){ bestDelta = d; best = i; }
        });
        return best;
      }
      return 0;
    }

    function _carsForRouteGroup_(routeNo, g){
      const meta = groupMeta[g] || {};
      if (Number(routeNo) === 1 && Number.isFinite(Number(meta.carsR1))) return clampInt(meta.carsR1, isRoute2CompareMode() ? 1 : 0, 99);
      if (Number(routeNo) === 2 && Number.isFinite(Number(meta.carsR2))) return clampInt(meta.carsR2, isRoute2CompareMode() ? 1 : 0, 99);
      return clampInt(meta.cars ?? 0, 0, 99);
    }

    function _routeLaneIntervalMin_(routeNo, g){
      const base = Math.max(0, Number(groupMeta[g]?.intervalMin ?? 1) || 1);
      return isRoute2CompareMode() ? base * 2 : base;
    }

    function _combinedCarsForGroup_(g){
      const meta = groupMeta[g] || {};
      const r1Known = Number.isFinite(Number(meta.carsR1));
      const r2Known = Number.isFinite(Number(meta.carsR2));
      if (r1Known || r2Known) {
        return clampInt((r1Known ? clampInt(meta.carsR1, 1, 99) : 0) + (r2Known ? clampInt(meta.carsR2, 1, 99) : 0), 1, 198);
      }
      return clampInt(meta.cars ?? meta.allocCars ?? 0, 0, 99);
    }

    function _groupReleaseSpanMin_(routeNo, g){
      const base = Math.max(0, Number(groupMeta[g]?.intervalMin ?? 1) || 1);
      const cars = isRoute2CompareMode() ? _combinedCarsForGroup_(g) : _carsForRouteGroup_(routeNo, g);
      return cars * base;
    }

    function _routeLaneOffsetMin_(routeNo, g){
      if (!isRoute2CompareMode()) return 0;
      const carsInLane = _carsForRouteGroup_(routeNo, g);
      if (!carsInLane) return 0;
      const base = Math.max(0, Number(groupMeta[g]?.intervalMin ?? 1) || 1);
      const enabledOrder = getEnabledGroups().slice().reverse(); // slowest -> fastest, same as release order
      let priorCars = 0;
      for (const eg of enabledOrder){
        if (eg === g) break;
        priorCars += _combinedCarsForGroup_(eg);
      }
      const firstRallyNo = priorCars + 1;
      const firstRoute = (firstRallyNo % 2 === 1) ? 1 : 2;
      return Number(routeNo) === firstRoute ? 0 : base;
    }

    function _computeGroupStatsForRowsAtIndex_(rows, rowIndex, routeNo){
      const statsOut = {};
      rows = Array.isArray(rows) ? rows : [];
      const row = rows.length ? rows[Math.max(0, Math.min(rows.length - 1, rowIndex || 0))] : null;
      getEnabledGroups().forEach(g => {
        let speedKmh = _getSpeedForRow(row, g);
        if (speedKmh == null) speedKmh = speedKmhByGroup[g] || 60;
        let vKmPerMin = speedKmh / 60;
        if (!Number.isFinite(vKmPerMin) || vKmPerMin <= 0) vKmPerMin = 1;
        const meta = groupMeta[g] || {};
        const cars = _carsForRouteGroup_(routeNo, g) || 5;
        const intervalMin = _routeLaneIntervalMin_(routeNo, g);
        let lengthKm = Math.max(0, (cars - 1)) * intervalMin * vKmPerMin;
        if (!Number.isFinite(lengthKm) || lengthKm < 0) lengthKm = 0;
        statsOut[g] = { avgKmPerMin: vKmPerMin, trainLengthKm: lengthKm, cars, intervalMin };
      });
      return statsOut;
    }


    function _frontStateAtTime_(rows, sg, scanMin, startDelayMin, routeNo){
      // Convert scan time -> distance by walking route row-time windows.
      // AT rows add SG-specific onward delay; during that row-time window the
      // front remains at the AT distance until the following segment begins.
      rows = Array.isArray(rows) ? rows : [];
      if (!rows.length) return { frontKm:0, speedKmh:(speedKmhByGroup[sg]||60), timeMin:scanMin, segmentIndex:0 };
      const firstD = Number(rows[0].distKm);
      const lastD = Number(rows[rows.length - 1].distKm);
      const startDelay = Number(startDelayMin) || 0;
      const absAt = (r) => {
        const raw = r && r.times ? r.times[sg] : null;
        const base = parseTime(raw);
        return Number.isFinite(base) ? base + startDelay : NaN;
      };
      const distAt = (r, fallback) => {
        const d = Number(r && r.distKm);
        return Number.isFinite(d) ? d : fallback;
      };
      const speedAt = (r) => {
        const sp = _getSpeedForRow(r, sg);
        return (sp != null && sp > 0) ? sp : (speedKmhByGroup[sg] || 60);
      };

      if (!Number.isFinite(scanMin)) scanMin = absAt(rows[0]);
      const firstAbs = absAt(rows[0]);
      if (!Number.isFinite(firstAbs)) return { frontKm:Number.isFinite(firstD)?firstD:0, speedKmh:speedAt(rows[0]), timeMin:scanMin, segmentIndex:0 };
      if (scanMin <= firstAbs) return { frontKm:Number.isFinite(firstD)?firstD:0, speedKmh:speedAt(rows[0]), timeMin:scanMin, segmentIndex:0 };

      for (let i=0; i<rows.length-1; i++){
        const cur = rows[i];
        const next = rows[i+1];
        const arriveCur = absAt(cur);
        const arriveNext = absAt(next);
        if (!Number.isFinite(arriveCur) || !Number.isFinite(arriveNext)) continue;
        const holdSec = (String(cur.type||'') === 'ADDED_TIME') ? _getAddedSecForRow(cur, sg) : 0;
        const departCur = arriveCur + (holdSec / 60);
        const d0 = distAt(cur, 0);
        const d1 = distAt(next, d0);
        const sp = speedAt(cur);

        if (scanMin < departCur - 1e-9){
          return { frontKm:d0, speedKmh:sp, timeMin:scanMin, segmentIndex:i, holding:true };
        }
        if (scanMin <= arriveNext + 1e-9){
          const travelMin = Math.max(0, arriveNext - departCur);
          const ratio = travelMin > 1e-9 ? Math.max(0, Math.min(1, (scanMin - departCur) / travelMin)) : 1;
          return { frontKm:d0 + ((d1 - d0) * ratio), speedKmh:sp, timeMin:scanMin, segmentIndex:i, holding:false };
        }
      }
      return { frontKm:Number.isFinite(lastD)?lastD:0, speedKmh:speedAt(rows[rows.length-1]), timeMin:scanMin, segmentIndex:rows.length-1 };
    }

    function _laneStartDelayMap_(routeNo){
      const enabledOrder = getEnabledGroups().slice().reverse().filter(g => _carsForRouteGroup_(routeNo, g) > 0);
      const startDelayByGroup = {};
      let cursorMin = 0;
      enabledOrder.forEach(g=>{
        startDelayByGroup[g] = cursorMin;
        cursorMin += _groupReleaseSpanMin_(routeNo, g);
      });
      if (elasticEnabled){
        enabledOrder.forEach(g=>{ startDelayByGroup[g] += clampInt(groupMeta[g]?.delayMin ?? 0, 0, 999); });
      }
      return startDelayByGroup;
    }

    function _rowsHaveAnyTimes_(rows){
      return Array.isArray(rows) && rows.some(r => r && r.times && Object.values(r.times).some(v => String(v||'').trim() !== ''));
    }

    function _computePositionsForRowsAtIndex_(rows, rowIndex, statsByGroup, routeNo, sharedRefMin){
      rows = Array.isArray(rows) ? rows : [];
      if (!rows.length) return { row:null, positions:[], totalDistKm:0, viewMinKm:0, viewMaxKm:windowWidthKm, statsByGroup:statsByGroup||{} };
      rowIndex = Math.max(0, Math.min(rows.length - 1, Number.isFinite(Number(rowIndex)) ? Number(rowIndex) : 0));
      const row = rows[rowIndex];
      const totalDistKm = rows[rows.length - 1].distKm;
      const hasTimesHere = _rowsHaveAnyTimes_(rows);
      if (!hasTimesHere){
        const dist = Number.isFinite(row.distKm) ? row.distKm : 0;
        const total = Number.isFinite(totalDistKm) ? totalDistKm : dist;
        const positions = getEnabledGroups().map(g => {
          const len = (statsByGroup[g] && Number.isFinite(statsByGroup[g].trainLengthKm)) ? statsByGroup[g].trainLengthKm : 0;
          const startKm = Math.max(0, dist - len);
          return { group: g, timeMin: 0, frontKm: dist, startKm, endKm: dist };
        });
        return { row, positions, totalDistKm: total, viewMinKm: 0, viewMaxKm: Math.max(windowWidthKm, total), statsByGroup:statsByGroup||{} };
      }
      const startDelayByGroup = _laneStartDelayMap_(routeNo);
      const absTimes = getEnabledGroups().map(g => ({
        group: g,
        absMin: parseTime((row.times||{})[g]) + (startDelayByGroup[g] || 0) + _routeLaneOffsetMin_(routeNo, g)
      }));
      const finiteAbs = absTimes.map(t=>t.absMin).filter(Number.isFinite);
      // v1.78: labels keep each lane's true focus-arrival time, but X position
      // is rendered at the shared reference time (the first lane arriving at
      // the focused waypoint), then each lane independently back/forward-walks
      // through its own route segments.
      const fallbackRef = Number.isFinite(Number(sharedRefMin)) ? Number(sharedRefMin) : (finiteAbs.length ? Math.min.apply(null, finiteAbs) : 0);
      const positions = getEnabledGroups().map(g => {
        const startDelay = (startDelayByGroup[g] || 0) + _routeLaneOffsetMin_(routeNo, g);
        const abs = absTimes.find(x => x.group === g);
        const scanMin = fallbackRef + timeOffsetMin;
        const state = _frontStateAtTime_(rows, g, scanMin, startDelay, routeNo);
        let frontKm = state.frontKm;
        if (!Number.isFinite(frontKm)) frontKm = row.distKm;
        if (frontKm < 0) frontKm = 0;
        if (frontKm > totalDistKm) frontKm = totalDistKm;
        const stats = statsByGroup[g] || { avgKmPerMin:1, trainLengthKm:0, cars:_carsForRouteGroup_(routeNo,g), intervalMin:_routeLaneIntervalMin_(routeNo,g) };
        const localV = Math.max(0.0001, (Number(state.speedKmh) || 60) / 60);
        stats.avgKmPerMin = localV;
        stats.trainLengthKm = Math.max(0, ((stats.cars || 0) - 1) * (stats.intervalMin || 1) * localV);
        const lengthKm = stats.trainLengthKm || 0;
        let startKm = frontKm - lengthKm;
        if (startKm < 0) startKm = 0;
        return { group: g, timeMin: (abs && Number.isFinite(abs.absMin)) ? abs.absMin : scanMin, frontKm, startKm, endKm: frontKm, holding:!!state.holding };
      });
      let centreKm = windowCenterKm;
      if (!Number.isFinite(centreKm)) centreKm = row.distKm;
      const half = windowWidthKm / 2;
      let viewMinKm = centreKm - half;
      let viewMaxKm = centreKm + half;
      const total = rows[rows.length - 1].distKm;
      if (total <= windowWidthKm){ viewMinKm = 0; viewMaxKm = total; }
      else if (viewMinKm < 0){ viewMinKm = 0; viewMaxKm = windowWidthKm; }
      else if (viewMaxKm > total){ viewMaxKm = total; viewMinKm = total - windowWidthKm; }
      return { row, positions, totalDistKm, viewMinKm, viewMaxKm, statsByGroup:statsByGroup||{} };
    }

    function computePositionsForRow(rowIndex){
      const rows = hostRows;
      const row = rows[rowIndex];
      const totalDistKm = rows[rows.length - 1].distKm;
      if (!hasAnyTimes){
        const dist = Number.isFinite(row.distKm) ? row.distKm : 0;
        const total = Number.isFinite(totalDistKm) ? totalDistKm : dist;
        const positions = getEnabledGroups().map(g => {
          const len = (groupStats[g] && Number.isFinite(groupStats[g].trainLengthKm)) ? groupStats[g].trainLengthKm : 0;
          const startKm = Math.max(0, dist - len);
          return { group: g, timeMin: 0, frontKm: dist, startKm, endKm: dist };
        });
        const centreKm = dist;
        const half = windowWidthKm / 2;
        let viewMinKm = centreKm - half;
        let viewMaxKm = centreKm + half;
        if (total <= windowWidthKm){
          viewMinKm = 0;
          viewMaxKm = total;
        } else {
          if (viewMinKm < 0){
            viewMinKm = 0;
            viewMaxKm = windowWidthKm;
          } else if (viewMaxKm > total){
            viewMaxKm = total;
            viewMinKm = total - windowWidthKm;
          }
        }
        return { row, positions, totalDistKm: total, viewMinKm, viewMaxKm };
      }
      const startDelayByGroup = _laneStartDelayMap_(1);
      const absTimes = getEnabledGroups().map(g => ({
        group: g,
        absMin: parseTime((row.times||{})[g]) + (startDelayByGroup[g] || 0)
      }));

      // v1.78: labels keep each lane's true selected-row arrival time, but X
      // position is rendered at the first-arriving lane reference time. Each
      // lane then back/forward-walks independently through its own segments.
      const finiteAbs = absTimes.map(t => t.absMin).filter(Number.isFinite);
      const fallbackRef = finiteAbs.length ? Math.min.apply(null, finiteAbs) : 0;

      const positions = getEnabledGroups().map(g => {
        const abs = absTimes.find(x => x.group === g);
        const scanMin = fallbackRef + timeOffsetMin;
        const state = _frontStateAtTime_(rows, g, scanMin, startDelayByGroup[g] || 0, 1);
        let frontKm = state.frontKm;
        if (!Number.isFinite(frontKm)) frontKm = row.distKm;
        if (frontKm < 0) frontKm = 0;
        if (frontKm > totalDistKm) frontKm = totalDistKm;

        const stats = groupStats[g] || { avgKmPerMin: 1, trainLengthKm: 0, cars:(groupMeta[g]?.cars || 0), intervalMin:(groupMeta[g]?.intervalMin || 1) };
        const localV = Math.max(0.0001, (Number(state.speedKmh) || 60) / 60);
        stats.avgKmPerMin = localV;
        stats.trainLengthKm = Math.max(0, ((stats.cars || 0) - 1) * (stats.intervalMin || 1) * localV);
        const lengthKm = stats.trainLengthKm || 0;
        let startKm = frontKm - lengthKm;
        if (startKm < 0) startKm = 0;

        return { group: g, timeMin: (abs && Number.isFinite(abs.absMin)) ? abs.absMin : scanMin, frontKm, startKm, endKm: frontKm, holding:!!state.holding };
      });

      const last = rows[rows.length - 1];
      const total = last.distKm;

      let centreKm = windowCenterKm;
      if (!Number.isFinite(centreKm)) centreKm = row.distKm;

      const half = windowWidthKm / 2;
      let viewMinKm = centreKm - half;
      let viewMaxKm = centreKm + half;

      if (total <= windowWidthKm){
        viewMinKm = 0;
        viewMaxKm = total;
      } else {
        if (viewMinKm < 0){
          viewMinKm = 0;
          viewMaxKm = windowWidthKm;
        } else if (viewMaxKm > total){
          viewMaxKm = total;
          viewMinKm = total - windowWidthKm;
        }
      }

      return { row, positions, totalDistKm, viewMinKm, viewMaxKm };

    }

    function updateSummaries(positions, row){
      if (!row || !positions || !positions.length){
        if (rowSummary) rowSummary.textContent = '';
        if (gapSummary) gapSummary.textContent = '';
        return;
      }

      const byTime = [...positions].sort((a,b) => a.timeMin - b.timeMin);
      const lines = [];
      for (let i = 0; i < byTime.length; i += 2) {
        const left = byTime[i];
        const right = byTime[i + 1];
        if (right) {
          lines.push(`${left.group}: ${formatClock(left.timeMin)}    ${right.group}: ${formatClock(right.timeMin)}`);
        } else {
          lines.push(`${left.group}: ${formatClock(left.timeMin)}`);
        }
      }
      if (rowSummary){
        rowSummary.innerHTML = `Selected point – ${row.dist.toFixed(1)} km\nETAs at selected point\n${lines.join('\n')}`;
      }
      if (gapSummary) gapSummary.textContent = '';
    }

    function setupScanner(){
      const scanner = q('routeScanner');
      const label = q('scannerLabel');
      const rows = Array.isArray(hostRows) ? hostRows : [];

      if (!scanner || !label) return;

      if (!rows.length){
        scanner.disabled = true;
        scannerConfig.enabled = false;
        windowCenterKm = 0;
        label.textContent = 'Route scanner – no schedule loaded yet.';
        return;
      }

      const last = rows[rows.length - 1];
      const total = (last && Number.isFinite(last.distKm)) ? last.distKm : 0;

      if (total <= windowWidthKm){
        // Keep scanner alive even for short stages so panning/focus linkage still feels responsive.
        scanner.disabled = false;
        scannerConfig.enabled = true;
        scannerConfig.minCenterKm = 0;
        scannerConfig.maxCenterKm = total;
        windowCenterKm = total / 2;
        label.textContent = `Route scanner – stage is ${total.toFixed(1)} km (shorter than 30 km), full route is shown.`;
        // continue to configure scanner range below
      }

      const half = windowWidthKm / 2;
      if (total > windowWidthKm) {
        scannerConfig.minCenterKm = half;
        scannerConfig.maxCenterKm = total - half;
        scannerConfig.enabled = true;
      }

      scanner.disabled = false;
      scanner.min = 0;
      scanner.max = total;
      scanner.step = 0.1;

      const focusRow = getFocusRow() || rows[0];
      const focusIdx = getFocusIdx();

      if (_lastFocusIdxForWindow !== focusIdx) {
        _lastFocusIdxForWindow = focusIdx;
        scannerPosKm = (focusRow && Number.isFinite(focusRow.distKm)) ? focusRow.distKm : 0;
      } else {
        if (!Number.isFinite(scannerPosKm)) scannerPosKm = (Number.isFinite(windowCenterKm) ? windowCenterKm : 0);
      }

      if (!Number.isFinite(windowCenterKm)) windowCenterKm = scannerPosKm;
      windowCenterKm = Math.min(Math.max(scannerPosKm, scannerConfig.minCenterKm), scannerConfig.maxCenterKm);

      scanner.value = String(scannerPosKm);
      label.textContent = `Route scanner – position: ${scannerPosKm.toFixed(1)} km (centre ${windowCenterKm.toFixed(1)} of ${total.toFixed(1)} km)`;

      if (!scanner._tlWired) {
        scanner._tlWired = true;
        scanner.addEventListener('input', () => {
          if (!scannerConfig.enabled) return;
          const v = parseFloat(scanner.value);
          if (!Number.isFinite(v)) return;
          scannerPosKm = v;
          windowCenterKm = Math.min(Math.max(v, scannerConfig.minCenterKm), scannerConfig.maxCenterKm);
          label.textContent = `Route scanner – position: ${scannerPosKm.toFixed(1)} km (centre ${windowCenterKm.toFixed(1)} of ${total.toFixed(1)} km)`;
          renderTimeline();
          persistMemFocus();
        });
      }
    }

    function wireRendererControlsOnce(){
      if (_rendererWired) return;
      _rendererWired = true;

      try{ applyDelayLockUi(); }catch(_e){}
      const show = q('showCarsToggle');
      if (show) {
        showCars = !!show.checked;
        show.addEventListener('change', ()=>{ showCars = !!show.checked; renderTimeline(); });
      }

      const elastic = q('elasticToggle');
      if (elastic) {
        elastic.checked = !!elasticEnabled;
        elastic.addEventListener('change', ()=>{
          elasticEnabled = !!elastic.checked;
          rememberApplyStartDelays_(elasticEnabled);
          renderTimeline();
          updateFocusSummary();
        });
      }

      const slider = q('timeOffsetSlider');
      const label = q('timeOffsetLabel');
      if (slider && label) {
        const upd = ()=>{ label.textContent = `Time offset around this row (–20 to +20 min): ${timeOffsetMin.toFixed(1)} min`; };
        timeOffsetMin = parseFloat(slider.value) || 0;
        try{ slider.value = String(Math.max(-20, Math.min(20, Number(timeOffsetMin)||0))); }catch(_e){}
        upd();
        slider.addEventListener('input', ()=>{ timeOffsetMin = parseFloat(slider.value) || 0; upd(); renderTimeline(); persistMemFocus(); });
      }

      // Resize handler scoped per instance
      const onResize = () => renderTimeline();
      window.addEventListener('resize', onResize);
      instance._cleanup.push(() => window.removeEventListener('resize', onResize));
    }

    function renderTimeline(){
      wireRendererControlsOnce();
      try{ syncIntervalFromAdmin(); }catch(e){}
      updateLaneNote();
      computeGroupStats();
      setupScanner();
      // If host did not provide times, compute them from dist+speeds+added-time.
      if (!hasAnyTimes) { try { _computeRowTimesFromInputs(); } catch(e){} }
      // v1.54: refresh combined focus rows after computed times are written to
      // hostRows, otherwise the focus-owned copies still carry empty times.
      try { _buildCombinedFocusRows_(); } catch(e){}

      while (svg.firstChild) svg.removeChild(svg.firstChild);

      const rows = Array.isArray(hostRows) ? hostRows : [];
      let rowIndex = _getHostIndexForFocus_();

      if (!rows.length){
        if (focusInstr) focusInstr.textContent = '';
        if (rowSummary) rowSummary.textContent = '';
        if (gapSummary) gapSummary.textContent = '';
        return;
      }
      if (!Number.isFinite(rowIndex)) rowIndex = 0;
      rowIndex = Math.max(0, Math.min(rows.length - 1, rowIndex));

      let calc = null;
      let calcR1 = null, calcR2 = null;
      if (isRoute2CompareMode()) {
        const r1RowsForCalc = _markerRowsForRoute_(1);
        const r2RowsForCalc = _markerRowsForRoute_(2);
        const r1IdxForCalc = _routeIndexForFocus_(1, r1RowsForCalc);
        const r2IdxForCalc = _routeIndexForFocus_(2, r2RowsForCalc);
        const statsR1 = _computeGroupStatsForRowsAtIndex_(r1RowsForCalc, r1IdxForCalc, 1);
        const statsR2 = _computeGroupStatsForRowsAtIndex_(r2RowsForCalc, r2IdxForCalc, 2);
        calcR1 = _computePositionsForRowsAtIndex_(r1RowsForCalc, r1IdxForCalc, statsR1, 1);
        calcR2 = _computePositionsForRowsAtIndex_(r2RowsForCalc, r2IdxForCalc, statsR2, 2);
        // v1.78: shared reference is the first-arriving lane at the focused waypoint.
        const sharedRouteRefMin = Math.min.apply(null, []
          .concat((calcR1 && Array.isArray(calcR1.positions)) ? calcR1.positions.map(p=>p.timeMin).filter(Number.isFinite) : [])
          .concat((calcR2 && Array.isArray(calcR2.positions)) ? calcR2.positions.map(p=>p.timeMin).filter(Number.isFinite) : [])
        );
        if (Number.isFinite(sharedRouteRefMin)) {
          calcR1 = _computePositionsForRowsAtIndex_(r1RowsForCalc, r1IdxForCalc, statsR1, 1, sharedRouteRefMin);
          calcR2 = _computePositionsForRowsAtIndex_(r2RowsForCalc, r2IdxForCalc, statsR2, 2, sharedRouteRefMin);
        }
        calc = (String(routeKey || '1') === '2' ? calcR2 : calcR1) || calcR1 || calcR2;
        if (calc) { calc._r1 = calcR1; calc._r2 = calcR2; }
      } else {
        calc = computePositionsForRow(rowIndex);
      }
      const positions = calc.positions, viewMinKm = calc.viewMinKm, viewMaxKm = calc.viewMaxKm;
      const focusRowForDisplay = getFocusRow();
      const row = focusRowForDisplay || calc.row;

      const viewport = root.querySelector('.tlw-viewport');
      let viewportWidth = viewport ? viewport.clientWidth : 800;
      if (viewportWidth < 400) viewportWidth = 400;

      const innerPadding = 16;
      const drawingWidth = Math.max(500, viewportWidth - innerPadding);

      const leftMargin = 70;
      const rightMargin = 70;
      const laneSpacing = 64;
      const topMargin = 50;

      const kmSpan = Math.max(1, viewMaxKm - viewMinKm);
      const pxPerKm = (drawingWidth - leftMargin - rightMargin) / kmSpan;

      const width = drawingWidth;
      const height = topMargin + laneSpacing * getEnabledGroups().length + 60;

      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

      const NS = 'http://www.w3.org/2000/svg';
      const laneY = gIndex => topMargin + laneSpacing * gIndex;
      const distToX = d => leftMargin + (d - viewMinKm) * pxPerKm;

      function line(x1,y1,x2,y2,opts={}){
        const el = document.createElementNS(NS,'line');
        el.setAttribute('x1', x1);
        el.setAttribute('y1', y1);
        el.setAttribute('x2', x2);
        el.setAttribute('y2', y2);
        if (opts.stroke) el.setAttribute('stroke', opts.stroke);
        if (opts.strokeWidth) el.setAttribute('stroke-width', opts.strokeWidth);
        if (opts.dash) el.setAttribute('stroke-dasharray', opts.dash);
        svg.appendChild(el);
        return el;
      }
      function text(x,y,txt,opts={}){
        const el = document.createElementNS(NS,'text');
        el.setAttribute('x', x);
        el.setAttribute('y', y);
        el.textContent = txt;
        el.setAttribute('font-size', opts.size || 10);
        el.setAttribute('fill', opts.fill || '#374151');
        if (opts.weight) el.setAttribute('font-weight', opts.weight);
        if (opts.anchor) el.setAttribute('text-anchor', opts.anchor);
        svg.appendChild(el);
        return el;
      }
      function rect(x,y,w,h,opts={}){
        const el = document.createElementNS(NS,'rect');
        el.setAttribute('x', x);
        el.setAttribute('y', y);
        el.setAttribute('width', w);
        el.setAttribute('height', h);
        el.setAttribute('rx', opts.rx || 8);
        if (opts.fill) el.setAttribute('fill', opts.fill);
        if (opts.fillOpacity != null) el.setAttribute('fill-opacity', opts.fillOpacity);
        if (opts.stroke) el.setAttribute('stroke', opts.stroke);
        if (opts.strokeWidth) el.setAttribute('stroke-width', opts.strokeWidth);
        if (opts.strokeOpacity != null) el.setAttribute('stroke-opacity', opts.strokeOpacity);
        svg.appendChild(el);
        return el;
      }
      function circle(x,y,r,opts={}){
        const el = document.createElementNS(NS,'circle');
        el.setAttribute('cx', x);
        el.setAttribute('cy', y);
        el.setAttribute('r', r);
        if (opts.fill) el.setAttribute('fill', opts.fill);
        if (opts.stroke) el.setAttribute('stroke', opts.stroke);
        if (opts.strokeWidth) el.setAttribute('stroke-width', opts.strokeWidth);
        svg.appendChild(el);
        return el;
      }

      const gridTop = topMargin - 30;
      const gridBottom = height - 50;

      const firstTick = Math.ceil(viewMinKm / 5) * 5;
      for (let d = firstTick; d <= viewMaxKm + 0.001; d += 5){
        const x = distToX(d);
        line(x, gridTop, x, gridBottom, { stroke:'#e5e7eb', strokeWidth:1 });
        text(x, gridBottom + 14, d.toFixed(0) + ' km', { anchor:'middle', size:9, fill:'#6b7280' });
      }
      text(width - 10, gridBottom + 28, 'Distance along route (km)', { anchor:'end', size:10, fill:'#6b7280' });

      const route2CompareRender = isRoute2CompareMode();
      getEnabledGroups().forEach((g, i) => {
        const y = laneY(i);
        if (route2CompareRender) {
          const totalH = 27, r1H = 14, gapH = 8, r2H = 10;
          const yR1 = y - totalH/2 + r1H/2;
          const yR2 = y + totalH/2 - r2H/2;
          line(distToX(viewMinKm), yR1, distToX(viewMaxKm), yR1, { stroke:'#e5e7eb', strokeWidth:1 });
          line(distToX(viewMinKm), yR2, distToX(viewMaxKm), yR2, { stroke:'#eef2f7', strokeWidth:1 });

          const speedR1 = getSpeedForGroupAtFocusRoute(g, 1);
          const speedR2 = getSpeedForGroupAtFocusRoute(g, 2);
          const txtR1 = Number.isFinite(speedR1) && speedR1 > 0 ? `${g} · ${Math.round(speedR1)}` : g;
          const txtR2 = Number.isFinite(speedR2) && speedR2 > 0 ? `${g} · ${Math.round(speedR2)}` : g;

          // Compact left SG hierarchy aligned to the split Route 1 / Route 2 lanes.
          text(12, yR1 + 3, txtR1, { size:9, fill:'#111827', weight:'600' });
          text(12, yR2 + 3, txtR2, { size:9, fill:'#4b5563', weight:'400' });
        } else {
          line(distToX(viewMinKm), y, distToX(viewMaxKm), y, { stroke:'#e5e7eb', strokeWidth:1 });
          const speed = getSpeedForGroupAtFocus(g);
          const speedTxt = (Number.isFinite(speed) && speed > 0) ? String(Math.round(speed)) : '';
          const label = speedTxt ? `${g} · ${speedTxt}` : g;
          text(12, y + 3, label, { size:12, fill:'#111827', weight:'600' });
        }
      });

      function markerStyleForRow(r){
        const type = String((r && r.type) || '').toUpperCase();
        const name = String((r && (r.label || r.waypoint || r.instruction || r.type)) || '').trim();
        let stroke = '#9ca3af', strokeWidth = 1, dash = '3 3', textFill = '#374151';

        // Type-first classification (label is fallback only when type is missing/unknown)
        if (type === 'MARSHAL' || (!type && /Marshal/i.test(name))){
          stroke = '#dc2626'; strokeWidth = 1.5; dash = '4 4'; textFill = '#b91c1c';
        } else if (type === 'STC' || /STC/.test(type) || (!type && /STC/i.test(name))){
          stroke = '#6b7280'; strokeWidth = 2; dash = '4 4'; textFill = '#374151';
        } else if (type === 'ADDED_TIME' || (!type && /ADDED\s*TIME|Added\s*Time|\bAT\b/i.test(name))){
          stroke = '#f59e0b'; strokeWidth = 2.5; dash = '4 4'; textFill = '#f59e0b';
        } else if (type === 'OPEN' || /OPEN\s*CONTROL/.test(type) || /OPEN.*CONTROL/.test(type) || type === 'OC' || /OPEN\s*CONTROL|\bOC\b/i.test(name)){
          stroke = '#059669'; strokeWidth = 2; dash = '4 4'; textFill = '#047857';
        } else if (type === 'START_STC' || type === 'START STC' || type === 'SSTC' || /START\s*STC|\bSSTC\b/i.test(name)){
          stroke = '#2563eb'; strokeWidth = 2; dash = '4 4'; textFill = '#1d4ed8';
        }
        return { stroke, strokeWidth, dash, textFill };
      }

      function drawTopMarkersForRows(markerRows, labelY, visual){
        const opacity = visual && visual.opacity != null ? visual.opacity : 1;
        const fontSize = visual && visual.size ? visual.size : 9;
        const fontWeight = visual && visual.weight ? visual.weight : null;
        const tickTop = visual && visual.tickTop != null ? visual.tickTop : (labelY + 4);
        const tickBottom = visual && visual.tickBottom != null ? visual.tickBottom : (labelY + 10);
        (Array.isArray(markerRows) ? markerRows : []).forEach(r => {
          if (r.dist < viewMinKm - 0.001 || r.dist > viewMaxKm + 0.001) return;
          const x = distToX(r.dist);
          const style = markerStyleForRow(r);
          const tick = line(x, tickTop, x, tickBottom, { stroke:style.stroke, strokeWidth:style.strokeWidth, dash:style.dash || undefined });
          if (tick && opacity !== 1) tick.setAttribute('opacity', opacity);
          const t = String((r && r.type) || '').toUpperCase();
          const markText = String((r && (r.label || r.waypoint || r.instruction || '')) || '');
          const isATrow = (t === 'ADDED_TIME') || /ADDED\s*TIME|\bAT\b/i.test(markText);
          const isStc = (t === 'STC') || /\bSTC\b/i.test(markText);
          const isMarshal = (t === 'MARSHAL') || /\bMARSHAL\b/i.test(markText);
          const isOC = (t === 'OPEN' || /OPEN\s*CONTROL/.test(t) || /OPEN.*CONTROL/.test(t) || (t === 'OC') || /OPEN\s*CONTROL|\bOC\b/i.test(markText));
          const isStartStc = (t === 'START_STC') || (t === 'START STC') || (t === 'SSTC') || /START\s*STC|\bSSTC\b/i.test(markText);
          if (isATrow || isStc || isMarshal || isOC || isStartStc){
            const atTxt = (r && r.atLabel != null) ? String(r.atLabel).trim() : '';
            const lbl = isATrow ? (atTxt ? ('AT ' + atTxt) : 'AT') : (displayLabel(r) || (isOC ? 'OC' : (isStartStc ? 'SSTC' : r.label)));
            const tx = text(x, labelY, lbl, { anchor:'middle', size:fontSize, fill:style.textFill, weight:fontWeight });
            if (tx && opacity !== 1) tx.setAttribute('opacity', opacity);
          }
        });
      }

      const markerLineTop = isRoute2CompareMode() ? (gridTop + 28) : (gridTop + 2);
      if (isRoute2CompareMode()){
        // v1.49: two-row label band. Labels stay above marker lines; Route 1 is more prominent.
        const markerTickTop = gridTop + 22;
        const markerTickBottom = gridTop + 28;
        drawTopMarkersForRows(_markerRowsForRoute_(1), gridTop, { opacity:1, size:10, weight:'700', tickTop:markerTickTop, tickBottom:markerTickBottom });
        drawTopMarkersForRows(_markerRowsForRoute_(2), gridTop + 13, { opacity:0.78, size:9, weight:'500', tickTop:markerTickTop, tickBottom:markerTickBottom });
      } else {
        drawTopMarkersForRows(rows, gridTop, { opacity:1 });
      }

      const xRow = distToX(row.dist);
      // Focus marker line: follow the row's waypoint type style (no blanket orange override)
      const fStyle = markerStyleForRow(row);
      line(xRow, markerLineTop, xRow, gridBottom, { stroke:fStyle.stroke, strokeWidth:Math.max(2.5, fStyle.strokeWidth), dash:fStyle.dash || undefined });

      const laneIndexMap = {};
      getEnabledGroups().forEach((g, i) => { laneIndexMap[g] = i; });

      const blockHeight = 24;
      function drawTrainBlock(pos, yCenter, blockH, carsOverride, visual){
        const yTop = yCenter - blockH / 2;
        const visStartKm = Math.max(pos.startKm, viewMinKm);
        const visEndKm = Math.max(visStartKm, Math.min(pos.frontKm, viewMaxKm));

        const xStart = distToX(visStartKm);
        const xEnd = distToX(Math.min(pos.frontKm, viewMaxKm));
        const widthPx = Math.max(8, (visEndKm - visStartKm) * pxPerKm);

        const strokeCol = (groupStroke[pos.group] || '#0f172a');
        const fillCol = (groupFill[pos.group] || strokeCol);
        const fillOpBase = (groupFillOpacity && groupFillOpacity[pos.group] != null) ? groupFillOpacity[pos.group] : 1;
        const strokeOpBase = (groupStrokeOpacity && groupStrokeOpacity[pos.group] != null) ? groupStrokeOpacity[pos.group] : 1;
        const fillOp = fillOpBase * (visual && visual.opacity != null ? visual.opacity : 1);
        const strokeOp = strokeOpBase * (visual && visual.opacity != null ? visual.opacity : 1);
        rect(xStart, yTop, widthPx, blockH, { fill:fillCol, fillOpacity:fillOp, stroke:strokeCol, strokeWidth:0.4, strokeOpacity:strokeOp });

        const stats = (visual && visual.statsByGroup && visual.statsByGroup[pos.group]) || groupStats[pos.group] || {};
        const cars = clampInt((carsOverride != null ? carsOverride : stats.cars), 0, 99);
        const dotR = (visual && visual.dotR) || 4;
        if (showCars && cars && cars > 1) {
          const gapKm = (stats.avgKmPerMin || 0) * (stats.intervalMin || 1);
          if (gapKm > 0) {
            for (let i = 0; i < cars; i++) {
              const carKm = pos.frontKm - gapKm * i;
              if (carKm < pos.startKm - 1e-3) break;
              if (carKm < viewMinKm - 1e-3 || carKm > viewMaxKm + 1e-3) continue;
              const cx = distToX(carKm);
              circle(cx, yCenter, dotR, { fill:strokeCol, stroke:'white', strokeWidth:Math.max(1.3, dotR/2) });
            }
          }
        }
        circle(xEnd, yCenter, dotR, { fill:'white', stroke:strokeCol, strokeWidth:Math.max(1.3, dotR/2) });
      }

      if (route2CompareRender) {
        const positionsR1 = (calcR1 && Array.isArray(calcR1.positions)) ? calcR1.positions : [];
        const positionsR2 = (calcR2 && Array.isArray(calcR2.positions)) ? calcR2.positions : [];
        getEnabledGroups().forEach(g => {
          const laneIndex = laneIndexMap[g] ?? 0;
          const yCenter = laneY(laneIndex);
          const totalH = 27, r1H = 14, r2H = 10;
          const yR1 = yCenter - totalH/2 + r1H/2;
          const yR2 = yCenter + totalH/2 - r2H/2;
          const gm = groupMeta[g] || {};
          const posR1 = positionsR1.find(p => p && p.group === g);
          const posR2 = positionsR2.find(p => p && p.group === g);
          if (posR1) drawTrainBlock(posR1, yR1, r1H, gm.carsR1, { opacity:1, dotR:3.5, statsByGroup:(calcR1 && calcR1.statsByGroup) });
          if (posR2) drawTrainBlock(posR2, yR2, r2H, gm.carsR2, { opacity:0.72, dotR:3, statsByGroup:(calcR2 && calcR2.statsByGroup) });
        });
      } else {
        positions.forEach(pos => {
          const laneIndex = laneIndexMap[pos.group] ?? 0;
          const yCenter = laneY(laneIndex);
          drawTrainBlock(pos, yCenter, blockHeight, null, { opacity:1, dotR:4 });
        });
      }

      const etaX = xRow + 8;
      if (route2CompareRender) {
        // v1.54: route-owned arrival labels, aligned to the split lane centres.
        getEnabledGroups().forEach(g => {
          const laneIndex = laneIndexMap[g] ?? 0;
          const yCenter = laneY(laneIndex);
          const totalH = 27, r1H = 14, r2H = 10;
          const yR1 = yCenter - totalH/2 + r1H/2;
          const yR2 = yCenter + totalH/2 - r2H/2;
          const arrR1 = getArrivalMinForFocusRoute(g, 1);
          const arrR2 = getArrivalMinForFocusRoute(g, 2);
          const rowR1 = _getFocusedRouteRow_(1);
          const rowR2 = _getFocusedRouteRow_(2);
          const isATR1 = rowR1 && (String(rowR1.type || rowR1.label || '').toUpperCase() === 'ADDED_TIME');
          const isATR2 = rowR2 && (String(rowR2.type || rowR2.label || '').toUpperCase() === 'ADDED_TIME');
          if (arrR1 != null) {
            if (isATR1) {
              const depR1 = arrR1 + ((_getAddedSecForRow(rowR1, g) || 0) / 60);
              text(etaX, yR1 - 8, 'A ' + formatClock(arrR1), { size:9, fill:'#111827', weight:'600', anchor:'start' });
              text(etaX, yR1 + 3, 'D ' + formatClock(depR1), { size:9, fill:'#4b5563', weight:'400', anchor:'start' });
            } else {
              text(etaX, yR1 + 4, 'A ' + formatClock(arrR1), { size:9, fill:'#111827', weight:'600', anchor:'start' });
            }
          }
          if (arrR2 != null) {
            if (isATR2) {
              const depR2 = arrR2 + ((_getAddedSecForRow(rowR2, g) || 0) / 60);
              text(etaX, yR2 + 2, 'A ' + formatClock(arrR2), { size:9, fill:'#111827', weight:'600', anchor:'start' });
              text(etaX, yR2 + 13, 'D ' + formatClock(depR2), { size:9, fill:'#4b5563', weight:'400', anchor:'start' });
            } else {
              text(etaX, yR2 + 3, 'A ' + formatClock(arrR2), { size:9, fill:'#4b5563', weight:'400', anchor:'start' });
            }
          }
        });
      } else {
        const isAT = (String(row.type || row.label || '').toUpperCase() === 'ADDED_TIME');
        positions.forEach(pos => {
          const laneIndex = laneIndexMap[pos.group] ?? 0;
          const yCenter = laneY(laneIndex);

          const arrMin = pos.timeMin;
          let depMin = arrMin;
          if (isAT) {
            const addSec = _getAddedSecForRow(row, pos.group) || 0;
            depMin = arrMin + (addSec / 60);
          }

          if (isAT) {
            text(etaX, yCenter - 2, 'A ' + formatClock(arrMin), { size:10, fill:'#111827', weight:'500', anchor:'start' });
            text(etaX, yCenter + 12, 'D ' + formatClock(depMin), { size:10, fill:'#111827', weight:'500', anchor:'start' });
          } else {
            text(etaX, yCenter + 6, 'A ' + formatClock(arrMin), { size:10, fill:'#111827', weight:'500', anchor:'start' });
          }
        });
      }

      updateSummaries(positions, row);
    }

    // --- Event wiring ---
    const instance = {
      rallyId: opts && opts.rallyId ? String(opts.rallyId) : '',
      mode: (opts && opts.mode) ? opts.mode : 'embed',
      root,
      _cleanup: [],
      // Host can update day start clock at runtime (HH:MM or HH:MM:SS)
      setStartTime(startStr){ setDayStartClock(startStr); },
      setDayStart(startStr){ setDayStartClock(startStr); },
      setScheduleSnapshot(snapshot) {
        // v1.25: preserve focus/scanner state across live updates
        try{ persistMemFocus(); }catch(_e){}
        if (!Array.isArray(snapshot)) snapshot = [];
        hostRows = snapshot.map((r, i)=>({
          idx: (r.rowNo ?? r.idx ?? (i+1)),
          distKm: (typeof r.dist === 'number') ? r.dist : (typeof r.dist === 'string' ? parseFloat(r.dist) : null),
          type: r.type ?? '',
          label: r.label ?? r.waypoint ?? r.type ?? '',
          instruction: r.instruction ?? r.instr ?? '',
          times: r.times ?? {},
          speeds: r.speeds ?? null,
          atLabel: (r.atLabel != null ? String(r.atLabel) : '')
        }));
        hostRows = sanitizeRowsByDist_(hostRows);
        hasAnyTimes = hostRows.some(rr => rr && rr.times && Object.values(rr.times).some(v => String(v||'').trim() !== ''));
        buildFocusSelect();
        try{ restoreMemFocus(); }catch(_e){}
        try{ const elastic = q('elasticToggle'); if (elastic) elastic.checked = !!elasticEnabled; }catch(_e){}
        updateFocusSummary();
        renderTimeline();
        try{ persistMemFocus(); }catch(_e){}
      },
      setEnabledGroups(flags){
        // flags: { SG3: boolean, SG4: boolean }
        if (!flags || typeof flags !== 'object') return;
        _enabled.SG3 = !!flags.SG3;
        _enabled.SG4 = !!flags.SG4;
        updateLaneNote();
        buildDelayCarsRows();
        updateFocusSummary();
        renderTimeline();
      },
      setAllocatedCars(map){
        if (!map || typeof map !== 'object') return;
        ALL_GROUPS.forEach(g=>{
          const v = map[g];
          if (v === null || v === undefined) return;
          groupMeta[g].allocCars = clampInt(v, 0, 99);
        });
        buildDelayCarsRows();
      },
      render() { renderTimeline(); },
      unmount() {
        persistMemFocus();
        // run cleanup handlers
        try { instance._cleanup.forEach(fn => { try { fn(); } catch(_){} }); } catch(_){}
        instance._cleanup = [];
        containerEl.innerHTML = '';
        _instances.delete(containerEl);
      }
    };

    // Focus events
    function resetTimeOffsetToZero(){
      timeOffsetMin = 0;
      const slider = q('timeOffsetSlider');
      const label  = q('timeOffsetLabel');
      try{ if (slider) slider.value = '0'; }catch(_e){}
      if (label) label.textContent = `Time offset around this row (–20 to +20 min): ${timeOffsetMin.toFixed(1)} min`;
    }

    if (focusSelect){
      const onChange = ()=>{ resetTimeOffsetToZero(); updateFocusSummary(); renderTimeline(); persistMemFocus(); };
      focusSelect.addEventListener('change', onChange);
      instance._cleanup.push(()=>focusSelect.removeEventListener('change', onChange));
    }
if (btnPrev){
      const onPrev = ()=>{
        const rows = Array.isArray(focusRows) && focusRows.length ? focusRows : _buildCombinedFocusRows_();
        if (!rows.length || !focusSelect || focusSelect.disabled) return;
        const idx = clampInt(focusSelect.value, 0, rows.length-1);
        const nextIdx = Math.max(0, idx - 1);
        focusSelect.value = String(nextIdx);
        resetTimeOffsetToZero();
        updateFocusSummary();
        renderTimeline();
        persistMemFocus();
      };
      btnPrev.addEventListener('click', onPrev);
      instance._cleanup.push(()=>btnPrev.removeEventListener('click', onPrev));
    }
    if (btnNext){
      const onNext = ()=>{
        const rows = Array.isArray(focusRows) && focusRows.length ? focusRows : _buildCombinedFocusRows_();
        if (!rows.length || !focusSelect || focusSelect.disabled) return;
        const idx = clampInt(focusSelect.value, 0, rows.length-1);
        const nextIdx = Math.min(rows.length-1, idx + 1);
        focusSelect.value = String(nextIdx);
        resetTimeOffsetToZero();
        updateFocusSummary();
        renderTimeline();
        persistMemFocus();
      };
      btnNext.addEventListener('click', onNext);
      instance._cleanup.push(()=>btnNext.removeEventListener('click', onNext));
    }

    // Initial paint
    applyExternalFromStorage();
    buildDelayCarsRows();
    buildFocusSelect();
    restoreMemFocus();
    _booting = false;
    updateFocusSummary();
    renderTimeline();
    persistMemFocus();
return instance;
  }

  const Timeline = {
    mount(containerEl, opts) {
      if (!containerEl) throw new Error('Timeline.mount: containerEl is required');
      // If already mounted, unmount first (idempotent)
      const existing = _instances.get(containerEl);
      if (existing && typeof existing.unmount === 'function') existing.unmount();

      const inst = createInstance(containerEl, opts || {});
      _instances.set(containerEl, inst);
      return inst;
    },
    unmount(containerEl) {
      const inst = _instances.get(containerEl);
      if (inst && typeof inst.unmount === 'function') inst.unmount();
    }
  };

  global.Timeline = Timeline;
})(window);