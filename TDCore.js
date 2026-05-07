/*!
 * TDCore.js v1.2
 * TD Rallies shared store manager.
 *
 * v1.2:
 * - Save As Template clears surviving controlsData.days[].cocData COC branch.
 *
 * v1.1:
 * - Save As Template clears surviving controlsData.days[].ataData ATA branch.
 *
 * v1.0:
 * - Save As Template clears controls/runtime/import operational data while preserving authored structures.
 *
 * v0.9:
 * - Save As Template rebuilds Admin entries to 10 blank SG1/Route1 rows.
 *
 * v0.8:
 * - Adds createTemplateFromActiveRally() skeleton for Save As Template.
 * - Clones active rally, applies new title/RID/r001, switches active rally, and exports snapshot.
 * - No sanitising/entries reset yet.
 *
 * v0.5:
 * - Adds session save-protection state for older loaded snapshots.
 * - Exposes canNormalSave(), isOlderLoadedFile(), getSaveWarning().
 *
 * v0.4:
 * - Makes readStore() passive: parse only, no migration/default injection.
 * - Adds peekStore() alias for pure localStorage read.
 * - Adds resolveActiveRallyId() as non-mutating active rally resolver.
 * - Keeps explicit migrate/import/write/patch paths.
 *
 * v0.3:
 * - Adds patch-write helpers for safer partial store updates.
 * - Adds active-rally and section patch helpers.
 * - Keeps v0.2 import/export and migration behaviour.
 *
 * v0.2:
 * - Formal snapshot import/export helpers.
 * - Snapshot validation summary.
 * - TD1/pre-route schedule migration to TD2 route-aware shape.
 * - Metadata added to snapshots and store.
 *
 * Safety:
 * - Import never mutates the source object directly.
 * - Import returns a clean modern TD_RALLIES object.
 * - No localStorage write happens unless writeStore() is explicitly called.
 */
(function(global){
  "use strict";

  const TDCore = {
    VERSION: "1.2",
    DEFAULT_STORE_KEY: "TD_RALLIES",
    TEST_STORE_KEY: "TDCORE_TEST_ONLY",
    APP_FAMILY: "TD_RALLIES",
    CURRENT_APP_VERSION: "TD2",
    CURRENT_SCHEMA_VERSION: 2
  };

  function nowIso(){
    return new Date().toISOString();
  }

  function clone(obj){
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
  }

  function safeJsonParse(raw, fallback){
    if (!raw || typeof raw !== "string") return fallback;
    try { return JSON.parse(raw); }
    catch(_err){ return fallback; }
  }

  function asObject(v){
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  function resolveActiveRallyId(td){
    td = asObject(td);
    const g = asObject(td.global);
    const rallies = asObject(td.rallies);
    return g.activeRallyId || g.lastRallyId || Object.keys(rallies)[0] || "";
  }

  function activeRallyId(td){
    return resolveActiveRallyId(td);
  }

  function normalizeTime(value){
    if (typeof value !== "string") return "00:00:00";
    const s = value.trim();
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) {
      const p = s.split(":").map(Number);
      return String(p[0]).padStart(2,"0") + ":" + String(p[1]).padStart(2,"0") + ":" + String(p[2]).padStart(2,"0");
    }
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      const p = s.split(":").map(Number);
      return String(p[0]).padStart(2,"0") + ":" + String(p[1]).padStart(2,"0") + ":00";
    }
    return "00:00:00";
  }

  function unwrapSnapshot(input){
    const src = clone(input || {});
    if (src && src.td_rallies) return src.td_rallies;
    return src;
  }

  function ensureTdShape(td){
    td = asObject(td);
    td.global = asObject(td.global);
    td.rallies = asObject(td.rallies);

    let rid = activeRallyId(td);
    if (!rid) rid = "RID-DEV";
    if (!td.global.activeRallyId) td.global.activeRallyId = rid;
    if (!td.global.lastRallyId) td.global.lastRallyId = rid;
    td.global.workspaceReady = td.global.workspaceReady !== false;
    td.global.workspaceLabel = td.global.workspaceLabel || "Rally schedule";

    td.rallies[rid] = asObject(td.rallies[rid]);
    const r = td.rallies[rid];

    r.meta = asObject(r.meta);
    r.admin = asObject(r.admin);
    r.schedule = asObject(r.schedule);

    td.tdCore = asObject(td.tdCore);
    td.tdCore.appFamily = TDCore.APP_FAMILY;
    td.tdCore.appVersion = TDCore.CURRENT_APP_VERSION;
    td.tdCore.schemaVersion = TDCore.CURRENT_SCHEMA_VERSION;
    td.tdCore.normalisedBy = "TDCore v" + TDCore.VERSION;
    td.tdCore.lastNormalisedAt = nowIso();

    return td;
  }

  function ensureRouteDefaults(r){
    r.admin = asObject(r.admin);
    r.admin.ui = asObject(r.admin.ui);

    const routeRaw = Number(r.admin.routes || r.admin.ui.routeCount || 1);
    const routes = routeRaw === 2 ? 2 : 1;

    r.admin.routes = routes;
    r.admin.ui.routeCount = routes;

    const entries = Array.isArray(r.admin.entries) ? r.admin.entries : [];
    entries.forEach(function(e){
      if (!e || typeof e !== "object") return;
      const rt = Number(e.route || 1);
      e.route = (routes === 2 && rt === 2) ? 2 : 1;
    });

    const controls = asObject(r.admin.controls);
    const days = asObject(controls.days);
    Object.keys(days).forEach(function(dayKey){
      const d = asObject(days[dayKey]);
      const rows = Array.isArray(d.entries) ? d.entries : [];
      rows.forEach(function(e){
        if (!e || typeof e !== "object") return;
        const rt = Number(e.route || 1);
        e.route = (routes === 2 && rt === 2) ? 2 : 1;
        if (e.startTime) e.startTime = normalizeTime(e.startTime);
      });
    });

    if (Array.isArray(controls.entries)) {
      controls.entries.forEach(function(e){
        if (!e || typeof e !== "object") return;
        const rt = Number(e.route || 1);
        e.route = (routes === 2 && rt === 2) ? 2 : 1;
        if (e.startTime) e.startTime = normalizeTime(e.startTime);
      });
    }

    r.admin.controls = controls;
    return r;
  }

  function migrateLegacyScheduleDayToRoutes(dayObj){
    dayObj = asObject(dayObj);

    if (dayObj.routes && typeof dayObj.routes === "object" && !Array.isArray(dayObj.routes)) {
      dayObj.routes = asObject(dayObj.routes);
      if (!dayObj.routes["1"]) dayObj.routes["1"] = {};
      Object.keys(dayObj.routes).forEach(function(rt){
        const rr = asObject(dayObj.routes[rt]);
        if (!Array.isArray(rr.rows)) rr.rows = [];
        if (!Array.isArray(rr.controls)) rr.controls = [];
        dayObj.routes[rt] = rr;
      });
      return dayObj;
    }

    const route1 = {};
    ["rows", "controls", "summary", "rowSpeedsById"].forEach(function(key){
      if (dayObj[key] !== undefined) route1[key] = dayObj[key];
      delete dayObj[key];
    });

    if (!Array.isArray(route1.rows)) route1.rows = [];
    if (!Array.isArray(route1.controls)) route1.controls = [];

    dayObj.routes = { "1": route1 };
    return dayObj;
  }

  function migrateToCurrent(td){
    td = ensureTdShape(clone(td));
    const rid = activeRallyId(td);
    const r = td.rallies[rid];

    ensureRouteDefaults(r);

    r.schedule = asObject(r.schedule);
    r.schedule.days = asObject(r.schedule.days);

    Object.keys(r.schedule.days).forEach(function(dayKey){
      r.schedule.days[dayKey] = migrateLegacyScheduleDayToRoutes(r.schedule.days[dayKey]);
    });

    td.tdCore.migratedTo = TDCore.CURRENT_APP_VERSION;
    td.tdCore.schemaVersion = TDCore.CURRENT_SCHEMA_VERSION;
    td.tdCore.lastMigratedAt = td.tdCore.lastMigratedAt || nowIso();

    return td;
  }

  function validateStore(td){
    const result = {
      ok: true,
      warnings: [],
      errors: [],
      summary: {}
    };

    td = asObject(td);
    const rid = activeRallyId(td);
    const r = td.rallies && td.rallies[rid];

    result.summary.activeRallyId = rid;

    if (!td.global) result.errors.push("Missing global object");
    if (!td.rallies) result.errors.push("Missing rallies object");
    if (!r) result.errors.push("Missing active rally object");

    if (r) {
      const admin = asObject(r.admin);
      const schedule = asObject(r.schedule);
      const days = asObject(schedule.days);
      const entries = Array.isArray(admin.entries) ? admin.entries : [];

      result.summary.title = r.meta && r.meta.title || "";
      result.summary.issue = r.meta && r.meta.issue || "";
      result.summary.routes = admin.routes || (admin.ui && admin.ui.routeCount) || 1;
      result.summary.entries = entries.length;
      result.summary.days = Object.keys(days);

      if (!(admin.routes === 1 || admin.routes === 2)) result.errors.push("admin.routes must be 1 or 2");
      if (!admin.ui || !(admin.ui.routeCount === 1 || admin.ui.routeCount === 2)) result.errors.push("admin.ui.routeCount must be 1 or 2");

      entries.forEach(function(e, idx){
        if (!e || !(e.route === 1 || e.route === 2)) result.errors.push("Entry " + (idx + 1) + " missing valid route");
      });

      Object.keys(days).forEach(function(dayKey){
        const day = asObject(days[dayKey]);
        const routes = asObject(day.routes);
        if (!routes["1"]) result.errors.push("Day " + dayKey + " missing routes[1]");
        Object.keys(routes).forEach(function(rt){
          const rr = asObject(routes[rt]);
          if (!Array.isArray(rr.rows)) result.errors.push("Day " + dayKey + " route " + rt + " rows not array");
          if (!Array.isArray(rr.controls)) result.errors.push("Day " + dayKey + " route " + rt + " controls not array");
        });
      });
    }

    result.ok = result.errors.length === 0;
    return result;
  }

  function importSnapshot(snapshot){
    const td = unwrapSnapshot(snapshot);
    const migrated = migrateToCurrent(td || {});
    const validation = validateStore(migrated);
    return {
      ok: validation.ok,
      store: migrated,
      validation: validation,
      meta: {
        importedAt: nowIso(),
        tdCoreVersion: TDCore.VERSION,
        schemaVersion: TDCore.CURRENT_SCHEMA_VERSION
      }
    };
  }

  function exportSnapshot(td, meta){
    const clean = migrateToCurrent(td || {});
    const rid = activeRallyId(clean);
    const validation = validateStore(clean);
    const r = clean.rallies && clean.rallies[rid] ? clean.rallies[rid] : {};
    const issue = (r.meta && r.meta.issue) || "r000";

    return {
      kind: "TD_RALLIES_SNAPSHOT",
      version: (meta && meta.version) || ("TDCore v" + TDCore.VERSION),
      savedAt: nowIso(),
      activeRallyId: rid,
      tdCore: clone(clean.tdCore),
      validation: {
        ok: validation.ok,
        warnings: validation.warnings,
        errors: validation.errors
      },
      exportMeta: {
        appFamily: TDCore.APP_FAMILY,
        appVersion: TDCore.CURRENT_APP_VERSION,
        schemaVersion: TDCore.CURRENT_SCHEMA_VERSION,
        issue: issue
      },
      td_rallies: clean
    };
  }

  function peekStore(storeKey){
    const key = storeKey || TDCore.DEFAULT_STORE_KEY;
    const raw = global.localStorage ? global.localStorage.getItem(key) : null;
    return safeJsonParse(raw, {});
  }

  function readStore(storeKey){
    // v0.4: passive read only. No migration, no default injection, no active-rally mutation.
    return peekStore(storeKey);
  }

  function writeStore(td, storeKey){
    const key = storeKey || TDCore.DEFAULT_STORE_KEY;
    const clean = migrateToCurrent(td || {});
    if (!global.localStorage) throw new Error("localStorage is not available");
    global.localStorage.setItem(key, JSON.stringify(clean));
    return clean;
  }


  function isPlainObject(v){
    return v && typeof v === "object" && !Array.isArray(v);
  }

  function deepMerge(target, patch){
    target = isPlainObject(target) ? target : {};
    if (!isPlainObject(patch)) return clone(patch);

    Object.keys(patch).forEach(function(key){
      const pv = patch[key];
      if (pv === undefined) return;
      if (Array.isArray(pv)) {
        target[key] = clone(pv);
      } else if (isPlainObject(pv)) {
        target[key] = deepMerge(isPlainObject(target[key]) ? target[key] : {}, pv);
      } else {
        target[key] = pv;
      }
    });
    return target;
  }

  function shouldFenceWrite(options){
    options = options || {};
    if (typeof options.fence === "function") {
      try { return !!options.fence(); } catch(_err){ return true; }
    }
    if (typeof options.fenceName === "string" && options.fenceName) {
      try { return !!global[options.fenceName]; } catch(_err){ return true; }
    }
    return false;
  }

  function patchStore(patch, options){
    options = options || {};
    const key = options.storeKey || TDCore.DEFAULT_STORE_KEY;
    if (!global.localStorage) throw new Error("localStorage is not available");
    if (shouldFenceWrite(options)) return null;
    const raw = global.localStorage.getItem(key);
    if (options.requireExisting && raw === null) return null;

    let td = importSnapshot(safeJsonParse(raw, {})).store;
    if (typeof patch === "function") {
      const result = patch(td);
      if (result && result !== td) td = result;
    } else if (isPlainObject(patch)) {
      deepMerge(td, patch);
    }

    const clean = writeStore(td, key);

    if (options.broadcast) {
      try {
        const payload = Object.assign({ type:"TD_RALLIES_CHANGED", reason:String(options.reason || "TDCore.patchStore"), ts: Date.now() }, options.payload || {});
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("TD_RALLIES_CHANGED");
          bc.postMessage(payload);
          setTimeout(function(){ try{ bc.close(); }catch(_e){} }, 0);
        }
        try { global.dispatchEvent(new CustomEvent("TD_RALLIES_CHANGED", { detail: payload })); } catch(_e){}
      } catch(_err){}
    }

    return clean;
  }

  function patchActiveRally(patch, options){
    options = options || {};
    return patchStore(function(td){
      const rid = activeRallyId(td);
      td.rallies = asObject(td.rallies);
      td.rallies[rid] = asObject(td.rallies[rid]);
      const r = td.rallies[rid];
      if (typeof patch === "function") {
        const result = patch(r, rid, td);
        if (result && result !== r) td.rallies[rid] = result;
      } else if (isPlainObject(patch)) {
        deepMerge(r, patch);
      }
      return td;
    }, options);
  }

  function patchRallySection(sectionName, patch, options){
    if (!sectionName || typeof sectionName !== "string") throw new Error("sectionName is required");
    return patchActiveRally(function(r, rid, td){
      r[sectionName] = asObject(r[sectionName]);
      if (typeof patch === "function") {
        const result = patch(r[sectionName], r, rid, td);
        if (result && result !== r[sectionName]) r[sectionName] = result;
      } else if (isPlainObject(patch)) {
        deepMerge(r[sectionName], patch);
      }
      return r;
    }, options);
  }

  function getActiveRally(td){
    td = migrateToCurrent(td || {});
    const rid = activeRallyId(td);
    return td.rallies[rid] || {};
  }

  
  // v0.7 — persistent per-rally session/file safety state
  const TD_SAVE_PROTECTION_KEY = "TD_SAVE_PROTECTION_V2";

  const __tdSessionState = {
    rallyId: "",
    loadedIssue: "",
    latestKnownIssue: "",
    canNormalSave: true,
    warning: ""
  };

  function parseIssueNumber(issue){
    const m = String(issue || "").match(/(\d+)/);
    return m ? Number(m[1]) : 0;
  }

  function getCurrentRallyIdForSession(){
    try{
      const td = readStore(TDCore.DEFAULT_STORE_KEY);
      return resolveActiveRallyId(td || {}) || "";
    }catch(_e){
      return "";
    }
  }

  function saveProtectionState(state){
    try{
      if (!global.localStorage) return;
      if (state && state.canNormalSave === false && state.rallyId) {
        global.localStorage.setItem(TD_SAVE_PROTECTION_KEY, JSON.stringify(state));
      } else {
        global.localStorage.removeItem(TD_SAVE_PROTECTION_KEY);
      }
    }catch(_e){}
  }

  function readProtectionState(){
    try{
      if (!global.localStorage) return null;
      const raw = global.localStorage.getItem(TD_SAVE_PROTECTION_KEY);
      return safeJsonParse(raw, null);
    }catch(_e){
      return null;
    }
  }

  function clearSaveProtection(rallyId){
    try{
      const rid = String(rallyId || getCurrentRallyIdForSession() || "");
      const saved = readProtectionState();
      if (!saved || !saved.rallyId || !rid || saved.rallyId === rid) {
        if (global.localStorage) global.localStorage.removeItem(TD_SAVE_PROTECTION_KEY);
      }
      __tdSessionState.rallyId = rid;
      __tdSessionState.loadedIssue = "";
      __tdSessionState.latestKnownIssue = "";
      __tdSessionState.canNormalSave = true;
      __tdSessionState.warning = "";
    }catch(_e){}
    return clone(__tdSessionState);
  }

  function rehydrateSaveProtection(rallyId){
    const rid = String(rallyId || getCurrentRallyIdForSession() || "");
    const saved = readProtectionState();
    if (saved && saved.rallyId && saved.rallyId === rid && saved.canNormalSave === false) {
      __tdSessionState.rallyId = saved.rallyId;
      __tdSessionState.loadedIssue = String(saved.loadedIssue || "");
      __tdSessionState.latestKnownIssue = String(saved.latestKnownIssue || "");
      __tdSessionState.canNormalSave = false;
      __tdSessionState.warning = String(saved.warning || "Older rally file loaded while a newer issue already exists. Use Save As to avoid overwriting newer work.");
      return clone(__tdSessionState);
    }
    if (!saved || (saved.rallyId && saved.rallyId !== rid)) {
      __tdSessionState.rallyId = rid;
      __tdSessionState.canNormalSave = true;
      __tdSessionState.warning = "";
    }
    return clone(__tdSessionState);
  }

  function updateSessionAfterLoad(loadedIssue, latestKnownIssue, rallyId){
    loadedIssue = String(loadedIssue || "");
    latestKnownIssue = String(latestKnownIssue || "");

    const rid = String(rallyId || getCurrentRallyIdForSession() || "");

    __tdSessionState.rallyId = rid;
    __tdSessionState.loadedIssue = loadedIssue;
    __tdSessionState.latestKnownIssue = latestKnownIssue;

    const loadedNum = parseIssueNumber(loadedIssue);
    const latestNum = parseIssueNumber(latestKnownIssue);

    // v0.7 refined + persistent rule:
    // Allow normal continuation workflow.
    // Block only when a genuinely newer issue already exists for the same rally.
    const newerAlreadyExists =
      !!rid &&
      loadedNum > 0 &&
      latestNum > 0 &&
      loadedNum < latestNum;

    __tdSessionState.canNormalSave = !newerAlreadyExists;
    __tdSessionState.warning = newerAlreadyExists
      ? "Older rally file loaded while a newer issue already exists. Use Save As to avoid overwriting newer work."
      : "";

    saveProtectionState(__tdSessionState);
    return clone(__tdSessionState);
  }

  function canNormalSave(){

    return !!__tdSessionState.canNormalSave;
  }

  function isOlderLoadedFile(){
    return !__tdSessionState.canNormalSave;
  }

  function getSaveWarning(){
    return __tdSessionState.warning || "";
  }


  // v0.9 — Save As Template: clone active rally, rebuild blank entries, new RID, r001, active switch, export snapshot.
  function generateRallyId(existingRallies){
    existingRallies = asObject(existingRallies);
    for (let i = 0; i < 20; i++) {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
      const rid = "RID-" + y + m + day + "-" + rand;
      if (!existingRallies[rid]) return rid;
    }
    return "RID-" + Date.now().toString(36).toUpperCase();
  }


  function templateBlankEntry(n){
    n = Math.max(1, Math.round(Number(n) || 1));
    return {
      index: n,
      rallyNo: n,
      speedGroup: 1,
      route: 1,
      driver: { first: "", last: "", mobile: "", email: "" },
      navigator: { first: "", last: "" },
      car: { make: "", year: "" }
    };
  }

  function templateBuildBlankEntries(count){
    count = Math.max(1, Math.min(200, Math.round(Number(count) || 10)));
    const rows = [];
    for (let i = 1; i <= count; i++) rows.push(templateBlankEntry(i));
    return rows;
  }

  function templateParseHms(value){
    const s = normalizeTime(value);
    const p = s.split(":").map(Number);
    return { h:p[0]||0, m:p[1]||0, s:p[2]||0 };
  }

  function templateAddMinutes(h, m, s, addMin){
    let total = (Number(h)||0) * 3600 + (Number(m)||0) * 60 + (Number(s)||0);
    total += Math.round((Number(addMin)||0) * 60);
    total = ((total % 86400) + 86400) % 86400;
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    return String(hh).padStart(2,"0") + ":" + String(mm).padStart(2,"0") + ":" + String(ss).padStart(2,"0");
  }

  function templateDayCount(r){
    r = asObject(r);
    const admin = asObject(r.admin);
    const ui = asObject(admin.ui);
    let n = Number(ui.dayCount || admin.dayCount || 0);
    if (!Number.isFinite(n) || n < 1) {
      const dayKeys = Object.keys(asObject(admin.days)).filter(function(k){ return /^\d+$/.test(k); });
      if (dayKeys.length) n = Math.max.apply(null, dayKeys.map(Number));
    }
    if (!Number.isFinite(n) || n < 1) {
      const cDayKeys = Object.keys(asObject(asObject(admin.controls).days)).filter(function(k){ return /^\d+$/.test(k); });
      if (cDayKeys.length) n = Math.max.apply(null, cDayKeys.map(Number));
    }
    if (!Number.isFinite(n) || n < 1) n = 1;
    return Math.max(1, Math.min(9, Math.round(n)));
  }

  function templateDayStart(r, dayIndex){
    const admin = asObject(asObject(r).admin);
    const dayKey = String((Number(dayIndex)||0) + 1);
    const d = asObject(asObject(admin.days)[dayKey]);
    return normalizeTime(d.start || d.startTime || "08:30:00");
  }

  function templateDayIncMin(r, dayIndex){
    const admin = asObject(asObject(r).admin);
    const dayKey = String((Number(dayIndex)||0) + 1);
    const d = asObject(asObject(admin.days)[dayKey]);
    let v = Number(d.incMin != null ? d.incMin : d.incrementMin);
    if (!Number.isFinite(v)) v = 1;
    return v;
  }

  function templateSpeedForGroup(r, sgIdx){
    const sg = asObject(asObject(asObject(r).admin).speedGroups);
    const obj = asObject(sg[String(sgIdx || 1)]);
    const v = Number(obj.speed);
    return Number.isFinite(v) ? Math.round(v) : 60;
  }

  function templateBuildControlsEntriesForDay(r, dayIndex, entries){
    const base = templateParseHms(templateDayStart(r, dayIndex));
    const inc = templateDayIncMin(r, dayIndex);
    return (Array.isArray(entries) ? entries : []).map(function(e){
      const rallyNo = Math.max(1, Math.round(Number(e && e.rallyNo) || 1));
      const sgIdx = 1;
      return {
        rallyNo: rallyNo,
        route: 1,
        driverSurname: "",
        sgIdx: sgIdx,
        speed: templateSpeedForGroup(r, sgIdx),
        startTime: templateAddMinutes(base.h, base.m, base.s, (rallyNo - 1) * inc)
      };
    });
  }

  function templateRebuildAdminEntries(r, blankRowCount){
    r.admin = asObject(r.admin);
    r.admin.ui = asObject(r.admin.ui);
    r.admin.entries = templateBuildBlankEntries(blankRowCount || 10);

    r.admin.controls = asObject(r.admin.controls);
    r.admin.controls.days = asObject(r.admin.controls.days);
    const dayCount = templateDayCount(r);
    for (let d = 0; d < dayCount; d++) {
      const dayKey = String(d + 1);
      const dayObj = asObject(r.admin.controls.days[dayKey]);
      dayObj.entries = templateBuildControlsEntriesForDay(r, d, r.admin.entries);
      r.admin.controls.days[dayKey] = dayObj;
    }
    r.admin.controls.entries = r.admin.controls.days["1"] && Array.isArray(r.admin.controls.days["1"].entries)
      ? clone(r.admin.controls.days["1"].entries)
      : [];
    r.admin.controls.meta = Object.assign({}, asObject(r.admin.controls.meta), {
      templateEntriesResetAt: nowIso(),
      rowCount: r.admin.entries.length
    });

    // If a newer controls branch already carries an Admin-derived entrant feed, reset that mirror too.
    if (r.controls && typeof r.controls === "object" && !Array.isArray(r.controls)) {
      r.controls.days = asObject(r.controls.days);
      for (let d = 0; d < dayCount; d++) {
        const dayKey = String(d + 1);
        const dayObj = asObject(r.controls.days[dayKey]);
        if (Array.isArray(dayObj.rows)) dayObj.rows = templateBuildControlsEntriesForDay(r, d, r.admin.entries);
        r.controls.days[dayKey] = dayObj;
      }
    }
    return r;
  }


  // v1.0 — Save As Template operational/runtime cleaner.
  // Purpose: remove live event/result/download/import history from the cloned template rally only.
  // It intentionally avoids schedule/timeline authored branches and preserves organiser setup/config.
  function templateIsPlainObject(v){
    return v && typeof v === "object" && !Array.isArray(v);
  }

  const TEMPLATE_RUNTIME_DELETE_KEYS = {
    ata: true,
    atas: true,
    ataData: true,
    ataByRallyNo: true,
    ataRecord: true,
    ataRecords: true,
    ataHistory: true,
    stcRecord: true,
    stcRecords: true,
    stcHistory: true,
    marshalRecord: true,
    marshalRecords: true,
    marshalHistory: true,
    openControlRecord: true,
    openControlRecords: true,
    openControlHistory: true,
    startStcRecord: true,
    startStcRecords: true,
    startStcHistory: true,
    coc: true,
    cocData: true,
    cocEntry: true,
    cocEntries: true,
    cocHistory: true,
    results: true,
    resultRows: true,
    downloadedResults: true,
    importedResults: true,
    response: true,
    responses: true,
    responseRows: true,
    formResponses: true,
    pwaResponses: true,
    pwaOperationalResponses: true,
    pwaSubmissions: true,
    submissions: true,
    import: true,
    imports: true,
    imported: true,
    importCache: true,
    importState: true,
    download: true,
    downloads: true,
    downloaded: true,
    downloadCache: true,
    downloadState: true,
    uploadState: true,
    syncState: true,
    runtime: true,
    runtimeState: true,
    liveState: true,
    cardLinks: true,
    controlsCardLinks: true,
    generatedLinks: true,
    formLinks: true,
    lastImportAt: true,
    lastImportedAt: true,
    lastDownloadAt: true,
    lastDownloadedAt: true,
    lastUploadAt: true,
    lastUploadedAt: true,
    lastSyncAt: true,
    lastSyncedAt: true,
    downloadedAt: true,
    uploadedAt: true,
    importedAt: true,
    syncedAt: true
  };

  function templateLooksRuntimeKey(key){
    const k = String(key || "");
    if (TEMPLATE_RUNTIME_DELETE_KEYS[k]) return true;
    if (/^(ata|stc|marshal|openControl|startStc|coc).*(record|records|history|log|logs|result|results)$/i.test(k)) return true;
    if (/(download|import|response|submission|runtime|sync|cache|history|stamp|statusMarker)$/i.test(k)) return true;
    return false;
  }

  function templateScrubRuntimeObject(obj){
    if (Array.isArray(obj)) {
      obj.forEach(function(item){ templateScrubRuntimeObject(item); });
      return obj;
    }
    if (!templateIsPlainObject(obj)) return obj;

    Object.keys(obj).forEach(function(key){
      if (templateLooksRuntimeKey(key)) {
        delete obj[key];
        return;
      }
      templateScrubRuntimeObject(obj[key]);
    });
    return obj;
  }


  // v1.1 — targeted Controls ATA cleanup found during app testing.
  // Controls can persist displayed ATA times in controlsData.days[day].ataData.controls[controlId].ataByRallyNo.
  // Clear ATA payloads only; leave control definitions/ETA/schedule-derived structures untouched.
  function templateClearControlsDataAta(r){
    if (!templateIsPlainObject(r)) return;
    if (!templateIsPlainObject(r.controlsData)) return;

    const days = asObject(r.controlsData.days);
    Object.keys(days).forEach(function(dayKey){
      const dayObj = asObject(days[dayKey]);
      if (templateIsPlainObject(dayObj.ataData)) {
        delete dayObj.ataData;
      }
      // Belt-and-braces: if any control shell survived with ataByRallyNo, clear it.
      if (templateIsPlainObject(dayObj.controls)) {
        Object.keys(dayObj.controls).forEach(function(controlKey){
          const c = asObject(dayObj.controls[controlKey]);
          if (c.ataByRallyNo !== undefined) delete c.ataByRallyNo;
          if (c.ataData !== undefined) delete c.ataData;
          dayObj.controls[controlKey] = c;
        });
      }
      days[dayKey] = dayObj;
    });
    r.controlsData.days = days;
    r.controlsData.meta = Object.assign({}, asObject(r.controlsData.meta), {
      templateAtaResetAt: nowIso()
    });
  }

  // v1.2 — targeted Controls COC cleanup found during app testing.
  // Controls can persist COC entries in controlsData.days[day].cocData.
  // Clear COC entries only; leave control definitions/ETA/schedule-derived structures untouched.
  function templateClearControlsDataCoc(r){
    if (!templateIsPlainObject(r)) return;
    if (!templateIsPlainObject(r.controlsData)) return;

    const days = asObject(r.controlsData.days);
    Object.keys(days).forEach(function(dayKey){
      const dayObj = asObject(days[dayKey]);
      if (dayObj.cocData !== undefined) delete dayObj.cocData;
      if (dayObj.cocEntries !== undefined) delete dayObj.cocEntries;
      if (dayObj.cocHistory !== undefined) delete dayObj.cocHistory;
      if (templateIsPlainObject(dayObj.controls)) {
        Object.keys(dayObj.controls).forEach(function(controlKey){
          const c = asObject(dayObj.controls[controlKey]);
          if (c.cocData !== undefined) delete c.cocData;
          if (c.cocEntries !== undefined) delete c.cocEntries;
          if (c.cocHistory !== undefined) delete c.cocHistory;
          dayObj.controls[controlKey] = c;
        });
      }
      days[dayKey] = dayObj;
    });
    r.controlsData.days = days;
    r.controlsData.meta = Object.assign({}, asObject(r.controlsData.meta), {
      templateCocResetAt: nowIso()
    });
  }

  function templateClearKnownOperationalBranches(r){
    r = asObject(r);

    // Explicit live ATA/COC branches used by Controls cards.
    templateClearControlsDataAta(r);
    templateClearControlsDataCoc(r);

    // Controls page/runtime branch: scrub event data but leave surviving structure in place.
    if (templateIsPlainObject(r.controls)) {
      templateScrubRuntimeObject(r.controls);
      r.controls.meta = Object.assign({}, asObject(r.controls.meta), {
        templateRuntimeResetAt: nowIso()
      });
    }

    // Admin controls mirrors were already rebuilt in templateRebuildAdminEntries(); clear only runtime stamps/status.
    r.admin = asObject(r.admin);
    r.admin.controls = asObject(r.admin.controls);
    templateScrubRuntimeObject(r.admin.controls);
    r.admin.controls.meta = Object.assign({}, asObject(r.admin.controls.meta), {
      templateRuntimeResetAt: nowIso()
    });

    // Preserve organiser/system configuration, but remove operational Google status/download stamps.
    if (templateIsPlainObject(r.admin.google)) {
      [
        "lastUploadAt", "lastDownloadAt", "lastImportAt", "lastSyncAt",
        "adminStatus", "entryStatus", "controlsStatus", "downloadStatus",
        "entriesSheetUrl", "entriesSpreadsheetUrl", "entriesTabUrl",
        "responsesFolderUrl", "responseFolderUrl", "responsesSheetUrl",
        "entryFormUrl", "entrantFormUrl", "formUrl", "formEditUrl",
        "hasAdminEntriesRows", "hasEntriesRows", "entriesRows", "canDownloadEntries"
      ].forEach(function(k){ delete r.admin.google[k]; });
      r.admin.google.templateRuntimeResetAt = nowIso();
    }

    // Common integration/config should remain; only remove known status objects if present.
    if (templateIsPlainObject(r.common)) {
      ["adminStatus", "controlsStatus", "downloadStatus", "lastDownloadAt", "lastImportAt", "lastSyncAt"].forEach(function(k){ delete r.common[k]; });
    }

    r.meta = asObject(r.meta);
    r.meta.templateRuntimeResetAt = nowIso();
    return r;
  }

  function createTemplateFromActiveRally(options){
    options = options || {};
    const title = String(options.title || "").trim().replace(/\s+/g, " ");
    if (!title) throw new Error("Template title is required");

    const key = options.storeKey || TDCore.DEFAULT_STORE_KEY;
    const sourceStore = options.store ? clone(options.store) : readStore(key);
    const td = migrateToCurrent(sourceStore || {});
    td.global = asObject(td.global);
    td.rallies = asObject(td.rallies);

    const sourceRid = activeRallyId(td);
    const sourceRally = td.rallies[sourceRid];
    if (!sourceRid || !sourceRally) throw new Error("Active rally not found");

    const newRid = String(options.rid || generateRallyId(td.rallies));
    const templateRally = clone(sourceRally);
    templateRebuildAdminEntries(templateRally, options.blankRowCount || 10);
    templateClearKnownOperationalBranches(templateRally);

    templateRally.meta = asObject(templateRally.meta);
    templateRally.meta.title = title;
    templateRally.meta.issue = "r001";
    templateRally.meta.rid = newRid;
    templateRally.meta.templateCreatedAt = nowIso();
    templateRally.meta.templateSourceRid = sourceRid;

    td.rallies[newRid] = templateRally;
    td.global.activeRallyId = newRid;
    td.global.lastRallyId = newRid;

    const validation = validateStore(td);
    if (!validation.ok) {
      throw new Error("Template validation failed: " + validation.errors.join("; "));
    }

    const clean = writeStore(td, key);
    clearSaveProtection(newRid);

    const snapshot = exportSnapshot(clean, { version: (options.version || ("TDCore v" + TDCore.VERSION)) });

    return {
      ok: true,
      sourceRid: sourceRid,
      newRid: newRid,
      title: title,
      issue: "r001",
      store: clean,
      validation: validation,
      snapshot: snapshot
    };
  }


function downloadJson(obj, filename){
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "TD_RALLIES_snapshot.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  TDCore.clone = clone;
  TDCore.safeJsonParse = safeJsonParse;
  TDCore.resolveActiveRallyId = resolveActiveRallyId;
  TDCore.activeRallyId = activeRallyId;
  TDCore.normalizeTime = normalizeTime;
  TDCore.migrateToCurrent = migrateToCurrent;
  TDCore.validateStore = validateStore;
  TDCore.importSnapshot = importSnapshot;
  TDCore.exportSnapshot = exportSnapshot;
  TDCore.peekStore = peekStore;
  TDCore.readStore = readStore;
  TDCore.writeStore = writeStore;
  TDCore.deepMerge = deepMerge;
  TDCore.patchStore = patchStore;
  TDCore.patchActiveRally = patchActiveRally;
  TDCore.patchRallySection = patchRallySection;
  TDCore.getActiveRally = getActiveRally;
  TDCore.downloadJson = downloadJson;
  TDCore.generateRallyId = generateRallyId;
  TDCore.createTemplateFromActiveRally = createTemplateFromActiveRally;

  TDCore.updateSessionAfterLoad = updateSessionAfterLoad;
  TDCore.canNormalSave = canNormalSave;
  TDCore.isOlderLoadedFile = isOlderLoadedFile;
  TDCore.getSaveWarning = getSaveWarning;
  TDCore.rehydrateSaveProtection = rehydrateSaveProtection;
  TDCore.clearSaveProtection = clearSaveProtection;
  TDCore.TD_SAVE_PROTECTION_KEY = TD_SAVE_PROTECTION_KEY;


  global.TDCore = TDCore;

})(window);
