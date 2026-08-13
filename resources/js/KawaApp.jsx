import { useState, useEffect, useRef, useReducer } from "react";
  import { startTimerNotification, pauseTimerNotification, clearTimerNotification, requestPermission, reconcileScheduledReminders, getWakeUpAlarmStatus, enableWakeUpAlarm } from './timerNotification';

  // ─── Design Tokens ────────────────────────────────────────────────────────────
  function TaskDetailModal({ task, date, onClose, dispatch }) {
    const [editingTime, setEditingTime] = useState(false);
    const [editTime, setEditTime] = useState(task?.scheduledTime || '');
    const saveTime = () => {
      if (task?.isRecurring) {
        dispatch({ type: 'UPDATE_RECURRING_TIME', id: task.id, scheduledTime: editTime || null });
      } else {
        dispatch({ type: 'UPDATE_TASK_TIME', id: task.id, date, scheduledTime: editTime || null });
      }
      setEditingTime(false);
    };
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div role='dialog' aria-modal='true' style={{ width: '92%', maxWidth: 640, maxHeight: '80vh', overflow: 'auto', borderRadius: 12, background: C.surface, padding: 18, border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>Task</h3>
            <button onClick={onClose} style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: C.textLight }}>×</button>
          </div>
          <div style={{ marginBottom: 12 }}>
            <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 15, color: C.text, margin: 0 }}>{task.text}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: C.textLight }}>#{/* index not available here */}</span>
            {task.scheduledTime && <span style={{ fontSize: 11, color: C.primary, fontWeight: 700 }}>⏰ {fmt12h(task.scheduledTime)}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => { if (task?.isRecurring) { dispatch({ type: 'TOGGLE_RECURRING', id: task.id, date }); } else { dispatch({ type: 'TOGGLE_TASK', id: task.id, date }); } }}>{task.done ? 'Mark Undone' : 'Mark Done'}</Btn>
            <Btn v='danger' onClick={() => { if (task?.isRecurring) { dispatch({ type: 'DELETE_RECURRING', id: task.id }); } else { dispatch({ type: 'DELETE_TASK', id: task.id, date }); } onClose(); }}>Delete</Btn>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {!editingTime ? (
                <button onClick={() => { setEditingTime(true); setEditTime(task.scheduledTime || ''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textLight, fontSize: 11 }}>Edit time</button>
              ) : (
                <>
                  <input type='time' value={editTime} onChange={e => setEditTime(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: `1.5px solid ${C.primary}`, fontSize: 13 }} />
                  <Btn sm onClick={saveTime}>Save</Btn>
                  <button onClick={() => setEditingTime(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textLight }}>Cancel</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Muscle Group Chip Selector ───────────────────────────────────────────────────────────────
  const C = {
    bg: "#f4f6f3",
    surface: "#ffffff",
    alt: "#edf1ec",
    primary: "#3a6647",
    mid: "#5a8c6a",
    pale: "#d8e8da",
    text: "#1b2920",
    textMid: "#5c6e62",
    textLight: "#9aaba0",
    border: "#e0e8e1",
    success: "#45a870",
    warn: "#d4883a",
    white: "#ffffff",
  };

  function localDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const DAY = localDateStr();
  const TODAY_LABEL = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  // Return merged tasks for a date including recurring "daily" tasks
  function getTasksForDate(state, dateStr) {
    const perDay = (state.tasks && state.tasks[dateStr]) ? state.tasks[dateStr] : [];
    // Only include recurring tasks that start on-or-before the requested date
    const recurring = (state.recurringTasks || []).filter(r => r && r.repeat === 'daily' && (!r.startDate || r.startDate <= dateStr));
    const perDayRecurringIds = new Set((perDay || []).filter(t => t.recurringInstanceOf).map(t => t.recurringInstanceOf));
    const mergedRecurring = recurring.filter(r => !perDayRecurringIds.has(r.id)).map(r => ({ ...r, isRecurring: true }));
    return [...perDay, ...mergedRecurring];
  }
  const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const clamp = (v, mn, mx) => Math.min(Math.max(v, mn), mx);
  const WORKOUT_TYPES = ["walk", "gym", "stretch", "other"];
  const MIN_WORKOUT_MINS = 30;
  const MIN_WORKOUT_SECS = MIN_WORKOUT_MINS * 60;

  function titleize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function fmtClock(value) {
    if (!value) return "—";
    return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function getWeekKey(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const w1 = new Date(d.getFullYear(), 0, 4);
    const wk = 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${String(wk).padStart(2, "0")}`;
  }
  const WEEK = getWeekKey();

  function getWeekLabel(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt2 = (dt) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt2(monday)} – ${fmt2(sunday)}`;
  }

  function getWorkoutTypeLabel(entry) {
    if (!entry) return "Walk";
    return entry.type === "other" ? (entry.customType?.trim() || "Other") : titleize(entry.type);
  }

  function getWorkoutElapsedSecs(workout, nowMs) {
    const accumulated = workout?.accumulatedSecs || 0;
    if (workout?.status === "running" && workout?.sessionStartedAt) {
      const sessionSecs = Math.floor(((nowMs || Date.now()) - new Date(workout.sessionStartedAt)) / 1000);
      return accumulated + Math.max(0, sessionSecs);
    }
    return accumulated;
  }

  function finalizeWorkoutEntry(entry) {
    const durationMins = Math.max(0, entry?.durationMins || 0);
    return {
      ...entry,
      durationMins,
      status: durationMins >= MIN_WORKOUT_MINS ? "completed" : "incomplete",
    };
  }

  function createWorkoutEntry(overrides = {}) {
    return {
      id: uid(),
      name: "",
      exerciseType: "reps",
      reps: null,
      sets: [],
      durationSecs: 60,
      weight: null,
      weightUnit: "kg",
      timerSecs: 60,
      timerRemainingSecs: 60,
      timerRunning: false,
      timerStartedAt: null,
      completed: false,
      completedAt: null,
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function createWorkoutDay(overrides = {}) {
    return {
      draft: createWorkoutEntry(),
      entries: [],
      ...overrides,
    };
  }

  function normalizeWorkoutEntry(entry, opts = {}) {
    if (!entry || typeof entry !== "object") return null;
    const { allowLegacySetsConversion = true } = opts;
    const e = { ...createWorkoutEntry(), ...entry };
    if (e.durationMins && !e.durationSecs) e.durationSecs = Number(e.durationMins) * 60;
    if (e.status === "completed") e.completed = true;
    e.id = e.id || uid();
    e.updatedAt = e.updatedAt || new Date().toISOString();
    e.timerSecs = Number(e.timerSecs || 0);
    e.timerRemainingSecs = Number(e.timerRemainingSecs ?? e.timerSecs);
    e.durationSecs = Number(e.durationSecs || 0);
    e.reps = e.reps ?? null;
    if (allowLegacySetsConversion) {
      if (!Array.isArray(e.sets) || e.sets.length === 0) {
        if (e.reps != null || e.weight != null) {
          e.sets = [{ id: uid(), reps: e.reps ?? null, weight: e.weight ?? null, weightUnit: e.weightUnit || "kg" }];
        } else {
          e.sets = [];
        }
      }
    } else {
      e.sets = Array.isArray(e.sets) ? e.sets : [];
    }
    e.sets = (e.sets || []).map((s) => ({ id: s.id || uid(), reps: s.reps ?? null, weight: s.weight ?? null, weightUnit: s.weightUnit || 'kg' }));
    e.reps = e.reps ?? (e.sets.length ? e.sets[0].reps : null);
    return e;
  }

  function getWorkoutDayEntries(day) {
    return Array.isArray(day?.entries) ? day.entries : [];
  }

  function getWorkoutDayDraft(day) {
    return day?.draft ? normalizeWorkoutEntry(day.draft, { allowLegacySetsConversion: false }) || createWorkoutEntry() : createWorkoutEntry();
  }

  function dayHasCompletedWorkout(day) {
    return getWorkoutDayEntries(day).some((entry) => entry?.completed);
  }

  function dayHasAnyWorkout(day) {
    const entries = getWorkoutDayEntries(day);
    if (entries.length > 0) return true;
    const draft = getWorkoutDayDraft(day);
    return !!draft.name.trim();
  }

  function normalizeWorkoutDay(day) {
    if (!day || typeof day !== "object") return null;
    if ("entries" in day || "draft" in day) {
      const entries = Array.isArray(day.entries)
        ? day.entries.map((entry) => normalizeWorkoutEntry(entry)).filter(Boolean)
        : [];
      const draft = getWorkoutDayDraft(day);
      return createWorkoutDay({ draft, entries });
    }
    const normalizedEntry = normalizeWorkoutEntry(day);
    if (!normalizedEntry) return null;
    if (normalizedEntry.completed) {
      return createWorkoutDay({ entries: [normalizedEntry], draft: createWorkoutEntry() });
    }
    return createWorkoutDay({ draft: normalizedEntry, entries: [] });
  }

  function computeWorkoutStreak(history) {
    const raw = history || {};
    let streak = 0;
    const date = new Date();
    while (true) {
      const key = localDateStr(date);
      const day = raw[key];
      if (day && dayHasCompletedWorkout(day)) {
        streak += 1;
        date.setDate(date.getDate() - 1);
        continue;
      }
      break;
    }
    return streak;
  }

  function getTodayWorkoutDay(history) {
    return normalizeWorkoutDay(history?.[DAY]) || createWorkoutDay();
  }

  function updateTodayWorkoutDraft(history, updater) {
    const currentDay = getTodayWorkoutDay(history);
    return {
      ...history,
      [DAY]: {
        ...currentDay,
        draft: updater(currentDay.draft),
      },
    };
  }

  function normalizeWorkout(savedWorkout) {
    const raw = savedWorkout || {};
    const rawHistory = raw.history && typeof raw.history === "object" ? raw.history : {};
    const history = Object.fromEntries(
      Object.entries(rawHistory)
        .map(([date, day]) => [date, normalizeWorkoutDay(day)])
        .filter(([, day]) => !!day)
    );
    const streak = computeWorkoutStreak(history);
    return { streak, history, lastActiveDay: typeof raw.lastActiveDay === "string" ? raw.lastActiveDay : DAY };
  }

  function getWorkoutTimerRemaining(entry, nowMs) {
    if (!entry) return 0;
    const now = nowMs || Date.now();
    if (entry.timerRunning && entry.timerStartedAt) {
      const elapsed = Math.floor((now - new Date(entry.timerStartedAt).getTime()) / 1000);
      const remaining = Math.max(0, (entry.timerRemainingSecs ?? entry.timerSecs) - elapsed);
      return remaining;
    }
    return Number(entry.timerRemainingSecs ?? entry.timerSecs ?? 0);
  }

  function formatWorkoutDuration(secs) {
    return fmt(Math.max(0, Number(secs || 0)));
  }

  function getWorkoutDetail(entry) {
    if (!entry) return "";
    if (entry.exerciseType === "time") return formatWorkoutDuration(entry.durationSecs);
    if (Array.isArray(entry.sets) && entry.sets.length > 0) {
      if (entry.sets.length === 1) {
        const s = entry.sets[0];
        return `${s.reps || "?"} reps${s.weight ? ` @${s.weight}${s.weightUnit || ""}` : ""}`;
      }
      return `${entry.sets.length} sets: ` + entry.sets.map((s) => `${s.reps || "?"}${s.weight ? `@${s.weight}${s.weightUnit || ""}` : ""}`).join(", ");
    }
    return `${entry.reps || "?"} reps`;
  }

  function getWorkoutSummary(entry) {
    if (!entry) return "";
    if (entry.name && entry.name.trim()) return entry.name.trim();
    if (entry.exerciseType === "time") return `${formatWorkoutDuration(entry.durationSecs)}`;
    if (Array.isArray(entry.sets) && entry.sets.length > 0) {
      if (entry.sets.length === 1) {
        const s = entry.sets[0];
        return `${s.reps || "?"} reps${s.weight ? ` @${s.weight}${s.weightUnit || ""}` : ""}`;
      }
      return `${entry.sets.length} sets`;
    }
    return `${entry.reps || "?"} reps`;
  }

  // ─── Muscle Group Config ──────────────────────────────────────────────────────
  const MUSCLE_GROUPS = [
    { key: "push",      label: "Push",          abbr: "PSH", color: "#e8673a" },
    { key: "pull",      label: "Pull",          abbr: "PUL", color: "#3a7fd4" },
    { key: "legs",      label: "Legs",          abbr: "LEG", color: "#8b5cf6" },
    { key: "upper",     label: "Upper",         abbr: "UPR", color: "#d4883a" },
    { key: "lower",     label: "Lower",         abbr: "LWR", color: "#a855f7" },
    { key: "full",      label: "Full Body",     abbr: "FB",  color: "#45a870" },
    { key: "cb",        label: "Chest / Back",  abbr: "C/B", color: "#e8453a" },
    { key: "sa",        label: "Shldrs / Arms", abbr: "S/A", color: "#0891b2" },
    { key: "push_pull", label: "Push + Pull",   abbr: "P+P", color: "#7c3aed" },
    { key: "push_legs", label: "Push + Legs",   abbr: "P+L", color: "#b45309" },
    { key: "pull_legs", label: "Pull + Legs",   abbr: "L+L", color: "#047857" },
  ];

  function getMuscleGroup(key) {
    return MUSCLE_GROUPS.find((g) => g.key === key) || null;
  }

  // ─── Micro Components ─────────────────────────────────────────────────────────
  function Ring({ pct = 0, size = 72, sw = 5, color, label, sub }) {
    color = color || C.primary;
    const r = (size - sw * 2) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - clamp(pct / 100, 0, 1) * circ;
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} stroke={C.pale} strokeWidth={sw} fill="none" />
          <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={sw} fill="none"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset .5s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 1 }}>
          {label != null && (
            <span style={{ fontSize: size > 56 ? 13 : 10, fontWeight: 700, color: C.text, lineHeight: 1 }}>
              {label}
            </span>
          )}
          {sub && (
            <span style={{ fontSize: 7, color: C.textLight, letterSpacing: ".06em",
                textTransform: "uppercase", marginTop: 1 }}>{sub}</span>
          )}
        </div>
      </div>
    );
  }

  const Card = ({ children, style: sx = {} }) => (
    <div style={{ background: C.surface, borderRadius: 16, padding: "16px",
        border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(20,50,30,.05)", ...sx }}>
      {children}
    </div>
  );

  function Btn({ children, onClick, v = "primary", sm, disabled, style: sx = {} }) {
    const [pressed, setPressed] = useState(false);
    const base = {
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
      padding: sm ? "7px 13px" : "10px 20px",
      minHeight: sm ? 32 : 40,
      minWidth: sm ? 0 : 104,
      borderRadius: 100, border: "none", cursor: disabled ? "not-allowed" : "pointer",
      fontSize: sm ? 11 : 13, fontWeight: 600, fontFamily: "inherit",
      transition: "opacity .15s, transform .12s ease, box-shadow .12s ease",
      opacity: disabled ? 0.45 : 1,
      transform: pressed && !disabled ? "scale(.98)" : "scale(1)",
      boxShadow: pressed && !disabled ? "inset 0 1px 3px rgba(20,50,30,.18)" : "none",
      touchAction: "manipulation",
      ...sx,
    };
    const vs = {
      primary: { ...base, background: C.primary, color: "#fff" },
      ghost: { ...base, background: "transparent", color: C.primary, border: `1.5px solid ${C.border}` },
      soft: { ...base, background: C.pale, color: C.primary },
      success: { ...base, background: C.success, color: "#fff" },
      danger: { ...base, background: "#fce8e6", color: "#c0392b" },
    };
    return (
      <button
        style={vs[v] || vs.primary}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        onPointerDown={() => !disabled && setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
      >
        {children}
      </button>
    );
  }

  const Label = ({ children }) => (
    <p style={{ fontSize: 10, color: C.textLight, letterSpacing: ".1em", textTransform: "uppercase",
        fontWeight: 700, marginBottom: 8 }}>{children}</p>
  );

  // ─── Logo ─────────────────────────────────────────────────────────────────────
  const KawaLogo = ({ size = 30 }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: size, height: size, background: C.primary, borderRadius: size * 0.32,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={size * 0.55} height={size * 0.72} viewBox="0 0 11 13" fill="none">
          <rect x="4.8" y="0" width="1.4" height="13" rx=".7" fill="rgba(255,255,255,.9)" />
          <rect x="1" y="4" width="9" height="1.2" rx=".6" fill="rgba(255,255,255,.65)" />
          <rect x="1" y="8.2" width="9" height="1.2" rx=".6" fill="rgba(255,255,255,.65)" />
        </svg>
      </div>
      <span style={{ fontSize: size * 0.63, fontWeight: 800, color: C.primary, letterSpacing: "-.04em",
          fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>kawa</span>
    </div>
  );

  // ─── Timer Hook ───────────────────────────────────────────────────────────────
  function useTimer(init, label = "Timer") {
    const [secs, setSecs] = useState(init);
    const [running, setRunning] = useState(false);
    const ref = useRef(null);
    const endTimeRef = useRef(null);

    useEffect(() => {
      if (running) {
        endTimeRef.current = Date.now() + (secs * 1000);
        startTimerNotification(label, secs);
        ref.current = setInterval(() => {
          const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
          setSecs(remaining);
          if (remaining <= 0) {
            clearInterval(ref.current);
            setRunning(false);
            clearTimerNotification();
          }
        }, 500);
      }
      return () => clearInterval(ref.current);
    }, [running]);

    return {
      secs,
      running,
      start: () => { if (secs > 0) setRunning(true); },
      pause: () => { setRunning(false); pauseTimerNotification(); },
      reset: (v) => {
        clearInterval(ref.current);
        setRunning(false);
        clearTimerNotification();
        setSecs(v !== undefined ? v : init);
        endTimeRef.current = null;
      },
    };
  }

  // ─── Bamboo Grove Visual ──────────────────────────────────────────────────────
  function BambooGrove({ days }) {
    const W = 390, H = 220, ground = H - 32;
    const hour = new Date().getHours();
    const isNight = hour < 5 || hour >= 20;
    const isDusk = (hour >= 17 && hour < 20) || (hour >= 5 && hour < 7);

    const skyColors = () => {
      if (isNight && days >= 365) return ["#0a1a12", "#152a1e"];
      if (isDusk && days >= 90)   return ["#6b3a1f", "#c4783a"];
      if (days < 7)   return ["#c8e6d4", "#e8f5ed"];
      if (days < 30)  return ["#b0d9c4", "#d8eedd"];
      if (days < 90)  return ["#90c8a8", "#c0e0c8"];
      if (days < 180) return ["#72b490", "#a8d4b4"];
      if (days < 365) return ["#509870", "#88c4a0"];
      if (days < 730) return ["#347850", "#68a87c"];
      if (days < 1095) return ["#1e5838", "#4a8860"];
      if (days < 1460) return ["#163d28", "#326448"];
      if (days < 1825) return ["#0e2a1c", "#204030"];
      return ["#091a10", "#122518"];
    };
    const [skyTop, skyBot] = skyColors();

    const stalkCol = () => { const t = Math.min(1, days/1095); return `rgb(${Math.round(165-90*t)},${Math.round(210-80*t)},${Math.round(90-50*t)})`; };
    const nodeCol  = () => { const t = Math.min(1, days/1095); return `rgb(${Math.round(120-80*t)},${Math.round(165-80*t)},${Math.round(60-40*t)})`; };
    const leafCol  = () => { if (days<365) return "#4aaa64"; if (days<1095) return "#338848"; if (days<2190) return "#226634"; return "#164d24"; };

    const STALKS = [
      {x:195,mH:155,aD:7,   gD:55,th:7.5},{x:162,mH:135,aD:30,  gD:48,th:6  },{x:228,mH:145,aD:55,  gD:48,th:6.5},
      {x:135,mH:125,aD:85,  gD:42,th:5  },{x:252,mH:138,aD:115, gD:42,th:5.5},{x:112,mH:118,aD:175, gD:38,th:4.5},
      {x:275,mH:132,aD:235, gD:38,th:5  },{x:92, mH:112,aD:330, gD:55,th:4  },{x:298,mH:128,aD:420, gD:55,th:4.5},
      {x:72, mH:108,aD:512, gD:55,th:3.5},{x:318,mH:122,aD:600, gD:55,th:4  },{x:52, mH:102,aD:700, gD:55,th:3  },
      {x:338,mH:118,aD:800, gD:55,th:3.5},{x:35, mH:96, aD:900, gD:55,th:3  },{x:355,mH:114,aD:1000,gD:55,th:3.5},
      {x:18, mH:90, aD:1095,gD:60,th:2.5},{x:372,mH:108,aD:1200,gD:60,th:3  },{x:178,mH:165,aD:1460,gD:75,th:8.5},
      {x:212,mH:160,aD:1640,gD:75,th:8  },{x:148,mH:150,aD:1825,gD:75,th:7  },{x:242,mH:155,aD:2000,gD:75,th:7  },
      {x:125,mH:144,aD:2190,gD:75,th:6  },{x:265,mH:150,aD:2380,gD:75,th:6  },{x:105,mH:138,aD:2555,gD:75,th:5  },
      {x:285,mH:144,aD:2740,gD:75,th:5  },{x:85, mH:132,aD:2920,gD:75,th:4  },{x:305,mH:138,aD:3105,gD:75,th:4  },
      {x:65, mH:126,aD:3285,gD:75,th:3.5},{x:325,mH:132,aD:3470,gD:75,th:3.5},{x:195,mH:175,aD:3650,gD:90,th:10 },
    ];

    const stalkH = (s) => days < s.aD ? 0 : s.mH * Math.min(1, (days - s.aD) / s.gD);
    const sway   = (s) => (s.x - W/2) / (W/2) * (stalkH(s) / s.mH) * 8;

    const renderStalk = (s, idx) => {
      const h = stalkH(s); if (h < 2) return null;
      const segH = 22, numSegs = Math.max(1, Math.floor(h / segH));
      const topX = s.x + sway(s);
      const sc = stalkCol(), nc = nodeCol(), lc = leafCol();
      const leafDensity = days < s.aD + 20 ? 0 : Math.min(1, (days - s.aD - 20) / 80);
      const parts = [];
      for (let seg = 0; seg <= numSegs; seg++) {
        const t = seg / numSegs;
        const segX = s.x + (topX - s.x) * t;
        const segY = ground - seg * segH;
        if (segY < ground - h) break;
        const prevY = Math.max(ground - h, ground - (seg + 1) * segH);
        const tw = Math.max(1.2, s.th * (1 - t * 0.28));
        parts.push(<rect key={`s${idx}b${seg}`} x={segX-tw/2} y={prevY} width={tw} height={segY-prevY} rx={tw/3} fill={sc} />);
        if (seg > 0 && segY > ground - h + 2)
          parts.push(<rect key={`s${idx}n${seg}`} x={segX-tw/2-1} y={segY-2} width={tw+2} height={3} rx={1} fill={nc} />);
        if (leafDensity > 0 && seg > 0 && seg <= numSegs) {
          const leafCount = Math.min(seg, Math.ceil(leafDensity * 2));
          for (let l = 0; l < leafCount; l++) {
            const side = ((seg+l+idx)%2===0) ? 1 : -1;
            const ll = 16 + Math.sin(idx*2.7+seg*1.4)*7;
            const la = (25 + Math.sin(idx*1.9+l*2.1)*12) * Math.PI/180;
            const ex = segX + side*Math.cos(la)*ll, ey = segY - Math.sin(la)*ll*0.55;
            const cpx = segX + side*Math.cos(la)*ll*0.55, cpy = segY - 5;
            parts.push(<path key={`s${idx}l${seg}${l}`} d={`M${segX},${segY} Q${cpx},${cpy} ${ex},${ey} Q${cpx},${cpy+3} ${segX},${segY}`} fill={lc} opacity={0.65+leafDensity*0.3} />);
          }
        }
      }
      return <g key={`stalk${idx}`}>{parts}</g>;
    };

    const renderSprout = () => {
      if (days >= 7) return null;
      if (days === 0) return <ellipse cx={W/2} cy={ground-2} rx={4} ry={2.5} fill="#4a9e64" opacity={0.5} />;
      const sh = 5 + days * 7;
      return <g><line x1={W/2} y1={ground} x2={W/2} y2={ground-sh} stroke="#5aac6c" strokeWidth={2} strokeLinecap="round"/><path d={`M${W/2} ${ground-sh} Q${W/2+9} ${ground-sh-5} ${W/2+13} ${ground-sh-13}`} stroke="#4a9e5c" strokeWidth={1.5} fill="none" strokeLinecap="round"/></g>;
    };

    const renderMoon = () => {
      if (days < 365) return null;
      const op = Math.min(0.92, (days-365)/180*0.92), phase = days%29;
      const mf = days >= 1825 ? "#fffde0" : "#e8f0e0";
      return <g opacity={op}><circle cx={345} cy={28} r={15} fill={mf}/>{phase<15?<circle cx={351} cy={28} r={12} fill={skyTop}/>:<circle cx={339} cy={28} r={12} fill={skyTop}/>}{days>=1095&&<circle cx={345} cy={28} r={20} fill="none" stroke={mf} strokeWidth={1} opacity={0.3}/>}</g>;
    };

    const renderStars = () => {
      if (days < 2920 || !isNight) return null;
      const op = Math.min(0.85, (days-2920)/280*0.85);
      return [[22,12],[65,22],[118,8],[195,18],[258,6],[312,20],[378,10],[42,38],[98,32],[168,28],[228,36],[285,24],[358,32],[8,50],[145,42]].map(([sx,sy],i)=><circle key={`st${i}`} cx={sx} cy={sy} r={0.8+(i%3)*0.5} fill="#fffde7" opacity={op*(0.4+(i%3)*0.2)}/>);
    };

    const renderBgStalks = () => {
      if (days < 730) return null;
      const op = Math.min(0.35, (days-730)/500*0.35);
      return [{x:28,h:75},{x:78,h:90},{x:342,h:82},{x:368,h:70},{x:12,h:60},{x:382,h:65}].map(({x,h},i)=><rect key={`bg${i}`} x={x-1.5} y={ground-h} width={3} height={h} rx={1.5} fill="#1a3d28" opacity={op}/>);
    };

    const renderMist = () => {
      if (days < 270) return null;
      const op = Math.min(0.28, (days-270)/400*0.28);
      return <><ellipse cx={W/2} cy={ground-18} rx={W*0.62} ry={22} fill="white" opacity={op}/><ellipse cx={W*0.3} cy={ground-8} rx={W*0.38} ry={13} fill="white" opacity={op*0.65}/><ellipse cx={W*0.72} cy={ground-13} rx={W*0.32} ry={16} fill="white" opacity={op*0.55}/></>;
    };

    const renderGround = () => {
      const mossOp = Math.min(0.9, days/160), rootOp = Math.min(0.65, Math.max(0,(days-365)/200)), stoneOp = Math.min(0.75, Math.max(0,(days-180)/180));
      return <>
        <rect x={0} y={ground} width={W} height={H-ground} fill="#3a2818"/>
        <rect x={0} y={ground-3} width={W} height={5} fill={`rgba(52,92,62,${mossOp})`} rx={2}/>
        {rootOp>0&&[180,155,215,130,245].map((rx,i)=><path key={`r${i}`} d={`M${rx},${ground} Q${rx+(i%2?14:-14)},${ground+8} ${rx+(i%2?24:-24)},${ground+5}`} stroke="#2a1808" strokeWidth={1.5} fill="none" opacity={rootOp}/>)}
        {stoneOp>0&&<><ellipse cx={98} cy={ground+6} rx={11} ry={5} fill="#556" opacity={stoneOp}/><ellipse cx={292} cy={ground+5} rx={8} ry={4} fill="#667" opacity={stoneOp*0.8}/>{days>=730&&<ellipse cx={48} cy={ground+7} rx={6} ry={3.5} fill="#4a4a55" opacity={stoneOp}/>}{days>=1095&&<ellipse cx={342} cy={ground+6} rx={7} ry={4} fill="#555" opacity={stoneOp*0.7}/>}</>}
      </>;
    };

    const renderLantern = () => {
      if (days < 365) return null;
      const op = Math.min(1, (days-365)/120), lx = 44;
      return <g opacity={op}><rect x={lx-1} y={ground-38} width={2} height={38} fill="#2a1808"/><rect x={lx-8} y={ground-42} width={16} height={20} rx={3} fill="#b87020"/><rect x={lx-6} y={ground-40} width={12} height={16} rx={2} fill="#ffcc44" opacity={0.55}/><rect x={lx-10} y={ground-44} width={20} height={3} rx={1} fill="#2a1808"/><ellipse cx={lx} cy={ground-22} rx={10} ry={2} fill="#ffaa22" opacity={0.15}/></g>;
    };

    const renderPagoda = () => {
      if (days < 1825) return null;
      const op = Math.min(0.55, (days-1825)/300*0.55), px=338, py=ground-72;
      return <g opacity={op} fill="#162a1c"><rect x={px-7} y={py+52} width={14} height={20}/><polygon points={`${px-12},${py+52} ${px+12},${py+52} ${px},${py+36}`}/><rect x={px-5} y={py+24} width={10} height={13}/><polygon points={`${px-10},${py+24} ${px+10},${py+24} ${px},${py+11}`}/><rect x={px-3} y={py+4} width={6} height={8}/><polygon points={`${px-7},${py+4} ${px+7},${py+4} ${px},${py}`}/></g>;
    };

    const renderWater = () => {
      if (days < 2555) return null;
      const op = Math.min(0.5, (days-2555)/360*0.5);
      return <g opacity={op}><rect x={0} y={ground+14} width={W} height={7} fill="#1a5880" rx={2}/><rect x={0} y={ground+16} width={W} height={2} fill="#2a78b8" opacity={0.5}/>{[20,80,160,240,320,380].map((wx,i)=><path key={`w${i}`} d={`M${wx},${ground+15} Q${wx+12},${ground+13} ${wx+24},${ground+15}`} stroke="#5aacee" strokeWidth={0.8} fill="none" opacity={0.4}/>)}</g>;
    };

    const renderGolden = () => {
      if (days < 3650) return null;
      return [[30,25],[85,15],[155,35],[240,10],[300,28],[360,18],[45,55],[185,45],[330,50]].map(([gx,gy],i)=><circle key={`gp${i}`} cx={gx} cy={gy} r={1.2+(i%3)*0.6} fill="#ffd700" opacity={0.7+(i%2)*0.15}/>);
    };

    const renderSnow = () => {
      if (days < 3285) return null;
      const op = Math.min(0.6, (days-3285)/300*0.6);
      return [[40,18],[110,8],[200,22],[290,12],[360,20],[70,40],[170,35],[320,38]].map(([sx,sy],i)=><circle key={`sn${i}`} cx={sx} cy={sy} r={1.5+(i%2)} fill="white" opacity={op*(0.5+i%3*0.15)}/>);
    };

    const phaseLabel = () => {
      if (days===0) return "Plant your seed"; if (days<7) return "Sprouting…"; if (days<30) return "First growth";
      if (days<90) return "Taking root"; if (days<180) return "Young grove"; if (days<365) return "Growing strong";
      if (days<730) return "Mature grove"; if (days<1095) return "Deep forest"; if (days<1460) return "Ancient wood";
      if (days<1825) return "Sacred grove"; if (days<2190) return "Mystical forest"; if (days<2555) return "Eternal grove";
      if (days<2920) return "Legendary realm"; if (days<3285) return "Celestial forest"; if (days<3650) return "Beyond time";
      return "Master's sanctuary 🐉";
    };

    const years = Math.floor(days/365), remDays = days%365;

    return (
      <div style={{ borderRadius:16, overflow:"hidden", marginBottom:14, border:`1px solid ${C.border}`, boxShadow:"0 2px 10px rgba(20,50,30,.12)" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={{ display:"block" }}>
          <defs><linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={skyTop}/><stop offset="100%" stopColor={skyBot}/></linearGradient></defs>
          <rect x={0} y={0} width={W} height={H} fill="url(#skyGrad)"/>
          {renderStars()}{renderMoon()}{renderPagoda()}{renderBgStalks()}{renderMist()}
          {STALKS.map((s,i)=>({s,i,dist:Math.abs(s.x-W/2)})).sort((a,b)=>b.dist-a.dist).map(({s,i})=>renderStalk(s,i))}
          {renderSprout()}{renderLantern()}{renderGround()}{renderWater()}{renderSnow()}{renderGolden()}
        </svg>
        <div style={{ background:`linear-gradient(135deg, ${C.primary} 0%, #1e4530 100%)`, padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <p style={{ color:"rgba(255,255,255,.55)", fontSize:9, letterSpacing:".12em", textTransform:"uppercase", marginBottom:2 }}>Your Bamboo Grove</p>
            <p style={{ color:"#fff", fontSize:12, fontWeight:700 }}>{phaseLabel()}</p>
          </div>
          <div style={{ textAlign:"right" }}>
            <span style={{ fontSize:26, fontWeight:800, color:"#fff", lineHeight:1, fontFamily:"'Syne',sans-serif" }}>{days}</span>
            <span style={{ fontSize:10, color:"rgba(255,255,255,.5)", marginLeft:4 }}>days</span>
            {years>0&&<p style={{ fontSize:9, color:"rgba(255,255,255,.45)", marginTop:1 }}>{years}yr {remDays}d</p>}
          </div>
        </div>
      </div>
    );
  }

  // ─── Home View ────────────────────────────────────────────────────────────────
  function HomeView({ state, dispatch }) {
    const todayTasks = getTasksForDate(state, DAY);
    const doneTasks = todayTasks.filter((t) => t.done).length;
    const todayR = state.routine.history[DAY] || {};
    const routineDone = [todayR.move, todayR.reflect, todayR.grow].filter(Boolean).length;
    const focusMins = state.focus.sessions[DAY] || 0;
    const maxStreak = Math.max(state.routine.streak, state.focus.streak, state.workout.streak, 0);
    const [now, setNow] = useState(Date.now());
    const [alarmStatus, setAlarmStatus] = useState(null);
    const [enablingAlarm, setEnablingAlarm] = useState(false);
    const workoutDay = getTodayWorkoutDay(state.workout.history);
    const workoutEntries = getWorkoutDayEntries(workoutDay);
    const workoutDraft = getWorkoutDayDraft(workoutDay);
    useEffect(() => {
      const running = workoutDraft.timerRunning || workoutEntries.some(e => e.timerRunning);
      if (!running) return;
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }, [state.workout.history]);
    useEffect(() => {
      let active = true;
      getWakeUpAlarmStatus().then((status) => {
        if (active) setAlarmStatus(status);
      });
      return () => { active = false; };
    }, []);
    const handleEnableAlarm = async () => {
      setEnablingAlarm(true);
      const status = await enableWakeUpAlarm();
      setAlarmStatus(status);
      if (status.ready) await reconcileScheduledReminders(state);
      setEnablingAlarm(false);
    };
    const workoutPct = workoutEntries.length > 0 ? 100 : workoutDraft.name.trim() ? 45 : 0;
    const workoutVal = workoutEntries.length > 0 ? String(workoutEntries.length) : workoutDraft.name.trim() ? "Set" : "—";
    const workoutCol = workoutEntries.length > 0 ? C.success : workoutDraft.name.trim() ? C.mid : C.primary;
    const QUOTES = ["Own your morning. Elevate your life.","Small daily improvements lead to stunning results.","Consistency is the mother of mastery.","Your future is hidden in your daily routine.","Invest in yourself — it pays the best interest.","Rise early. Work hard. Stay disciplined.","The quality of your practice defines your performance."];
    const quote = QUOTES[new Date().getDay() % QUOTES.length];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    return (
      <div style={{ padding:"0 20px 100px" }}>
        <div style={{ paddingTop:52, paddingBottom:12 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
            <KawaLogo />
            <div style={{ minWidth:118, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5 }}>
              <span style={{ fontSize:9, color:C.textLight, letterSpacing:".1em", textTransform:"uppercase", fontWeight:700 }}>Wake Up</span>
              <input
                type="time"
                value={state.profile.wakeUpTime || ""}
                onChange={(e) => dispatch({ type:"SET_WAKE_UP_TIME", wakeUpTime:e.target.value })}
                aria-label="Wake up time"
                style={{ width:"100%", padding:"7px 10px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:12, fontFamily:"inherit", color:C.text, outline:"none", background:C.surface, textAlign:"right" }}
              />
              {alarmStatus?.supported && (
                alarmStatus.ready ? (
                  <span style={{ fontSize:9, color:C.success, fontWeight:700 }}>Alarm enabled</span>
                ) : (
                  <button onClick={handleEnableAlarm} disabled={enablingAlarm} style={{ border:0, background:"none", color:C.primary, fontSize:9, fontWeight:800, padding:0, cursor:"pointer", textDecoration:"underline" }}>
                    {enablingAlarm ? "Opening settings..." : "Enable alarm"}
                  </button>
                )
              )}
            </div>
          </div>
          <p style={{ fontSize:11, color:C.textMid, letterSpacing:".08em", textTransform:"uppercase", marginTop:16, marginBottom:4 }}>{TODAY_LABEL}</p>
          <h1 style={{ fontSize:24, fontWeight:800, color:C.text, letterSpacing:"-.03em", lineHeight:1.2, fontFamily:"'Syne', sans-serif" }}>{greeting}, {state.profile.name} 🌿</h1>
        </div>
        <div style={{ background:`linear-gradient(135deg, ${C.primary} 0%, #2a4f38 100%)`, borderRadius:20, padding:"20px 22px", marginTop:14, marginBottom:14, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", fontSize:72, opacity:0.08, fontFamily:"serif", lineHeight:1, pointerEvents:"none" }}>竹</div>
          <p style={{ color:"rgba(255,255,255,.6)", fontSize:9, letterSpacing:".12em", textTransform:"uppercase", marginBottom:6 }}>Current Streak</p>
          <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
            <span style={{ fontSize:52, fontWeight:800, color:"#fff", lineHeight:1, fontFamily:"'Syne', sans-serif" }}>{maxStreak}</span>
            <span style={{ fontSize:14, color:"rgba(255,255,255,.55)" }}>days</span>
          </div>
          <p style={{ color:"rgba(255,255,255,.45)", fontSize:11, marginTop:6 }}>{maxStreak===0?"Start your journey today":maxStreak>=21?"You're unstoppable 🔥":maxStreak>=7?"Great momentum 💪":"Keep going!"}</p>
        </div>
        <div style={{ padding:"11px 14px", borderLeft:`3px solid ${C.mid}`, background:C.pale, borderRadius:"0 10px 10px 0", marginBottom:16 }}>
          <p style={{ color:C.text, fontSize:12, fontStyle:"italic", lineHeight:1.6, margin:0, opacity:0.75 }}>"{quote}"</p>
        </div>
        <Label>Today's Progress</Label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
          {[
            { lbl:"Routine", pct:(routineDone/3)*100, val:`${routineDone}/3`, col:C.primary },
            { lbl:"Tasks", pct:todayTasks.length?(doneTasks/todayTasks.length)*100:0, val:`${doneTasks}/${todayTasks.length||5}`, col:C.mid },
            { lbl:"Focus", pct:clamp((focusMins/90)*100,0,100), val:focusMins?`${focusMins}m`:"—", col:focusMins>=90?C.success:C.primary },
            { lbl:"Workout", pct:workoutPct, val:workoutVal, col:workoutCol },
          ].map(({lbl,pct,val,col})=>(
            <Card key={lbl} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"12px 6px" }}>
              <Ring pct={pct} size={52} sw={4} color={col} label={val} />
              <span style={{ fontSize:9, color:C.textMid, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase" }}>{lbl}</span>
            </Card>
          ))}
        </div>
        {state.habits.length > 0 && (
          <>
            <Label>Habits</Label>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {state.habits.map((h) => {
                const done = !!h.history[DAY];
                return (
                  <Card key={h.id} style={{ display:"flex", alignItems:"center", padding:"10px 14px", gap:10 }}>
                    <button onClick={() => dispatch({ type:"TOGGLE_HABIT", id:h.id })} style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, border:`2px solid ${done?C.success:C.border}`, background:done?C.success:"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", fontSize:10, padding:0 }}>{done?"✓":""}</button>
                    <span style={{ flex:1, fontSize:13, color:done?C.textMid:C.text, textDecoration:done?"line-through":"none" }}>{h.name}</span>
                    <span style={{ fontSize:11, color:C.textLight }}>🔥 {h.streak}</span>
                  </Card>
                );
              })}
            </div>
          </>
        )}
        <JoySessionsSection state={state} dispatch={dispatch} />
      </div>
    );
  }

  // ─── Joy Sessions Section ─────────────────────────────────────────────────────
  function getWeekDays() {
    const today = new Date(), day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day===0?6:day-1));
    monday.setHours(0,0,0,0);
    return Array.from({length:7},(_,i)=>{ const d=new Date(monday); d.setDate(monday.getDate()+i); return d; });
  }

  const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const EXAMPLES = ["Coffee with a friend ☕","Movie night 🎬","Nice lunch out 🍜","Go somewhere new 🗺️","Play a game 🎮","Unplug & walk 🌿","Catch up with family 💬"];

  function fmt12h(time24) {
    if (!time24) return null;
    const [h,m] = time24.split(":").map(Number);
    return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`;
  }

  function JoySessionsSection({ state, dispatch }) {
    const [selectedDay, setSelectedDay] = useState(null);
    const [draft, setDraft] = useState("");
    const [draftTime, setDraftTime] = useState("");
    const [editingId, setEditingId] = useState(null);
    const [editTime, setEditTime] = useState("");
    const sessions = state.joySession.history[WEEK] || [];
    const weekStreak = state.joySession.streak;
    const scheduledCount = sessions.length, doneCount = sessions.filter(s=>s.done).length;
    const bothScheduled = scheduledCount >= 2, bothDone = doneCount >= 2;
    const weekDays = getWeekDays();
    const sessionForDay = (ds) => sessions.find(s=>s.scheduledDay===ds);
    const dayStrFn = (d) => localDateStr(d);
    const isToday = (d) => dayStrFn(d)===DAY;
    const isPast  = (d) => dayStrFn(d)<DAY;

    const handleSchedule = () => {
      if (!draft.trim() || !selectedDay) return;
      dispatch({ type:"SCHEDULE_JOY_SESSION", text:draft.trim(), scheduledDay:selectedDay, scheduledTime:draftTime||null });
      setDraft(""); setDraftTime(""); setSelectedDay(null);
    };
    const handleSaveTime = (id) => {
      dispatch({ type:"UPDATE_JOY_SESSION_TIME", id, scheduledTime:editTime||null });
      setEditingId(null); setEditTime("");
    };

    return (
      <div style={{ marginTop:24, marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <Label>Weekly Joy Sessions</Label>
          {weekStreak>0&&<span style={{ fontSize:10, color:C.warn, fontWeight:700, marginTop:-8 }}>🔥 {weekStreak}w streak</span>}
        </div>
        <Card style={{ padding:"14px", background:"linear-gradient(135deg, #fff 0%, #f0f7f1 100%)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <span style={{ fontSize:20 }}>🌊</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:700, color:C.text }}>{bothDone?"Both sessions done! 🎉":bothScheduled?`${doneCount}/2 completed`:`${scheduledCount}/2 scheduled`}</p>
              <p style={{ fontSize:10, color:C.textLight }}>{getWeekLabel()}</p>
            </div>
            <div style={{ display:"flex", gap:5 }}>{[0,1].map(i=>{const s=sessions[i];const bg=!s?C.border:s.done?C.success:C.primary;return <div key={i} style={{ width:10, height:10, borderRadius:"50%", background:bg, transition:"background .3s" }}/>;})}</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:4, marginBottom:14 }}>
            {weekDays.map((d,i)=>{
              const ds=dayStrFn(d), session=sessionForDay(ds), isSelected=selectedDay===ds;
              const today=isToday(d), past=isPast(d), canSchedule=!session&&!bothScheduled;
              let bg="transparent", border=`1.5px dashed ${C.border}`, textCol=C.textLight;
              if(today&&!session){border=`1.5px solid ${C.mid}`;textCol=C.primary;}
              if(isSelected){bg=C.pale;border=`1.5px solid ${C.primary}`;}
              if(session&&!session.done){bg=C.pale;border=`1.5px solid ${C.primary}`;textCol=C.primary;}
              if(session&&session.done){bg="#e8f5ed";border=`1.5px solid ${C.success}`;textCol=C.success;}
              return (
                <button key={ds} onClick={()=>{if(session){setSelectedDay(null);}else if(canSchedule){setSelectedDay(isSelected?null:ds);setDraft("");setDraftTime("");}}}
                  style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"7px 2px", borderRadius:10, border, background:bg, cursor:(session||canSchedule)?"pointer":"default", opacity:past&&!session&&!canSchedule?0.4:1 }}>
                  <span style={{ fontSize:8, fontWeight:700, color:textCol, letterSpacing:".06em", textTransform:"uppercase" }}>{DAY_NAMES[i]}</span>
                  <span style={{ fontSize:12, fontWeight:today?800:500, color:textCol }}>{d.getDate()}</span>
                  {session?<span style={{ fontSize:10 }}>{session.done?"✓":"·"}</span>:canSchedule?<span style={{ fontSize:9, color:C.textLight }}>+</span>:<span style={{ fontSize:9 }}> </span>}
                </button>
              );
            })}
          </div>
          {selectedDay&&(
            <div style={{ marginBottom:12, padding:"12px", borderRadius:12, background:C.bg, border:`1px solid ${C.border}` }}>
              <p style={{ fontSize:11, color:C.textMid, marginBottom:10, fontWeight:600 }}>Schedule for {new Date(selectedDay+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</p>
              <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                <input autoFocus value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleSchedule();if(e.key==="Escape"){setSelectedDay(null);setDraft("");setDraftTime("");}}} placeholder="What will you enjoy?" style={{ flex:1, padding:"9px 12px", borderRadius:10, border:`1.5px solid ${C.primary}`, fontSize:13, fontFamily:"inherit", color:C.text, outline:"none", background:"#fff" }}/>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ fontSize:11, color:C.textMid, fontWeight:600, flexShrink:0 }}>⏰ Time</span>
                <input type="time" value={draftTime} onChange={e=>setDraftTime(e.target.value)} style={{ flex:1, padding:"8px 10px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", color:C.text, outline:"none", background:"#fff" }}/>
                {draftTime&&<button onClick={()=>setDraftTime("")} style={{ fontSize:14, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:"0 4px" }}>×</button>}
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                {EXAMPLES.slice(0,4).map(ex=><button key={ex} onClick={()=>setDraft(ex)} style={{ fontSize:10, padding:"4px 9px", borderRadius:100, border:`1px solid ${C.border}`, background:draft===ex?C.pale:"#fff", color:C.textMid, cursor:"pointer", fontFamily:"inherit" }}>{ex}</button>)}
              </div>
              <Btn sm onClick={handleSchedule} disabled={!draft.trim()} style={{ width:"100%" }}>Add Session</Btn>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {sessions.map(s=>(
              <div key={s.id} style={{ borderRadius:12, overflow:"hidden", border:`1px solid ${s.done?C.success:C.primary}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:s.done?"#e8f5ed":C.pale }}>
                  <button onClick={()=>dispatch({type:"TOGGLE_JOY_SESSION",id:s.id})} style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, border:`2px solid ${s.done?C.success:C.primary}`, background:s.done?C.success:"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", fontSize:10, padding:0 }}>{s.done?"✓":""}</button>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, color:C.text, fontWeight:500, textDecoration:s.done?"line-through":"none", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.text}</p>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2, flexWrap:"wrap" }}>
                      <span style={{ fontSize:10, color:C.textLight }}>{new Date(s.scheduledDay+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span>
                      {s.scheduledTime&&<><span style={{ fontSize:9, color:C.textLight }}>·</span><span style={{ fontSize:11, color:C.primary, fontWeight:700 }}>⏰ {fmt12h(s.scheduledTime)}</span></>}
                      {!s.scheduledTime&&<button onClick={()=>{setEditingId(s.id);setEditTime("");}} style={{ fontSize:10, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit", textDecoration:"underline" }}>+ add time</button>}
                    </div>
                  </div>
                  <button onClick={()=>dispatch({type:"DELETE_JOY_SESSION",id:s.id})} style={{ fontSize:17, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:4, lineHeight:1, flexShrink:0 }}>×</button>
                </div>
                {editingId===s.id&&(
                  <div style={{ padding:"10px 12px", borderTop:`1px solid ${C.border}`, background:"#fff", display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:11, color:C.textMid, fontWeight:600, flexShrink:0 }}>⏰</span>
                    <input autoFocus type="time" value={editTime} onChange={e=>setEditTime(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleSaveTime(s.id);if(e.key==="Escape")setEditingId(null);}} style={{ flex:1, padding:"7px 10px", borderRadius:8, border:`1.5px solid ${C.primary}`, fontSize:13, fontFamily:"inherit", color:C.text, outline:"none" }}/>
                    <Btn sm onClick={()=>handleSaveTime(s.id)} disabled={!editTime}>Save</Btn>
                    <button onClick={()=>setEditingId(null)} style={{ fontSize:16, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:"0 2px" }}>×</button>
                  </div>
                )}
                {s.scheduledTime&&editingId!==s.id&&(
                  <div style={{ padding:"6px 12px", borderTop:`1px solid ${C.border}`, background:"#fff", display:"flex", gap:8 }}>
                    <button onClick={()=>{setEditingId(s.id);setEditTime(s.scheduledTime);}} style={{ fontSize:10, color:C.primary, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit", fontWeight:600 }}>✏️ Change time</button>
                    <button onClick={()=>dispatch({type:"UPDATE_JOY_SESSION_TIME",id:s.id,scheduledTime:null})} style={{ fontSize:10, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit" }}>Remove</button>
                  </div>
                )}
              </div>
            ))}
            {sessions.length===0&&<p style={{ fontSize:11, color:C.textLight, textAlign:"center", padding:"8px 0" }}>Tap any day above to schedule your 2 joy sessions this week.</p>}
            {sessions.length===1&&<p style={{ fontSize:11, color:C.textLight, textAlign:"center", padding:"4px 0" }}>1 more to go — pick another day above.</p>}
          </div>
        </Card>
      </div>
    );
  }

  // ─── Routine View ─────────────────────────────────────────────────────────────
  function RoutineView({ state, dispatch, t1, t2, t3 }) {
    const done = state.routine.history[DAY] || {};
    const timers = [t1, t2, t3];
    const completedAll = done.move && done.reflect && done.grow;
    const BLOCKS = [
      { key:"move",    label:"Move",    icon:"🏃", desc:"Cardio · Strength · Stretch", color:"#45a870" },
      { key:"reflect", label:"Reflect", icon:"🧘", desc:"Meditate · Journal · Breathe", color:"#5c8fa8" },
      { key:"grow",    label:"Grow",    icon:"📚", desc:"Read · Learn · Listen",        color:"#8b73c0" },
    ];
    return (
      <div style={{ padding:"0 20px 100px" }}>
        <div style={{ paddingTop:52, paddingBottom:18, display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
          <div>
            <p style={{ fontSize:11, color:C.textMid, letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>Daily Ritual</p>
            <h1 style={{ fontSize:28, fontWeight:800, color:C.text, letterSpacing:"-.03em", fontFamily:"'Syne', sans-serif" }}>20/20/20</h1>
            <p style={{ fontSize:12, color:C.textMid, marginTop:4 }}>Win the first hour, win the day.</p>
          </div>
          {completedAll && (
            <span style={{ fontSize:11, background:C.pale, color:C.primary, padding:"5px 12px", borderRadius:100, fontWeight:700, marginBottom:4 }}>✓ All Done</span>
          )}
        </div>
        {BLOCKS.map(({key,label,icon,desc,color},i)=>{
          const isDone=!!done[key], timer=timers[i], elapsed=20*60-timer.secs, pct=isDone?100:(elapsed/(20*60))*100;
          return (
            <Card key={key} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                <Ring pct={pct} size={64} sw={5} color={isDone?C.success:color} label={isDone?"✓":fmt(timer.secs)} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                    <span style={{ fontSize:17 }}>{icon}</span>
                    <span style={{ fontSize:15, fontWeight:700, color:C.text }}>{label}</span>
                    <span style={{ fontSize:10, color:C.textLight, background:C.alt, borderRadius:100, padding:"2px 7px" }}>20 min</span>
                  </div>
                  <p style={{ fontSize:11, color:C.textMid }}>{desc}</p>
                </div>
              </div>
              {!isDone&&(
                <div style={{ display:"flex", gap:8, marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                  {!timer.running?<Btn sm onClick={timer.start} style={{ flex:1 }}>▶ Start</Btn>:<Btn sm v="ghost" onClick={timer.pause} style={{ flex:1 }}>⏸ Pause</Btn>}
                  <Btn sm v="ghost" onClick={()=>timer.reset()}>↺</Btn>
                  <Btn sm v="soft" onClick={()=>dispatch({type:"MARK_ROUTINE",key})}>Mark Done</Btn>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    );
  }

  // ─── Focus View ───────────────────────────────────────────────────────────────
  function FocusView({ state, dispatch, timer }) {
    const [editing, setEditing] = useState(!state.focus.goal);
    const [draft, setDraft] = useState(state.focus.goal || "");
    const [logged, setLogged] = useState(false);
    const daysSince = state.focus.startDate ? Math.max(1, Math.floor((Date.now()-new Date(state.focus.startDate))/86400000)+1) : 0;
    const todayMins = state.focus.sessions[DAY] || 0;
    const elapsed = Math.floor((90*60-timer.secs)/60);
    const handleLog = () => {
      if (elapsed < 1) return;
      dispatch({ type:"LOG_FOCUS", mins:elapsed });
      timer.reset(); setLogged(true);
      setTimeout(()=>setLogged(false), 2500);
    };
    return (
      <div style={{ padding:"0 20px 100px" }}>
        <div style={{ paddingTop:52, paddingBottom:18 }}>
          <p style={{ fontSize:11, color:C.textMid, letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>Deep Work</p>
          <h1 style={{ fontSize:28, fontWeight:800, color:C.text, letterSpacing:"-.03em", fontFamily:"'Syne', sans-serif" }}>90/90/1</h1>
          <p style={{ fontSize:12, color:C.textMid, marginTop:4 }}>One goal. 90 days. 90 minutes daily.</p>
        </div>
        <Card style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <Label>Your One Goal</Label>
            <button onClick={()=>setEditing(!editing)} style={{ fontSize:11, color:C.primary, background:"none", border:"none", cursor:"pointer", fontWeight:600, fontFamily:"inherit", padding:0, marginTop:-8 }}>{editing?"Cancel":"Edit"}</button>
          </div>
          {editing?(
            <div style={{ display:"flex", gap:8 }}>
              <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){dispatch({type:"SET_GOAL",goal:draft});setEditing(false);}}} placeholder="e.g. Build my first product…" style={{ flex:1, padding:"9px 12px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", color:C.text, outline:"none", background:C.bg }}/>
              <Btn sm onClick={()=>{dispatch({type:"SET_GOAL",goal:draft});setEditing(false);}}>Set</Btn>
            </div>
          ):(
            <p style={{ fontSize:15, fontWeight:600, lineHeight:1.4, color:state.focus.goal?C.text:C.textLight, fontStyle:state.focus.goal?"normal":"italic" }}>{state.focus.goal||"No goal set — tap Edit to begin"}</p>
          )}
        </Card>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
          {[
            {val:Math.min(daysSince,90),max:90,lbl:"days",col:C.primary},
            {val:todayMins,max:90,lbl:"min today",col:todayMins>=90?C.success:C.mid},
            {val:state.focus.streak,max:90,lbl:"streak",col:C.warn},
          ].map(({val,max,lbl,col})=>(
            <Card key={lbl} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"14px 6px" }}>
              <Ring pct={(val/max)*100} size={60} sw={5} color={col} label={String(val)} />
              <span style={{ fontSize:9, color:C.textMid, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", textAlign:"center" }}>{lbl}</span>
            </Card>
          ))}
        </div>
        <Card style={{ textAlign:"center", padding:"22px 16px" }}>
          <Label>Focus Timer — 90 min</Label>
          <div style={{ fontSize:58, fontWeight:800, letterSpacing:"-.03em", color:C.text, lineHeight:1, marginBottom:10, fontFamily:"'Syne', sans-serif" }}>{fmt(timer.secs)}</div>
          <div style={{ height:4, background:C.pale, borderRadius:2, marginBottom:20, overflow:"hidden" }}>
            <div style={{ height:"100%", background:C.primary, borderRadius:2, width:`${((90*60-timer.secs)/(90*60))*100}%`, transition:"width .8s" }}/>
          </div>
          <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
            {!timer.running?<Btn onClick={timer.start}>▶ Start Focus</Btn>:<Btn v="ghost" onClick={timer.pause}>⏸ Pause</Btn>}
            <Btn v={logged?"success":"soft"} onClick={handleLog} disabled={elapsed<1}>{logged?"✓ Logged!":"✓ Log Session"}</Btn>
            <Btn v="ghost" onClick={()=>timer.reset()}>↺</Btn>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Tasks View ───────────────────────────────────────────────────────────────
  function getWeekStart(offsetWeeks=0) {
    const today=new Date(), day=today.getDay();
    const monday=new Date(today);
    monday.setDate(today.getDate()-(day===0?6:day-1)+offsetWeeks*7);
    monday.setHours(0,0,0,0);
    return monday;
  }
  function getWeekDaysFrom(monday) {
    return Array.from({length:7},(_,i)=>{ const d=new Date(monday); d.setDate(monday.getDate()+i); return d; });
  }
  function getMiniCalendarDays(year,month) {
    const firstDay=new Date(year,month,1), startOffset=(firstDay.getDay()+6)%7;
    const daysInMonth=new Date(year,month+1,0).getDate(), cells=[];
    for(let i=0;i<startOffset;i++) cells.push(null);
    for(let d=1;d<=daysInMonth;d++) cells.push(new Date(year,month,d));
    return cells;
  }

  function TasksView({ state, dispatch }) {
    const [selectedDay, setSelectedDay] = useState(DAY);
    const [weekOffset, setWeekOffset] = useState(0);
    const [input, setInput] = useState("");
    const [inputTime, setInputTime] = useState("");
    const [inputRepeat, setInputRepeat] = useState("");
    const [modalTaskId, setModalTaskId] = useState(null);
    const [showCalendar, setShowCalendar] = useState(false);
    const [calYear, setCalYear] = useState(new Date().getFullYear());
    const [calMonth, setCalMonth] = useState(new Date().getMonth());
    const weekStart=getWeekStart(weekOffset), weekDays=getWeekDaysFrom(weekStart);
    const ds=(d)=>localDateStr(d), isToday=(d)=>ds(d)===DAY, isSelected=(d)=>ds(d)===selectedDay;
    const isViewingToday=selectedDay===DAY, isPast=selectedDay<DAY;
    const mergedTasks = getTasksForDate(state, selectedDay);
    const doneTasks = mergedTasks.filter(t=>t.done).length;
    const modalTask = mergedTasks.find(t=>t.id===modalTaskId) || null;
    const weekLabel=(()=>{
      const start=weekDays[0],end=weekDays[6],fmt2=(d)=>d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
      if(start.getFullYear()!==end.getFullYear()) return `${fmt2(start)}, ${start.getFullYear()} – ${fmt2(end)}, ${end.getFullYear()}`;
      if(start.getMonth()!==end.getMonth()) return `${fmt2(start)} – ${fmt2(end)}, ${end.getFullYear()}`;
      return `${start.toLocaleDateString("en-US",{month:"long"})} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
    })();
    const jumpToDay=(targetDs)=>{
      setSelectedDay(targetDs); setShowCalendar(false);
      const target=new Date(targetDs+"T12:00:00"), todayMonday=getWeekStart(0);
      const diff=Math.round((target-todayMonday)/(7*86400000));
      setWeekOffset(Math.floor(diff));
    };
    const add = () => {
      if (!input.trim()) return;
      if (inputRepeat === 'daily') {
        dispatch({ type: "ADD_TASK", text: input.trim(), scheduledTime: inputTime || null, repeat: 'daily', startDate: selectedDay });
      } else {
        dispatch({ type: "ADD_TASK", text: input.trim(), date: selectedDay, scheduledTime: inputTime || null });
      }
      setInput(""); setInputTime(""); setInputRepeat("");
    };
    const selectedLabel=isViewingToday?"Today":new Date(selectedDay+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"});
    const miniCalDays=getMiniCalendarDays(calYear,calMonth);
    const MONTH_NAMES=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    return (
      <div style={{ padding:"0 20px 100px" }}>
        <div style={{ paddingTop:52, paddingBottom:14, display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <p style={{ fontSize:11, color:C.textMid, letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>Task Planner</p>
            <h1 style={{ fontSize:28, fontWeight:800, color:C.text, letterSpacing:"-.03em", fontFamily:"'Syne', sans-serif" }}>My Tasks</h1>
            <p style={{ fontSize:12, color:C.textMid, marginTop:4 }}>Schedule anything, anytime.</p>
          </div>
          <button onClick={()=>setShowCalendar(!showCalendar)} style={{ marginTop:52, width:38, height:38, borderRadius:10, border:`1.5px solid ${showCalendar?C.primary:C.border}`, background:showCalendar?C.pale:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>📅</button>
        </div>
        {showCalendar&&(
          <Card style={{ marginBottom:14, padding:"14px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <button onClick={()=>{let m=calMonth-1,y=calYear;if(m<0){m=11;y--;}setCalMonth(m);setCalYear(y);}} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:C.primary, padding:"0 6px" }}>‹</button>
              <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{MONTH_NAMES[calMonth]} {calYear}</span>
              <button onClick={()=>{let m=calMonth+1,y=calYear;if(m>11){m=0;y++;}setCalMonth(m);setCalYear(y);}} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:C.primary, padding:"0 6px" }}>›</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", marginBottom:4 }}>
              {["M","T","W","T","F","S","S"].map((n,i)=><span key={i} style={{ textAlign:"center", fontSize:9, color:C.textLight, fontWeight:700, letterSpacing:".05em" }}>{n}</span>)}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2 }}>
              {miniCalDays.map((d,i)=>{
                if(!d) return <div key={`e${i}`}/>;
                const dayStr=localDateStr(d), hasTasks=(getTasksForDate(state, dayStr) || []).length>0;
                const allDone=hasTasks&&getTasksForDate(state, dayStr).every(t=>t.done);
                const isT=dayStr===DAY, isSel=dayStr===selectedDay;
                return <button key={dayStr} onClick={()=>jumpToDay(dayStr)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, padding:"5px 2px", borderRadius:8, border:"none", background:isSel?C.primary:isT?C.pale:"transparent", cursor:"pointer" }}>
                  <span style={{ fontSize:12, fontWeight:isT||isSel?800:400, color:isSel?"#fff":isT?C.primary:C.text }}>{d.getDate()}</span>
                  {hasTasks&&<div style={{ width:4, height:4, borderRadius:"50%", background: isSel ? "rgba(255,255,255,.7)" : (allDone ? C.success : C.mid) }} />}
                </button>;
              })}
            </div>
            <div style={{ marginTop:10, textAlign:"center" }}>
              <button onClick={()=>jumpToDay(DAY)} style={{ fontSize:11, color:C.primary, background:"none", border:"none", cursor:"pointer", fontWeight:700, fontFamily:"inherit" }}>→ Jump to Today</button>
            </div>
          </Card>
        )}
        <Card style={{ marginBottom:14, padding:"10px 8px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8, paddingLeft:4, paddingRight:4 }}>
            <button onClick={()=>setWeekOffset(weekOffset-1)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:C.primary, padding:"0 4px", lineHeight:1 }}>‹</button>
            <span style={{ fontSize:11, fontWeight:600, color:C.textMid }}>{weekLabel}</span>
            <button onClick={()=>setWeekOffset(weekOffset+1)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:C.primary, padding:"0 4px", lineHeight:1 }}>›</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:3 }}>
            {weekDays.map((d,i)=>{
              const dayStr=ds(d), dayTasks=getTasksForDate(state, dayStr)||[], dayDone=dayTasks.filter(t=>t.done).length;
              const hasAll=dayTasks.length>0&&dayDone===dayTasks.length, today=isToday(d), selected=isSelected(d);
              let bg="transparent", border=`1.5px solid transparent`, numCol=C.textMid, nameCol=C.textLight;
              if(today&&!selected){border=`1.5px solid ${C.mid}`;numCol=C.primary;nameCol=C.primary;}
              if(selected){bg=C.primary;numCol="#fff";nameCol="rgba(255,255,255,.7)";border=`1.5px solid ${C.primary}`;}
              return <button key={dayStr} onClick={()=>setSelectedDay(dayStr)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"7px 2px", borderRadius:10, border, background:bg, cursor:"pointer" }}>
                <span style={{ fontSize:8, fontWeight:700, color:nameCol, letterSpacing:".06em", textTransform:"uppercase" }}>{DAY_NAMES[i]}</span>
                <span style={{ fontSize:13, fontWeight:today||selected?800:500, color:numCol }}>{d.getDate()}</span>
                {dayTasks.length>0?<div style={{ width:16, height:5, borderRadius:3, background:selected?"rgba(255,255,255,.45)":hasAll?C.success:C.mid, display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:7, color:"#fff", fontWeight:800, lineHeight:1 }}>{dayTasks.length}</span></div>:<div style={{ width:16, height:5 }}/>}
              </button>;
            })}
          </div>
          {weekOffset!==0&&<div style={{ textAlign:"center", marginTop:8 }}><button onClick={()=>{setWeekOffset(0);setSelectedDay(DAY);}} style={{ fontSize:10, color:C.primary, background:"none", border:"none", cursor:"pointer", fontWeight:700, fontFamily:"inherit" }}>↩ Back to current week</button></div>}
        </Card>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <div>
            <p style={{ fontSize:15, fontWeight:700, color:C.text }}>{selectedLabel}{isPast&&!isViewingToday&&<span style={{ fontSize:10, color:C.textLight, fontWeight:500, marginLeft:6 }}>past</span>}</p>
            <p style={{ fontSize:11, color:C.textLight }}>{mergedTasks.length===0?"No tasks yet":`${doneTasks}/${mergedTasks.length} done`}</p>
          </div>
          {mergedTasks.length>0&&doneTasks===mergedTasks.length&&<span style={{ fontSize:11, color:C.success, fontWeight:700 }}>🎉 All done!</span>}
        </div>
        {!isPast && (
          <Card style={{ marginBottom:14, padding:"12px 14px" }}>
            <div style={{ display:"flex", gap:8, marginBottom:inputTime||input?8:0 }}>
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder={`Add task for ${isViewingToday?"today":new Date(selectedDay+"T12:00:00").toLocaleDateString("en-US",{weekday:"long"})}…`} style={{ flex:1, padding:"9px 12px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", color:C.text, outline:"none", background:"#fff" }}/>
              <Btn onClick={add} disabled={!input.trim()}>Add</Btn>
            </div>
            {input.trim()&&(
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:11, color:C.textMid, fontWeight:600, flexShrink:0 }}>🔁 Repeat</span>
                <select value={inputRepeat} onChange={e=>setInputRepeat(e.target.value)} style={{ padding:"7px 10px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, background:"#fff", outline:"none" }}>
                  <option value="">None</option>
                  <option value="daily">Daily (Always show)</option>
                </select>
                <span style={{ fontSize:11, color:C.textMid, fontWeight:600, flexShrink:0 }}>⏰ Time</span>
                <input type="time" value={inputTime} onChange={e=>setInputTime(e.target.value)} style={{ flex:1, padding:"7px 10px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", color:C.text, outline:"none", background:"#fff" }}/>
                {inputTime&&<button onClick={()=>setInputTime("")} style={{ fontSize:14, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:"0 4px" }}>×</button>}
              </div>
            )}
          </Card>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
          {mergedTasks.length===0&&(
            <div style={{ textAlign:"center", padding:"32px 20px", color:C.textLight }}>
              <div style={{ fontSize:32, marginBottom:8 }}>{isPast&&!isViewingToday?"📂":"📋"}</div>
              <p style={{ fontSize:13 }}>{isPast&&!isViewingToday?"Nothing was planned for this day.":selectedDay>DAY?"Plan ahead — add tasks for this day.":"No tasks yet — add one above."}</p>
            </div>
          )}
          {mergedTasks.slice().sort((a,b)=>{ if(!a.scheduledTime&&!b.scheduledTime) return 0; if(!a.scheduledTime) return 1; if(!b.scheduledTime) return -1; return a.scheduledTime.localeCompare(b.scheduledTime); }).map((task,i)=>(
            <TaskCard key={task.id} task={task} index={i} selectedDay={selectedDay} dispatch={dispatch} onOpen={()=>setModalTaskId(task.id)} />
          ))}
          {modalTask && (
            <TaskDetailModal task={modalTask} date={selectedDay} onClose={()=>setModalTaskId(null)} dispatch={dispatch} />
          )}
        </div>
      </div>
    );
  }

  function TaskCard({ task, index, selectedDay, dispatch, onOpen }) {
    const [editingTime, setEditingTime] = useState(false);
    const [editTime, setEditTime] = useState(task.scheduledTime || "");
    const saveTime = () => {
      if (task.isRecurring) {
        dispatch({ type: "UPDATE_RECURRING_TIME", id: task.id, scheduledTime: editTime || null });
      } else {
        dispatch({ type: "UPDATE_TASK_TIME", id: task.id, date: selectedDay, scheduledTime: editTime || null });
      }
      setEditingTime(false);
    };
    return (
      <div style={{ borderRadius:14, overflow:"hidden", border:`1px solid ${task.done?C.success:C.border}`, opacity:task.done?0.7:1, transition:"opacity .2s", background:C.surface, boxShadow:"0 1px 4px rgba(20,50,30,.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px" }}>
          <button onClick={()=>{ if (task.isRecurring) { dispatch({ type: "TOGGLE_RECURRING", id: task.id, date: selectedDay }); } else { dispatch({ type: "TOGGLE_TASK", id: task.id, date: selectedDay }); } }} style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, border:`2px solid ${task.done?C.success:C.border}`, background:task.done?C.success:"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", fontSize:11, padding:0 }}>{task.done?"✓":""}</button>
          <div style={{ flex:1, minWidth:0 }}>
            <p onClick={()=>onOpen && onOpen(task)} style={{ fontSize:13, color:task.done?C.textMid:C.text, textDecoration: task.done ? 'line-through' : 'none', lineHeight:1.4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", cursor: onOpen ? "pointer" : "default" }}>{task.text}</p>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
              <span style={{ fontSize:10, color:C.textLight }}>#{index+1}</span>
              {task.scheduledTime?(<><span style={{ fontSize:9, color:C.textLight }}>·</span><span style={{ fontSize:11, color:C.primary, fontWeight:700 }}>⏰ {fmt12h(task.scheduledTime)}</span></>):(<button onClick={()=>{setEditingTime(true);setEditTime("");}} style={{ fontSize:10, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit", textDecoration:"underline" }}>+ add time</button>)}
            </div>
          </div>
          <button onClick={()=>{ if (task.isRecurring) { dispatch({ type: "DELETE_RECURRING", id: task.id }); } else { dispatch({ type: "DELETE_TASK", id: task.id, date: selectedDay }); } }} style={{ fontSize:17, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:4, lineHeight:1, flexShrink:0 }}>×</button>
        </div>
        {editingTime&&(
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderTop:`1px solid ${C.border}`, background:C.bg }}>
            <span style={{ fontSize:11, color:C.textMid, fontWeight:600, flexShrink:0 }}>⏰</span>
            <input autoFocus type="time" value={editTime} onChange={e=>setEditTime(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveTime();if(e.key==="Escape")setEditingTime(false);}} style={{ flex:1, padding:"7px 10px", borderRadius:8, border:`1.5px solid ${C.primary}`, fontSize:13, fontFamily:"inherit", color:C.text, outline:"none", background:"#fff" }}/>
            <Btn sm onClick={saveTime}>Save</Btn>
            <button onClick={()=>setEditingTime(false)} style={{ fontSize:16, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:"0 2px" }}>×</button>
          </div>
        )}
        {task.scheduledTime&&!editingTime&&(
            <div style={{ display:"flex", gap:10, padding:"5px 12px", borderTop:`1px solid ${C.border}`, background:C.bg }}>
            <button onClick={()=>{setEditingTime(true);setEditTime(task.scheduledTime);}} style={{ fontSize:10, color:C.primary, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit", fontWeight:600 }}>✏️ Change time</button>
            <button onClick={()=>{ if (task.isRecurring) { dispatch({ type: "UPDATE_RECURRING_TIME", id: task.id, scheduledTime: null }); } else { dispatch({ type: "UPDATE_TASK_TIME", id: task.id, date: selectedDay, scheduledTime: null }); } }} style={{ fontSize:10, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit" }}>Remove</button>
          </div>
        )}
      </div>
    );
  }

  // ─── Muscle Group Chip Selector ───────────────────────────────────────────────
  function MuscleGroupSelector({ selected, onChange, disabled }) {
    return (
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {MUSCLE_GROUPS.map(({key,label,color})=>{
          const isSelected=selected===key;
          return (
            <button key={key} onClick={()=>!disabled&&onChange(isSelected?null:key)} style={{ padding:"5px 11px", borderRadius:100, border:`1.5px solid ${isSelected?color:C.border}`, background:isSelected?color:"transparent", color:isSelected?"#fff":C.textMid, fontSize:11, fontWeight:isSelected?700:500, cursor:disabled?"default":"pointer", fontFamily:"inherit", transition:"all .15s", opacity:disabled&&!isSelected?0.45:1 }}>
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  function WeightTrendChart({ entries }) {
    if (entries.length === 0) {
      return <p style={{ fontSize:11, color:C.textLight, textAlign:"center", padding:"12px 0" }}>Log your first weight entry to start tracking progress.</p>;
    }
    if (entries.length === 1) {
      const only = entries[0];
      return (
        <div style={{ padding:"10px 0", textAlign:"center" }}>
          <p style={{ fontSize:24, fontWeight:800, color:C.text, fontFamily:"'Syne', sans-serif" }}>{only.weight} kg</p>
          <p style={{ fontSize:11, color:C.textLight }}>Need one more entry to draw the trend line.</p>
        </div>
      );
    }
    const width = 320, height = 160, padX = 18, padY = 18;
    const weights = entries.map((e) => e.weight);
    const min = Math.min(...weights), max = Math.max(...weights);
    const range = Math.max(max - min, 1);
    const stepX = (width - padX * 2) / Math.max(entries.length - 1, 1);
    const points = entries.map((e, i) => ({
      ...e,
      x: padX + i * stepX,
      y: height - padY - ((e.weight - min) / range) * (height - padY * 2),
    }));
    const line = points.map((p) => `${p.x},${p.y}`).join(" ");
    const delta = points[points.length-1].weight - points[0].weight;
    return (
      <div>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display:"block", overflow:"visible" }}>
          <line x1={padX} y1={height-padY} x2={width-padX} y2={height-padY} stroke={C.border} strokeWidth="1" />
          <line x1={padX} y1={padY} x2={padX} y2={height-padY} stroke={C.border} strokeWidth="1" />
          <polyline fill="none" stroke={C.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={line} />
          {points.map((p) => (
            <g key={p.id}>
              <circle cx={p.x} cy={p.y} r="4.5" fill={C.success} />
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9" fill={C.textMid}>{p.weight}</text>
            </g>
          ))}
        </svg>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
          <span style={{ fontSize:10, color:C.textLight }}>{entries[0].date}</span>
          <span style={{ fontSize:11, color:delta > 0 ? C.warn : C.success, fontWeight:700 }}>{delta > 0 ? "+" : ""}{delta.toFixed(1)} kg</span>
          <span style={{ fontSize:10, color:C.textLight }}>{entries[entries.length-1].date}</span>
        </div>
      </div>
    );
  }

  // ─── Workout Entry Card ───────────────────────────────────────────────────────
  function WorkoutEntryCard({ entry, dateKey, isToday, dispatch }) {
    const isSets = entry.exerciseType !== "time" && Array.isArray(entry.sets) && entry.sets.length > 0;
    const isTime = entry.exerciseType === "time";
    const totalReps = isSets ? entry.sets.reduce((sum, s) => sum + (Number(s.reps) || 0), 0) : null;
    const topWeight = isSets ? Math.max(...entry.sets.map(s => Number(s.weight) || 0)) : null;

    return (
      <div style={{ borderRadius:14, border:`1px solid ${entry.completed ? C.success : C.border}`, background:C.surface, overflow:"hidden", marginBottom:10 }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 14px 10px", borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:14, fontWeight:700, color:C.text, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {entry.name || "(unnamed)"}
          </span>
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:100, background:C.pale, color:C.primary, fontWeight:600, flexShrink:0 }}>
            {isTime ? "Time" : "Reps"}
          </span>
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:100, background:entry.completed ? "#e8f5ed" : C.alt, color:entry.completed ? C.success : C.textMid, fontWeight:600, flexShrink:0 }}>
            {entry.completed ? "✓ Completed" : "Saved"}
          </span>
        </div>

        {/* Sets table */}
        {isSets && (
          <>
            <div style={{ padding:"10px 14px 6px" }}>
              <p style={{ fontSize:9, color:C.textLight, letterSpacing:".1em", textTransform:"uppercase", fontWeight:700, marginBottom:6 }}>Sets</p>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:C.alt }}>
                    {["Set","Reps","Weight"].map((h, i) => (
                      <th key={h} style={{ fontSize:10, color:C.textMid, fontWeight:600, padding:"4px 8px", textAlign:i===2?"right":"left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entry.sets.map((s, idx) => (
                    <tr key={s.id || idx} style={{ borderTop:`1px solid ${C.border}` }}>
                      <td style={{ fontSize:11, color:C.textLight, padding:"7px 8px", width:36 }}>{idx + 1}</td>
                      <td style={{ fontSize:13, color:C.text, padding:"7px 8px", fontWeight:600 }}>{s.reps || "—"}</td>
                      <td style={{ fontSize:12, color:C.textMid, padding:"7px 8px", textAlign:"right" }}>
                        {s.weight ? `${s.weight} ${s.weightUnit || "kg"}` : "Bodyweight"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Summary footer */}
            <div style={{ display:"flex", borderTop:`1px solid ${C.border}`, background:C.alt }}>
              {[
                { label:"Sets",       val: entry.sets.length },
                { label:"Total reps", val: totalReps || "—" },
                { label:"Top weight", val: topWeight ? `${topWeight} ${entry.sets[0]?.weightUnit || "kg"}` : "BW" },
                { label:"Timer",      val: formatWorkoutDuration(entry.timerSecs) },
              ].map(({ label, val }, i, arr) => (
                <div key={label} style={{ flex:1, padding:"8px 10px", borderRight:i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <p style={{ fontSize:9, color:C.textLight, textTransform:"uppercase", letterSpacing:".07em", marginBottom:2 }}>{label}</p>
                  <p style={{ fontSize:13, fontWeight:700, color:C.text }}>{val}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Single reps (no sets array) */}
        {!isSets && !isTime && (
          <div style={{ display:"flex", alignItems:"center", gap:20, padding:"12px 14px", background:C.alt }}>
            <div>
              <p style={{ fontSize:9, color:C.textLight, textTransform:"uppercase", letterSpacing:".07em", marginBottom:2 }}>Reps</p>
              <p style={{ fontSize:20, fontWeight:800, color:C.text, fontFamily:"'Syne', sans-serif" }}>{entry.reps || "—"}</p>
            </div>
            {entry.weight && (
              <div>
                <p style={{ fontSize:9, color:C.textLight, textTransform:"uppercase", letterSpacing:".07em", marginBottom:2 }}>Weight</p>
                <p style={{ fontSize:20, fontWeight:800, color:C.text, fontFamily:"'Syne', sans-serif" }}>{entry.weight} {entry.weightUnit || "kg"}</p>
              </div>
            )}
            <div style={{ marginLeft:"auto" }}>
              <p style={{ fontSize:9, color:C.textLight, textTransform:"uppercase", letterSpacing:".07em", marginBottom:2 }}>Timer</p>
              <p style={{ fontSize:13, fontWeight:600, color:C.textMid }}>{formatWorkoutDuration(entry.timerSecs)}</p>
            </div>
          </div>
        )}

        {/* Time-based */}
        {isTime && (
          <div style={{ display:"flex", alignItems:"center", padding:"12px 14px", gap:16, background:C.alt }}>
            <div>
              <p style={{ fontSize:9, color:C.textLight, textTransform:"uppercase", letterSpacing:".07em", marginBottom:2 }}>Duration</p>
              <p style={{ fontSize:28, fontWeight:800, color:C.text, letterSpacing:"-.02em", fontFamily:"'Syne', sans-serif" }}>{formatWorkoutDuration(entry.durationSecs)}</p>
            </div>
            <div style={{ marginLeft:"auto", textAlign:"right" }}>
              <p style={{ fontSize:9, color:C.textLight, textTransform:"uppercase", letterSpacing:".07em", marginBottom:2 }}>Timer used</p>
              <p style={{ fontSize:13, fontWeight:600, color:C.textMid }}>{formatWorkoutDuration(entry.timerSecs)}</p>
            </div>
          </div>
        )}

        {/* Actions — today only */}
        {isToday && (
          <div style={{ display:"flex", gap:8, padding:"10px 14px", borderTop:`1px solid ${C.border}` }}>
            <Btn sm onClick={() => dispatch({ type:"LOAD_WORKOUT_ENTRY", date:dateKey, id:entry.id })}>Edit</Btn>
            <Btn sm v="danger" onClick={() => { if (window.confirm("Delete this entry?")) dispatch({ type:"DELETE_WORKOUT_ENTRY", date:dateKey, id:entry.id }); }}>Delete</Btn>
          </div>
        )}
      </div>
    );
  }

  // ─── Workout View ─────────────────────────────────────────────────────────────
  function WorkoutView({ state, dispatch }) {
    const [now, setNow] = useState(Date.now());
    const [weightDraft, setWeightDraft] = useState("");
    const [customTimerMins, setCustomTimerMins] = useState("");
    const [customTimerSecs, setCustomTimerSecs] = useState("");
    const [selectedWorkoutDay, setSelectedWorkoutDay] = useState(DAY);

    const selectedDayData = state.workout.history[selectedWorkoutDay] || null;
    const selectedEntries = getWorkoutDayEntries(selectedDayData).slice().reverse();
    const selectedDraft = getWorkoutDayDraft(selectedDayData);

    useEffect(() => {
      const running = selectedDraft.timerRunning || selectedEntries.some((e) => e.timerRunning);
      if (!running) return;
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }, [state.workout.history]);

    const remainingSecs = getWorkoutTimerRemaining(selectedDraft, now);
    const timerProgress = selectedDraft.timerSecs > 0 ? clamp(((selectedDraft.timerSecs - remainingSecs) / selectedDraft.timerSecs) * 100, 0, 100) : 0;
    const hasReps = selectedDraft.exerciseType === "time" ? false : (Array.isArray(selectedDraft.sets) && selectedDraft.sets.length > 0 ? selectedDraft.sets.some(s => String(s.reps||"").trim()) : !!String(selectedDraft.reps).trim());
    const canCompleteWorkout = selectedDraft.name.trim() && (selectedDraft.exerciseType === "time" ? selectedDraft.durationSecs > 0 : hasReps);

    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const ds = localDateStr(d);
      return { ds, d, day: state.workout.history[ds] || null };
    });

    const handleSetTimerFromInputs = () => {
      const mins = Number(customTimerMins) || 0;
      const secs = Number(customTimerSecs) || 0;
      const total = Math.max(1, mins * 60 + secs);
      dispatch({ type:"SET_WORKOUT_TIMER", timerSecs:total });
      setCustomTimerMins(""); setCustomTimerSecs("");
    };

    const handleSaveWorkout     = () => dispatch({ type:"SAVE_WORKOUT_ENTRY",     date:selectedWorkoutDay });
    const handleCompleteWorkout = () => dispatch({ type:"COMPLETE_WORKOUT_ENTRY", date:selectedWorkoutDay });
    const handleClearWorkout    = () => dispatch({ type:"CLEAR_WORKOUT_ENTRY",    date:selectedWorkoutDay });

    const bodyMetrics    = (state.bodyMetrics || []).slice().sort((a,b) => a.date.localeCompare(b.date));
    const selectedMetric = bodyMetrics.find((e) => e.date === selectedWorkoutDay);
    const todayMetric    = bodyMetrics.find((e) => e.date === DAY);

    const addMetric = () => {
      const weight = Number(weightDraft);
      if (!Number.isFinite(weight) || weight <= 0) return;
      if (todayMetric) return;
      dispatch({ type:"ADD_BODY_METRIC", date:DAY, weight });
      setWeightDraft("");
    };

    return (
      <div style={{ padding:"0 20px 100px" }}>
        <div style={{ paddingTop:52, paddingBottom:18 }}>
          <p style={{ fontSize:11, color:C.textMid, letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>Daily Training</p>
          <h1 style={{ fontSize:28, fontWeight:800, color:C.text, letterSpacing:"-.03em", fontFamily:"'Syne', sans-serif" }}>Second Wind</h1>
          <p style={{ fontSize:12, color:C.textMid, marginTop:4 }}>Your afternoon reset. Log multiple sets per day.</p>
        </div>

        {/* ── 1. Last 7 Days ── */}
        <Label>Last 7 Days</Label>
        <Card style={{ padding:"12px 14px", marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:4 }}>
            {last7.map(({ds,d,day})=>{
              const isToday = ds === DAY;
              const entries = getWorkoutDayEntries(day);
              const completed = dayHasCompletedWorkout(day);
              const dotBg = completed ? C.success : entries.length > 0 ? C.mid : C.border;
              const circleLabel = completed ? "✓" : entries.length > 0 ? String(entries.length) : "";
              const labelFontSize = circleLabel.length > 1 ? 8 : 10;
              const isSelected = ds === selectedWorkoutDay;
              return (
                <button key={ds} onClick={() => setSelectedWorkoutDay(ds)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, background:"none", border:"none", padding:0, cursor:"pointer" }}>
                  <span style={{ fontSize:8, letterSpacing:".05em", textTransform:"uppercase", fontWeight:isToday?800:500, color:isToday?C.primary:C.textLight }}>{["Su","Mo","Tu","We","Th","Fr","Sa"][d.getDay()]}</span>
                  <div style={{ width:32, height:32, borderRadius:8, background:dotBg, border:isSelected?`2px solid ${C.text}`:isToday?`2px solid ${C.primary}`:"2px solid transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontSize:labelFontSize, color:entries.length>0||completed?"#fff":"transparent", fontWeight:800, lineHeight:1, textAlign:"center" }}>{circleLabel}</span>
                  </div>
                  <span style={{ fontSize:9, color:C.textLight, textAlign:"center" }}>{completed ? "Done" : entries.length > 0 ? `${entries.length} log${entries.length>1?"s":""}` : ""}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:10, marginTop:12, flexWrap:"wrap" }}>
            {[{col:C.success,label:"Completed"},{col:C.mid,label:"Logged"},{col:C.border,label:"Empty"}].map(({col,label})=>(
              <div key={label} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <div style={{ width:8, height:8, borderRadius:2, background:col }}/>
                <span style={{ fontSize:9, color:C.textLight }}>{label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── 2. Timer (today only) ── */}
        {selectedWorkoutDay === DAY && (
          <Card style={{ marginBottom:16 }}>
            <div style={{ textAlign:"center", paddingBottom:12, borderBottom:`1px solid ${C.border}`, marginBottom:12 }}>
              <div style={{ position:"relative", display:"inline-block", marginBottom:8 }}>
                <Ring pct={timerProgress} size={120} sw={8} color={selectedDraft.timerRunning ? C.mid : C.primary} label={formatWorkoutDuration(remainingSecs)} sub="timer" />
              </div>
              <div style={{ marginTop:12, height:6, background:C.pale, borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:3, background:C.primary, width:`${timerProgress}%`, transition:selectedDraft.timerRunning?"none":"width .5s" }}/>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <input value={customTimerMins} onChange={e=>setCustomTimerMins(e.target.value)} placeholder="m" style={{ width:44, padding:"7px 8px", borderRadius:8, border:`1px solid ${C.border}` }}/>
                <input value={customTimerSecs} onChange={e=>setCustomTimerSecs(e.target.value)} placeholder="s" style={{ width:44, padding:"7px 8px", borderRadius:8, border:`1px solid ${C.border}` }}/>
                <Btn sm onClick={handleSetTimerFromInputs}>Set</Btn>
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {!selectedDraft.timerRunning
                ? <Btn onClick={()=>dispatch({type:"START_WORKOUT_TIMER"})} style={{ flex:1 }}>▶ Start</Btn>
                : <Btn v="ghost" onClick={()=>dispatch({type:"PAUSE_WORKOUT_TIMER", now:new Date().toISOString()})} style={{ flex:1 }}>⏸ Pause</Btn>}
              <Btn v="ghost" onClick={()=>dispatch({type:"RESET_WORKOUT_TIMER"})}>↺ Reset</Btn>
              <Btn v="soft"  onClick={()=>dispatch({type:"COMPLETE_WORKOUT_TIMER"})}>✓ Finish</Btn>
            </div>
          </Card>
        )}

        {/* ── 3. Exercise input (today only) ── */}
        {selectedWorkoutDay === DAY && (
          <Card style={{ marginBottom:16, border:`1px solid ${selectedDraft.completed ? C.success : C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, gap:12, flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                  <p style={{ fontSize:10, color:C.textLight, letterSpacing:".1em", textTransform:"uppercase", fontWeight:700, margin:0 }}>Exercise</p>
                  {selectedDraft.editingId && <span style={{ fontSize:11, color:C.warn, fontWeight:700 }}>Editing</span>}
                </div>
                <input value={selectedDraft.name} onChange={(e)=>dispatch({type:"SET_WORKOUT_NAME", name:e.target.value})} placeholder="Exercise name" style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:13, color:C.text, outline:"none", background:C.bg }} />
              </div>
              <div style={{ display:"flex", gap:8, flexShrink:0, alignItems:"center" }}>
                <input type="number" value={selectedDraft.weight||""} onChange={(e)=>dispatch({type:"SET_WORKOUT_WEIGHT", weight:e.target.value})} placeholder="Weight" style={{ width:86, padding:"9px 10px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:13 }} />
                <select value={selectedDraft.weightUnit||"kg"} onChange={(e)=>dispatch({type:"SET_WORKOUT_WEIGHT_UNIT", weightUnit:e.target.value})} style={{ padding:"9px 10px", borderRadius:10, border:`1px solid ${C.border}` }}>
                  <option value="kg">kg</option>
                  <option value="lbs">lbs</option>
                </select>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <select value={selectedDraft.exerciseType} onChange={(e)=>dispatch({type:"SET_WORKOUT_EXERCISE_TYPE", exerciseType:e.target.value})} style={{ padding:"9px 12px", borderRadius:10, border:`1.5px solid ${C.border}` }}>
                <option value="reps">Reps</option>
                <option value="time">Time</option>
              </select>
              {selectedDraft.exerciseType === "reps" ? (
                <>
                  {Array.isArray(selectedDraft.sets) && selectedDraft.sets.length > 0 ? (
                    <div style={{ display:"flex", flexDirection:"column", gap:8, width:"100%" }}>
                      {selectedDraft.sets.map((s, idx) => (
                        <div key={s.id || idx} style={{ display:"flex", gap:8, alignItems:"center", width:"100%" }}>
                          <input type="number" value={s.reps||""} onChange={(e)=>dispatch({type:"UPDATE_WORKOUT_SET", id:s.id, reps:e.target.value})} placeholder="Reps" style={{ padding:"9px 12px", borderRadius:10, border:`1.5px solid ${C.border}`, width:84 }} />
                          <input type="number" value={s.weight||""} onChange={(e)=>dispatch({type:"UPDATE_WORKOUT_SET", id:s.id, weight:e.target.value})} placeholder="Weight" style={{ padding:"9px 12px", borderRadius:10, border:`1.5px solid ${C.border}`, width:86 }} />
                          <select value={s.weightUnit||"kg"} onChange={(e)=>dispatch({type:"UPDATE_WORKOUT_SET", id:s.id, weightUnit:e.target.value})} style={{ padding:"9px 10px", borderRadius:10, border:`1px solid ${C.border}` }}>
                            <option value="kg">kg</option>
                            <option value="lbs">lbs</option>
                          </select>
                          <Btn sm v="danger" onClick={() => dispatch({type:"REMOVE_WORKOUT_SET", id:s.id})}>Remove</Btn>
                        </div>
                      ))}
                      <div style={{ display:"flex", gap:8 }}>
                        <Btn v="ghost" sm onClick={() => dispatch({type:"CLEAR_WORKOUT_SETS"})}>Clear Sets</Btn>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display:"flex", gap:8, width:"100%", alignItems:"center" }}>
                      <input type="number" value={selectedDraft.reps||""} onChange={(e)=>dispatch({type:"SET_WORKOUT_REPS", reps:e.target.value})} placeholder="Reps" style={{ padding:"9px 12px", borderRadius:10, border:`1.5px solid ${C.border}` }} />
                    </div>
                  )}
                </>
              ) : (
                <input type="number" value={Math.floor((selectedDraft.durationSecs||0)/60)||""} onChange={(e)=>dispatch({type:"SET_WORKOUT_DURATION", durationSecs:Math.max(1,Number(e.target.value)||0)*60})} placeholder="Minutes" style={{ padding:"9px 12px", borderRadius:10, border:`1.5px solid ${C.border}` }} />
              )}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn onClick={handleSaveWorkout} disabled={!canCompleteWorkout} style={{ flex:1 }}>Save</Btn>
              <Btn v="ghost" onClick={handleClearWorkout}>Clear</Btn>
            </div>
          </Card>
        )}

        {/* ── 4. Workout record for selected day ── */}
        <div style={{ marginTop:14, padding:"12px", borderRadius:12, background:C.bg, border:`1px solid ${C.border}`, marginBottom:16 }}>
          <p style={{ fontSize:10, color:C.textLight, letterSpacing:".08em", textTransform:"uppercase", fontWeight:700, marginBottom:8 }}>
            {selectedWorkoutDay === DAY
              ? "Today's Workout"
              : new Date(`${selectedWorkoutDay}T12:00:00`).toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" })}
          </p>
          {selectedEntries.length > 0 ? (
            <div style={{ display:"flex", flexDirection:"column" }}>
              {selectedEntries.map((entry, index) => (
                <WorkoutEntryCard
                  key={entry.id || `${selectedWorkoutDay}-${index}`}
                  entry={entry}
                  dateKey={selectedWorkoutDay}
                  isToday={selectedWorkoutDay === DAY}
                  dispatch={dispatch}
                />
              ))}
            </div>
          ) : (
            <p style={{ fontSize:11, color:C.textLight }}>No saved workouts for this day.</p>
          )}
        </div>

        {/* ── 5. Body Metrics ── */}
        <Label>Body Metrics</Label>
        {selectedWorkoutDay === DAY ? (
          <Card style={{ marginBottom:16 }}>
            {todayMetric ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                <p style={{ fontSize:16, fontWeight:700 }}>{todayMetric.weight} kg</p>
                <button onClick={() => { if (window.confirm("Delete today's weight?")) dispatch({ type:"DELETE_BODY_METRIC", id:todayMetric.id }); }} style={{ fontSize:13, padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, background:C.pale, cursor:"pointer" }}>Delete</button>
              </div>
            ) : (
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="number" step="0.1" min="0" value={weightDraft} onChange={e=>setWeightDraft(e.target.value)} placeholder="Weight (kg)" style={{ padding:"9px 12px", borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:13, width:120 }} />
                <Btn onClick={addMetric} disabled={!weightDraft.trim() || !!todayMetric}>Log</Btn>
              </div>
            )}
          </Card>
        ) : (
          <Card style={{ marginBottom:16 }}>
            <p style={{ fontSize:11, color:C.textLight, marginBottom:8 }}>{new Date(`${selectedWorkoutDay}T12:00:00`).toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" })}</p>
            {selectedMetric ? (
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <p style={{ fontSize:16, fontWeight:700 }}>{selectedMetric.weight} kg</p>
                {selectedMetric.measurement && <p style={{ fontSize:11, color:C.textMid }}>{selectedMetric.measurement}</p>}
              </div>
            ) : (
              <p style={{ fontSize:11, color:C.textLight }}>No weight saved for this date.</p>
            )}
          </Card>
        )}
      </div>
    );
  }

  // ─── Settings View ────────────────────────────────────────────────────────────
  function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function rowsToCsv(rows) {
    return rows.map(row => row.map(csvCell).join(",")).join("\n");
  }

  function isDateKey(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function addDays(dateStr, days) {
    const date = new Date(`${dateStr}T12:00:00`);
    date.setDate(date.getDate() + days);
    return localDateStr(date);
  }

  function getDateRange(startDate, endDate) {
    const dates = [];
    let current = startDate;
    while (current <= endDate) {
      dates.push(current);
      current = addDays(current, 1);
    }
    return dates;
  }

  function getHabitTrackerStartDate(state) {
    const dates = new Set();

    Object.keys(state.routine.history || {}).filter(isDateKey).forEach(date => dates.add(date));
    Object.keys(state.tasks || {}).filter(isDateKey).forEach(date => dates.add(date));
    (state.recurringTasks || []).forEach(task => {
      if (isDateKey(task.startDate)) dates.add(task.startDate);
    });
    (state.habits || []).forEach(habit => {
      Object.keys(habit.history || {}).filter(isDateKey).forEach(date => dates.add(date));
    });

    const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
    const firstDate = sortedDates[0] || DAY;
    return firstDate > DAY ? DAY : firstDate;
  }

  function formatPercent(done, total) {
    if (!total) return 0;
    return Math.round((done / total) * 100);
  }

  function buildHabitTrackerExportCsv(state) {
    const habits = (state.habits || []).filter(habit => habit && habit.name);
    const rows = [[
      "Date",
      "Routine Move",
      "Routine Reflect",
      "Routine Grow",
      "Routine Complete",
      "Routine Score",
      "Daily Tasks Total",
      "Daily Tasks Done",
      "Daily Tasks Pending",
      "Daily Task Completion %",
      "Completed Daily Tasks",
      "Pending Daily Tasks",
      "Custom Habits Total",
      "Custom Habits Done",
      "Custom Habit Completion %",
      ...habits.map(habit => `Habit: ${habit.name}`),
    ]];

    getDateRange(getHabitTrackerStartDate(state), DAY).forEach(date => {
      const routine = state.routine.history?.[date] || {};
      const routineMove = routine.move ? 1 : 0;
      const routineReflect = routine.reflect ? 1 : 0;
      const routineGrow = routine.grow ? 1 : 0;
      const routineScore = routineMove + routineReflect + routineGrow;
      const dailyTasks = getTasksForDate(state, date);
      const completedTasks = dailyTasks.filter(task => task.done);
      const pendingTasks = dailyTasks.filter(task => !task.done);
      const completedTaskNames = completedTasks.map(task => task.text).filter(Boolean).join("; ");
      const pendingTaskNames = pendingTasks.map(task => task.text).filter(Boolean).join("; ");
      const completedHabitCount = habits.filter(habit => !!habit.history?.[date]).length;

      rows.push([
        date,
        routineMove,
        routineReflect,
        routineGrow,
        routineScore === 3 ? 1 : 0,
        routineScore,
        dailyTasks.length,
        completedTasks.length,
        pendingTasks.length,
        formatPercent(completedTasks.length, dailyTasks.length),
        completedTaskNames,
        pendingTaskNames,
        habits.length,
        completedHabitCount,
        formatPercent(completedHabitCount, habits.length),
        ...habits.map(habit => habit.history?.[date] ? 1 : 0),
      ]);
    });

    return rowsToCsv(rows);
  }

  function getWorkoutExportRestTime(entry) {
    return entry?.timerSecs ? formatWorkoutDuration(entry.timerSecs) : "";
  }

  function getWorkoutExportWeight(weight, unit) {
    if (weight === null || weight === undefined || String(weight).trim() === "") return "";
    return `${weight} ${unit || "kg"}`;
  }

  function addWorkoutExportEntryRows(rows, date, entry) {
    if (!entry) return;
    const name = entry.name?.trim() || getWorkoutSummary(entry);
    const restTime = getWorkoutExportRestTime(entry);

    if (entry.exerciseType === "time") {
      rows.push([
        date,
        name,
        getWorkoutExportWeight(entry.weight, entry.weightUnit),
        restTime,
        formatWorkoutDuration(entry.durationSecs),
      ]);
      return;
    }

    if (Array.isArray(entry.sets) && entry.sets.length > 0) {
      entry.sets.forEach((set) => {
        rows.push([
          date,
          name,
          getWorkoutExportWeight(set.weight ?? entry.weight, set.weightUnit || entry.weightUnit),
          restTime,
          set.reps ?? "",
        ]);
      });
      return;
    }

    rows.push([
      date,
      name,
      getWorkoutExportWeight(entry.weight, entry.weightUnit),
      restTime,
      entry.reps ?? "",
    ]);
  }

  function buildWorkoutExportCsv(state) {
    const rows = [["Date","Workout Name","Weight of Workout","Rest Time","Reps or Time"]];

    Object.entries(state.workout.history || {})
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .forEach(([date, day]) => {
        const entries = getWorkoutDayEntries(day);
        entries.forEach(entry => addWorkoutExportEntryRows(rows, date, entry));

        const draft = getWorkoutDayDraft(day);
        if (entries.length === 0 && draft?.name?.trim()) {
          addWorkoutExportEntryRows(rows, date, draft);
        }

        if (entries.length === 0 && !draft?.name?.trim() && day?.rest) {
          rows.push([date, "Rest Day", "", "", ""]);
        }
      });

    return rowsToCsv(rows);
  }

  function downloadCsvInBrowser(filename, csv) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function SettingsView({ state, dispatch }) {
    const [name, setName] = useState(state.profile.name);
    const [goalDraft, setGoalDraft] = useState("");
    const [exportStatus, setExportStatus] = useState("idle");
    const [exportKind, setExportKind] = useState(null);
    const [exportMessage, setExportMessage] = useState("");
    const maxStreak = Math.max(state.routine.streak, state.focus.streak, state.workout.streak, 0);
    const exportCSV = async () => {
      const filename = `kawa-habit-tracker-${DAY}.csv`;
      setExportStatus("loading");
      setExportKind("all");
      setExportMessage("Preparing habit tracker...");

      try {
        const csv = buildHabitTrackerExportCsv(state);
        const exportPlugin = window.Capacitor?.Plugins?.ExportPlugin;
        const isAndroidNative = window.Capacitor?.isNativePlatform?.() === true && window.Capacitor?.getPlatform?.() === "android";

        if (isAndroidNative && exportPlugin?.shareCsv) {
          await exportPlugin.shareCsv({ filename, csv });
          setExportStatus("success");
          setExportMessage("Choose where to save or share your habit tracker CSV.");
          return;
        }

        downloadCsvInBrowser(filename, csv);
        setExportStatus("success");
        setExportMessage("Habit tracker CSV download started.");
      } catch (error) {
        console.error("Habit tracker CSV export failed", error);
        setExportStatus("error");
        setExportMessage("Habit tracker export failed. Please try again.");
      }
    };
    const exportWorkoutCSV = async () => {
      const filename = `kawa-workouts-${DAY}.csv`;
      setExportStatus("loading");
      setExportKind("workout");
      setExportMessage("Preparing workout sheet...");

      try {
        const csv = buildWorkoutExportCsv(state);
        const exportPlugin = window.Capacitor?.Plugins?.ExportPlugin;
        const isAndroidNative = window.Capacitor?.isNativePlatform?.() === true && window.Capacitor?.getPlatform?.() === "android";

        if (isAndroidNative && exportPlugin?.shareCsv) {
          await exportPlugin.shareCsv({ filename, csv });
          setExportStatus("success");
          setExportMessage("Choose where to save or share your workout CSV.");
          return;
        }

        downloadCsvInBrowser(filename, csv);
        setExportStatus("success");
        setExportMessage("Workout CSV download started.");
      } catch (error) {
        console.error("Workout CSV export failed", error);
        setExportStatus("error");
        setExportMessage("Workout export failed. Please try again.");
      }
    };
    const isExporting = exportStatus === "loading";
    const isExportingAll = isExporting && exportKind === "all";
    const isExportingWorkout = isExporting && exportKind === "workout";
    const exportMessageColor = exportStatus === "error" ? "#c0392b" : exportStatus === "success" ? C.success : C.textMid;
    return (
      <div style={{ padding:"0 20px 200px" }}>
        <div style={{ paddingTop:52, paddingBottom:18 }}>
          <p style={{ fontSize:11, color:C.textMid, letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>Config</p>
          <h1 style={{ fontSize:28, fontWeight:800, color:C.text, letterSpacing:"-.03em", fontFamily:"'Syne', sans-serif" }}>Settings</h1>
        </div>
        <Label>Streak Grove</Label>
        <BambooGrove days={maxStreak} />
        <Label>Profile</Label>
        <Card style={{ marginBottom:20 }}>
          <div style={{ display:"flex", gap:8 }}>
            <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&dispatch({type:"SET_NAME",name})} placeholder="Your name" style={{ flex:1, padding:"9px 12px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", color:C.text, outline:"none", background:C.bg }}/>
            <Btn sm onClick={()=>dispatch({type:"SET_NAME",name})}>Save</Btn>
          </div>
        </Card>
        <Label>Lifetime Goals</Label>
        <Card style={{ marginBottom:20 }}>
          <div style={{ display:"flex", gap:8, marginBottom:state.lifetimeGoals.length?12:0 }}>
            <input value={goalDraft} onChange={e=>setGoalDraft(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&goalDraft.trim()){dispatch({type:"ADD_LIFETIME_GOAL",text:goalDraft.trim()});setGoalDraft("");}}} placeholder="Add a lifetime goal" style={{ flex:1, padding:"9px 12px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", color:C.text, outline:"none", background:C.bg }}/>
            <Btn sm onClick={()=>{ if(!goalDraft.trim()) return; dispatch({type:"ADD_LIFETIME_GOAL",text:goalDraft.trim()}); setGoalDraft(""); }} disabled={!goalDraft.trim()}>Add</Btn>
          </div>
          {state.lifetimeGoals.length===0 ? (
            <p style={{ fontSize:11, color:C.textLight, textAlign:"center", padding:"10px 0" }}>No lifetime goals yet. Add the big things you want to achieve.</p>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {state.lifetimeGoals.map((goal)=>(
                <div key={goal.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                  <button onClick={()=>dispatch({type:"TOGGLE_LIFETIME_GOAL",id:goal.id})} style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, border:`2px solid ${goal.done?C.success:C.border}`, background:goal.done?C.success:"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", fontSize:10, padding:0 }}>{goal.done?"✓":""}</button>
                  <span style={{ flex:1, fontSize:13, color:goal.done?C.textMid:C.text, textDecoration:goal.done?"line-through":"none", lineHeight:1.4 }}>{goal.text}</span>
                  <button onClick={()=>dispatch({type:"DELETE_LIFETIME_GOAL",id:goal.id})} style={{ fontSize:16, color:C.textLight, background:"none", border:"none", cursor:"pointer", padding:4, lineHeight:1 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Label>Data</Label>
        <Card style={{ marginBottom:20 }}>
          <p style={{ fontSize:13, color:C.text, fontWeight:600, marginBottom:3 }}>Export as CSV</p>
          <p style={{ fontSize:11, color:C.textMid, marginBottom:12 }}>Download routine, daily tasks, and custom habits for analysis.</p>
          <Btn v={exportStatus === "success" && exportKind === "all" ? "success" : "soft"} onClick={exportCSV} disabled={isExporting} style={{ width:"100%", marginBottom:8 }}>
            {isExportingAll ? "Preparing..." : exportStatus === "success" && exportKind === "all" ? "Habit Tracker Ready" : "Export Habit Tracker"}
          </Btn>
          <Btn v={exportStatus === "success" && exportKind === "workout" ? "success" : "ghost"} onClick={exportWorkoutCSV} disabled={isExporting} style={{ width:"100%" }}>
            {isExportingWorkout ? "Preparing..." : exportStatus === "success" && exportKind === "workout" ? "Workout CSV Ready" : "Export Workout Sheet"}
          </Btn>
          {exportMessage && (
            <p style={{ fontSize:11, color:exportMessageColor, marginTop:10, lineHeight:1.4 }}>{exportMessage}</p>
          )}
        </Card>
        <Label>About</Label>
        <Card style={{ marginBottom:20, padding:"20px 16px" }}>
          <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
            <div style={{ width:44, height:44, background:C.primary, borderRadius:13, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:22, opacity:0.9 }}>🌿</span></div>
            <div>
              <p style={{ fontSize:14, fontWeight:800, color:C.primary, fontFamily:"'Syne', sans-serif", marginBottom:3 }}>Kawa — Discipline Tracker</p>
              <p style={{ fontSize:11, color:C.textMid, lineHeight:1.6 }}>Inspired by The 5 AM Club · Robin Sharma</p>
              <p style={{ fontSize:11, color:C.textLight, marginTop:4 }}>v1.0.1 · Offline-first · localStorage</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Reducer ──────────────────────────────────────────────────────────────────
  function reducer(state, action) {
    switch (action.type) {
      case "TOGGLE_HABIT": {
        return { ...state, habits: state.habits.map(h=>{ if(h.id!==action.id) return h; const done=!!h.history[DAY]; return { ...h, streak:done?Math.max(0,h.streak-1):h.streak+1, history:done?Object.fromEntries(Object.entries(h.history).filter(([k])=>k!==DAY)):{...h.history,[DAY]:true} }; }) };
      }
      case "MARK_ROUTINE": {
        const existing=state.routine.history[DAY]||{}, todayR={...existing,[action.key]:true};
        const allDone=todayR.move&&todayR.reflect&&todayR.grow, wasAllDone=existing.move&&existing.reflect&&existing.grow;
        return { ...state, routine:{ ...state.routine, history:{...state.routine.history,[DAY]:todayR}, streak:allDone&&!wasAllDone?state.routine.streak+1:state.routine.streak } };
      }
      case "SET_GOAL":
        return { ...state, focus:{ ...state.focus, goal:action.goal, startDate:state.focus.startDate||DAY } };
      case "LOG_FOCUS": {
        const prev=state.focus.sessions[DAY]||0, next=prev+action.mins;
        return { ...state, focus:{ ...state.focus, sessions:{...state.focus.sessions,[DAY]:next}, streak:prev<90&&next>=90?state.focus.streak+1:state.focus.streak } };
      }
      case "SET_MUSCLE_GROUP": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, muscleGroup: action.muscleGroup }));
        return { ...state, workout: { ...state.workout, lastActiveDay: DAY, history, streak: computeWorkoutStreak(history) } };
      }
      case "SET_WORKOUT_TYPE": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, exerciseType: action.workoutType, updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, lastActiveDay: DAY, history, streak: computeWorkoutStreak(history) } };
      }
      case "SET_WORKOUT_CUSTOM": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, customType: action.customType, updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, lastActiveDay: DAY, history, streak: computeWorkoutStreak(history) } };
      }
      case "SET_WORKOUT_NAME": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, name: action.name, updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "SET_WORKOUT_WEIGHT": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, weight: action.weight, updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "SET_WORKOUT_WEIGHT_UNIT": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, weightUnit: action.weightUnit, updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "SET_WORKOUT_EXERCISE_TYPE": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, exerciseType: action.exerciseType, updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "ADD_WORKOUT_SET": {
        const set = action.set || {};
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => {
          const newSet = { id: set.id || uid(), reps: set.reps ?? null, weight: set.weight ?? null, weightUnit: set.weightUnit || 'kg' };
          const sets = [...(current.sets || []), newSet];
          return { ...current, sets, reps: current.reps ?? (sets[0]?.reps ?? null), updatedAt: new Date().toISOString() };
        });
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "UPDATE_WORKOUT_SET": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => {
          const sets = (current.sets || []).map((s) => (s.id === action.id ? { ...s,
            ...(action.reps !== undefined ? { reps: action.reps } : {}),
            ...(action.weight !== undefined ? { weight: action.weight } : {}),
            ...(action.weightUnit !== undefined ? { weightUnit: action.weightUnit } : {}),
          } : s));
          return { ...current, sets, reps: current.reps ?? (sets[0]?.reps ?? null), updatedAt: new Date().toISOString() };
        });
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "REMOVE_WORKOUT_SET": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => {
          const sets = (current.sets || []).filter((s) => s.id !== action.id);
          return { ...current, sets, reps: current.reps ?? (sets[0]?.reps ?? null), updatedAt: new Date().toISOString() };
        });
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "CLEAR_WORKOUT_SETS": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, sets: [], updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "SET_WORKOUT_REPS": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, reps: action.reps, updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "SET_WORKOUT_DURATION": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, durationSecs: Math.max(1, Number(action.durationSecs) || 60), updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "SET_WORKOUT_TIMER": {
        const timerSecs = Math.max(1, Number(action.timerSecs) || 60);
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, timerSecs, timerRemainingSecs: timerSecs, timerRunning: false, timerStartedAt: null, updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "START_WORKOUT_TIMER": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => {
          const remaining = Math.max(0, Number(current.timerRemainingSecs ?? current.timerSecs) || 0);
          return { ...current, timerRunning: remaining > 0, timerRemainingSecs: remaining || current.timerSecs, timerStartedAt: remaining > 0 ? new Date().toISOString() : null, updatedAt: new Date().toISOString() };
        });
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "PAUSE_WORKOUT_TIMER": {
        const nowMs = new Date(action.now || new Date().toISOString()).getTime();
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => {
          const remaining = getWorkoutTimerRemaining(current, nowMs);
          return { ...current, timerRunning: false, timerRemainingSecs: remaining, timerStartedAt: null, updatedAt: new Date().toISOString() };
        });
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "RESET_WORKOUT_TIMER": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, timerRunning: false, timerRemainingSecs: current.timerSecs, timerStartedAt: null, updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "COMPLETE_WORKOUT_TIMER": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, timerRunning: false, timerRemainingSecs: 0, timerStartedAt: null, updatedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "SAVE_WORKOUT_ENTRY": {
        const dateKey = action.date || DAY;
        const currentDay = normalizeWorkoutDay(state.workout.history[dateKey]) || createWorkoutDay();
        const draft = getWorkoutDayDraft(currentDay);
        if (draft.editingId) {
          const updatedEntry = { ...draft, id: draft.editingId, completed: false, completedAt: null, timerRunning: false, timerStartedAt: null, updatedAt: new Date().toISOString() };
          const entries = (currentDay.entries || []).map((e) => (e.id === draft.editingId ? updatedEntry : e));
          if (!entries.find((e) => e.id === updatedEntry.id)) entries.push(updatedEntry);
          const history = { ...state.workout.history, [dateKey]: { ...currentDay, entries, draft: createWorkoutEntry() } };
          return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
        }
        const nameKey = (draft.name || "").trim().toLowerCase();
        const entries = currentDay.entries || [];
        const matchIndex = entries.findIndex((e) => (e.name || "").trim().toLowerCase() === nameKey && e.exerciseType === (draft.exerciseType || "reps"));
        const makeSetsFromDraft = (d) => {
          if (!d) return [];
          if (Array.isArray(d.sets) && d.sets.length > 0) return d.sets.map(s=>({ id: s.id||uid(), reps: s.reps ?? null, weight: s.weight ?? null, weightUnit: s.weightUnit || 'kg' }));
          if (d.reps != null || d.weight != null) return [{ id: uid(), reps: d.reps ?? null, weight: d.weight ?? null, weightUnit: d.weightUnit || 'kg' }];
          return [];
        };
        const setsToAdd = makeSetsFromDraft(draft);
        if (matchIndex !== -1 && setsToAdd.length > 0 && (draft.exerciseType || 'reps') === 'reps') {
          const existing = entries[matchIndex];
          const merged = { ...existing, sets: [...(existing.sets || []).map(s=>({ id: s.id||uid(), reps: s.reps ?? null, weight: s.weight ?? null, weightUnit: s.weightUnit || 'kg' })), ...setsToAdd], updatedAt: new Date().toISOString() };
          const newEntries = entries.map((e, i) => (i === matchIndex ? merged : e));
          const history = { ...state.workout.history, [dateKey]: { ...currentDay, entries: newEntries, draft: createWorkoutEntry() } };
          return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
        }
        const savedEntry = { ...draft, id: uid(), sets: (setsToAdd.length ? setsToAdd : []), completed: false, completedAt: null, timerRunning: false, timerStartedAt: null, updatedAt: new Date().toISOString() };
        const history = { ...state.workout.history, [dateKey]: { ...currentDay, entries: [...(currentDay.entries || []), savedEntry], draft: createWorkoutEntry() } };
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "COMPLETE_WORKOUT_ENTRY": {
        const dateKey = action.date || DAY;
        const currentDay = normalizeWorkoutDay(state.workout.history[dateKey]) || createWorkoutDay();
        const draft = getWorkoutDayDraft(currentDay);
        if (draft.editingId) {
          const completedEntry = { ...draft, id: draft.editingId, completed: true, completedAt: draft.completedAt || new Date().toISOString(), timerRunning: false, timerStartedAt: null, timerRemainingSecs: 0, updatedAt: new Date().toISOString() };
          const entries = (currentDay.entries || []).map((e) => (e.id === draft.editingId ? completedEntry : e));
          if (!entries.find((e) => e.id === completedEntry.id)) entries.push(completedEntry);
          const history = { ...state.workout.history, [dateKey]: { ...currentDay, entries, draft: createWorkoutEntry() } };
          return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
        }
        const nameKey = (draft.name || "").trim().toLowerCase();
        const entries = currentDay.entries || [];
        const matchIndex = entries.findIndex((e) => (e.name || "").trim().toLowerCase() === nameKey && e.exerciseType === (draft.exerciseType || "reps"));
        const makeSetsFromDraft = (d) => {
          if (!d) return [];
          if (Array.isArray(d.sets) && d.sets.length > 0) return d.sets.map(s=>({ id: s.id||uid(), reps: s.reps ?? null, weight: s.weight ?? null, weightUnit: s.weightUnit || 'kg' }));
          if (d.reps != null || d.weight != null) return [{ id: uid(), reps: d.reps ?? null, weight: d.weight ?? null, weightUnit: d.weightUnit || 'kg' }];
          return [];
        };
        const setsToAdd = makeSetsFromDraft(draft);
        if (matchIndex !== -1 && setsToAdd.length > 0 && (draft.exerciseType || 'reps') === 'reps') {
          const existing = entries[matchIndex];
          const merged = { ...existing, sets: [...(existing.sets || []).map(s=>({ id: s.id||uid(), reps: s.reps ?? null, weight: s.weight ?? null, weightUnit: s.weightUnit || 'kg' })), ...setsToAdd], updatedAt: new Date().toISOString(), completed: true, completedAt: new Date().toISOString() };
          const newEntries = entries.map((e, i) => (i === matchIndex ? merged : e));
          const history = { ...state.workout.history, [dateKey]: { ...currentDay, entries: newEntries, draft: createWorkoutEntry() } };
          return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
        }
        const completedEntry = { ...draft, id: uid(), sets: (setsToAdd.length ? setsToAdd : []), completed: true, completedAt: draft.completedAt || new Date().toISOString(), timerRunning: false, timerStartedAt: null, timerRemainingSecs: 0, updatedAt: new Date().toISOString() };
        const history = { ...state.workout.history, [dateKey]: { ...currentDay, entries: [...(currentDay.entries || []), completedEntry], draft: createWorkoutEntry() } };
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "CLEAR_WORKOUT_ENTRY": {
        const dateKey = action.date || DAY;
        const currentDay = normalizeWorkoutDay(state.workout.history[dateKey]) || createWorkoutDay();
        const history = { ...state.workout.history, [dateKey]: { ...currentDay, draft: createWorkoutEntry() } };
        if ((currentDay.entries || []).length === 0) delete history[dateKey];
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "LOAD_WORKOUT_ENTRY": {
        const dateKey = action.date || DAY;
        const currentDay = normalizeWorkoutDay(state.workout.history[dateKey]) || createWorkoutDay();
        const entry = (currentDay.entries || []).find((e) => e.id === action.id);
        if (!entry) return state;
        const draft = normalizeWorkoutEntry(entry);
        draft.editingId = entry.id;
        const history = { ...state.workout.history, [dateKey]: { ...currentDay, draft } };
        return { ...state, workout: { ...state.workout, history } };
      }
      case "DELETE_WORKOUT_ENTRY": {
        const dateKey = action.date || DAY;
        const currentDay = normalizeWorkoutDay(state.workout.history[dateKey]) || createWorkoutDay();
        const entries = (currentDay.entries || []).filter((e) => e.id !== action.id);
        const draft = getWorkoutDayDraft(currentDay);
        const newDraft = draft?.editingId === action.id ? createWorkoutEntry() : draft;
        const history = { ...state.workout.history, [dateKey]: { ...currentDay, entries, draft: newDraft } };
        if (entries.length === 0 && (!newDraft || !newDraft.name || !newDraft.name.trim())) delete history[dateKey];
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history) } };
      }
      case "START_WORKOUT": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, timerRunning: true, timerStartedAt: new Date().toISOString(), timerRemainingSecs: current.timerRemainingSecs ?? current.timerSecs }));
        return { ...state, workout: { ...state.workout, lastActiveDay: DAY, history, streak: computeWorkoutStreak(history) } };
      }
      case "PAUSE_WORKOUT": {
        const nowMs = new Date().getTime();
        const currentDay = getTodayWorkoutDay(state.workout.history);
        const draft = getWorkoutDayDraft(currentDay);
        const remaining = getWorkoutTimerRemaining(draft, nowMs);
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, timerRunning: false, timerRemainingSecs: remaining, timerStartedAt: null }));
        return { ...state, workout: { ...state.workout, lastActiveDay: DAY, history, streak: computeWorkoutStreak(history) } };
      }
      case "RESUME_WORKOUT": {
        const history = updateTodayWorkoutDraft(state.workout.history, (current) => ({ ...current, timerRunning: true, timerStartedAt: new Date().toISOString() }));
        return { ...state, workout: { ...state.workout, lastActiveDay: DAY, history, streak: computeWorkoutStreak(history) } };
      }
      case "FINISH_WORKOUT": {
        const currentDay = getTodayWorkoutDay(state.workout.history);
        const draft = getWorkoutDayDraft(currentDay);
        const completedEntry = { ...draft, id: uid(), completed: true, completedAt: draft.completedAt || new Date().toISOString(), timerRunning: false, timerStartedAt: null, timerRemainingSecs: 0, updatedAt: new Date().toISOString() };
        const history = { ...state.workout.history, [DAY]: { ...currentDay, entries: [...currentDay.entries, completedEntry], draft: createWorkoutEntry() } };
        return { ...state, workout: { ...state.workout, history, streak: computeWorkoutStreak(history), lastActiveDay: DAY } };
      }
      case "REST_WORKOUT": {
        const currentDay = getTodayWorkoutDay(state.workout.history);
        const history = { ...state.workout.history, [DAY]: { ...currentDay, entries: currentDay.entries || [], draft: createWorkoutEntry(), rest: true } };
        return { ...state, workout: { ...state.workout, streak: 0, lastActiveDay: DAY, history } };
      }
      case "ADD_TASK": {
        // If this task is a recurring daily task, store in recurringTasks
        if (action.repeat === 'daily') {
          const startDate = action.startDate || DAY;
          return { ...state, recurringTasks: [...(state.recurringTasks||[]), { id: uid(), text: action.text, scheduledTime: action.scheduledTime || null, repeat: 'daily', startDate }] };
        }
        const date = action.date || DAY;
        const ts = state.tasks[date] || [];
        return { ...state, tasks: { ...state.tasks, [date]: [...ts, { id: uid(), text: action.text, done: !!action.done, scheduledTime: action.scheduledTime || null, ...(action.recurringInstanceOf ? { recurringInstanceOf: action.recurringInstanceOf } : {}) }] } };
      }
      case "TOGGLE_RECURRING": {
        const rid = action.id;
        const date = action.date || DAY;
        const perDay = state.tasks[date] || [];
        const existing = perDay.find(t => t.recurringInstanceOf === rid);
        if (existing) {
          // toggle done on the per-day instance
          const updated = perDay.map(t => t.recurringInstanceOf === rid ? { ...t, done: !t.done } : t);
          return { ...state, tasks: { ...state.tasks, [date]: updated } };
        }
        // create a per-day instance marked done
        const r = (state.recurringTasks || []).find(rt => rt.id === rid);
        if (!r) return state;
        const newTask = { id: uid(), text: r.text, done: true, scheduledTime: r.scheduledTime || null, recurringInstanceOf: rid };
        return { ...state, tasks: { ...state.tasks, [date]: [...perDay, newTask] } };
      }
      case "DELETE_RECURRING": {
        const rid = action.id;
        const recurring = (state.recurringTasks || []).filter(r => r.id !== rid);
        const tasks = { ...state.tasks };
        Object.keys(tasks).forEach((dateKey) => {
          const kept = (tasks[dateKey] || []).reduce((acc, t) => {
            if (t.recurringInstanceOf === rid) {
              // preserve already completed instances but convert them to normal tasks
              if (t.done) {
                const copy = { ...t };
                delete copy.recurringInstanceOf;
                acc.push(copy);
              }
              // otherwise drop the instance
            } else {
              acc.push(t);
            }
            return acc;
          }, []);
          if (kept.length === 0) delete tasks[dateKey]; else tasks[dateKey] = kept;
        });
        return { ...state, recurringTasks: recurring, tasks };
      }
      case "UPDATE_RECURRING_TIME": {
        const rid = action.id;
        return { ...state, recurringTasks: (state.recurringTasks || []).map(r => r.id === rid ? { ...r, scheduledTime: action.scheduledTime } : r) };
      }
      case "TOGGLE_TASK": {
        const date=action.date||DAY;
        return { ...state, tasks:{ ...state.tasks, [date]:(state.tasks[date]||[]).map(t=>t.id===action.id?{...t,done:!t.done}:t) } };
      }
      case "DELETE_TASK": {
        const date=action.date||DAY;
        return { ...state, tasks:{ ...state.tasks, [date]:(state.tasks[date]||[]).filter(t=>t.id!==action.id) } };
      }
      case "UPDATE_TASK_TIME": {
        const date=action.date||DAY;
        return { ...state, tasks:{ ...state.tasks, [date]:(state.tasks[date]||[]).map(t=>t.id===action.id?{...t,scheduledTime:action.scheduledTime}:t) } };
      }
      case "SET_NAME":
        return { ...state, profile:{ ...state.profile, name:action.name } };
      case "SET_WAKE_UP_TIME":
        return { ...state, profile:{ ...state.profile, wakeUpTime:action.wakeUpTime } };
      case "ADD_LIFETIME_GOAL":
        return { ...state, lifetimeGoals:[...state.lifetimeGoals,{id:uid(),text:action.text,done:false}] };
      case "TOGGLE_LIFETIME_GOAL":
        return { ...state, lifetimeGoals:state.lifetimeGoals.map(goal=>goal.id===action.id?{...goal,done:!goal.done}:goal) };
      case "DELETE_LIFETIME_GOAL":
        return { ...state, lifetimeGoals:state.lifetimeGoals.filter(goal=>goal.id!==action.id) };
      case "ADD_BODY_METRIC": {
        const exists = (state.bodyMetrics || []).some((m) => m.date === action.date);
        if (exists) return state;
        return { ...state, bodyMetrics:[...state.bodyMetrics,{id:uid(),date:action.date,weight:action.weight}] };
      }
      case "DELETE_BODY_METRIC":
        return { ...state, bodyMetrics:state.bodyMetrics.filter(entry=>entry.id!==action.id) };
      case "ADD_HABIT":
        return { ...state, habits:[...state.habits,{id:uid(),name:action.name,streak:0,history:{}}] };
      case "DELETE_HABIT":
        return { ...state, habits:state.habits.filter(h=>h.id!==action.id) };
      case "SCHEDULE_JOY_SESSION": {
        const sessions=state.joySession.history[WEEK]||[];
        if(sessions.length>=2) return state;
        const filtered=sessions.filter(s=>s.scheduledDay!==action.scheduledDay);
        if(filtered.length>=2) return state;
        const next=[...filtered,{id:uid(),text:action.text,scheduledDay:action.scheduledDay,scheduledTime:action.scheduledTime||null,done:false}];
        const justCompleted=next.length===2&&sessions.length<2;
        return { ...state, joySession:{ ...state.joySession, streak:justCompleted?state.joySession.streak+1:state.joySession.streak, history:{ ...state.joySession.history, [WEEK]:next } } };
      }
      case "UPDATE_JOY_SESSION_TIME": {
        const sessions=(state.joySession.history[WEEK]||[]).map(s=>s.id===action.id?{...s,scheduledTime:action.scheduledTime}:s);
        return { ...state, joySession:{ ...state.joySession, history:{ ...state.joySession.history, [WEEK]:sessions } } };
      }
      case "TOGGLE_JOY_SESSION": {
        const sessions=(state.joySession.history[WEEK]||[]).map(s=>s.id===action.id?{...s,done:!s.done}:s);
        return { ...state, joySession:{ ...state.joySession, history:{ ...state.joySession.history, [WEEK]:sessions } } };
      }
      case "DELETE_JOY_SESSION": {
        const sessions=(state.joySession.history[WEEK]||[]).filter(s=>s.id!==action.id);
        return { ...state, joySession:{ ...state.joySession, history:{ ...state.joySession.history, [WEEK]:sessions } } };
      }
      default: return state;
    }
  }

  // ─── Wind Icon ────────────────────────────────────────────────────────────────
  const WindIcon = ({ size=17, color="currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  );

  // ─── Nav ──────────────────────────────────────────────────────────────────────
  const TABS = [
    { id:"home",     label:"Home",   icon:"⌂" },
    { id:"routine",  label:"Ritual", icon:"◎" },
    { id:"focus",    label:"Focus",  icon:"◉" },
    { id:"tasks",    label:"Tasks",  icon:"✓" },
    { id:"workout",  label:"Wind",   icon:null },
    { id:"settings", label:"More",   icon:"⚙" },
  ];

  // ─── Initial State ────────────────────────────────────────────────────────────
  const INIT = {
    profile: { name:"Practitioner", wakeUpTime:"05:00" },
    routine: { history:{}, streak:0 },
    focus:   { goal:"", startDate:null, sessions:{}, streak:0 },
    tasks:   {},
    recurringTasks: [],
    workout: { streak:0, history:{}, lastActiveDay:DAY },
    secondWind: { duration:30, type:"walk", streak:0, history:{} },
    bodyMetrics: [],
    lifetimeGoals: [],
    habits:  [],
    joySession: { streak:0, history:{} },
  };

  const DEFAULT_HABIT_NAMES = new Set(["Morning meditation","Cold shower","Evening journal"]);

  function normalizeState(savedState) {
    if (!savedState || typeof savedState !== "object") return INIT;
    return {
      ...INIT, ...savedState,
      profile: { ...INIT.profile, ...(savedState.profile || {}) },
      workout: normalizeWorkout(savedState.workout),
      secondWind: { ...INIT.secondWind, ...(savedState.secondWind||{}), duration:[30,45,60].includes(savedState.secondWind?.duration)?savedState.secondWind.duration:INIT.secondWind.duration, type:["walk","gym","stretch"].includes(savedState.secondWind?.type)?savedState.secondWind.type:INIT.secondWind.type, history:savedState.secondWind?.history&&typeof savedState.secondWind.history==="object"?savedState.secondWind.history:{} },
      bodyMetrics: Array.isArray(savedState.bodyMetrics)?savedState.bodyMetrics.filter(entry=>entry&&typeof entry.date==="string"&&Number.isFinite(Number(entry.weight))).map(entry=>({id:entry.id||uid(),date:entry.date,weight:Number(entry.weight)})).sort((a,b)=>a.date.localeCompare(b.date)):[],
      lifetimeGoals: Array.isArray(savedState.lifetimeGoals)?savedState.lifetimeGoals.filter(goal=>goal&&typeof goal.text==="string").map(goal=>({id:goal.id||uid(),text:goal.text,done:!!goal.done})):[],
      habits: Array.isArray(savedState.habits)?savedState.habits.filter(h=>!DEFAULT_HABIT_NAMES.has(h?.name)):[],
      recurringTasks: Array.isArray(savedState.recurringTasks)?savedState.recurringTasks.filter(rt=>rt&&typeof rt.text==="string").map(rt=>({ id: rt.id||uid(), text: rt.text, scheduledTime: rt.scheduledTime||null, repeat: rt.repeat||null, startDate: rt.startDate || DAY })) : [],
      joySession: { streak:savedState.joySession?.streak||0, history:savedState.joySession?.history&&typeof savedState.joySession.history==="object"?savedState.joySession.history:{} },
    };
  }

  // ─── App Root ─────────────────────────────────────────────────────────────────
  export default function KawaApp() {
    const [state, dispatch] = useReducer(reducer, INIT, () => {
      try { const saved=localStorage.getItem("kawa-state"); return saved?normalizeState(JSON.parse(saved)):INIT; }
      catch { return INIT; }
    });

    useEffect(() => { localStorage.setItem("kawa-state", JSON.stringify(state)); }, [state]);
    useEffect(() => {
      const t=setTimeout(async ()=>{
        await requestPermission();
        await reconcileScheduledReminders(state);
      },2000);
      return ()=>clearTimeout(t);
    }, []);
    useEffect(() => { reconcileScheduledReminders(state); }, [state.profile.wakeUpTime, state.tasks, state.joySession]);

    useEffect(() => {
      const isNativeApp=window.Capacitor?.isNativePlatform?.()===true;
      if(!isNativeApp) return undefined;
      const isEditable=(target)=>target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable="true"],[data-allow-native-menu="true"]');
      const onCtx=(e)=>{ if(!isEditable(e.target)) e.preventDefault(); };
      const onSel=(e)=>{ if(!isEditable(e.target)) e.preventDefault(); };
      document.addEventListener("contextmenu",onCtx);
      document.addEventListener("selectstart",onSel);
      return ()=>{ document.removeEventListener("contextmenu",onCtx); document.removeEventListener("selectstart",onSel); };
    }, []);

    const [tab, setTab] = useState("home");
    const t1=useTimer(20*60,"Move 🏃"), t2=useTimer(20*60,"Reflect 🧘"), t3=useTimer(20*60,"Grow 📚");
    const focusTimer=useTimer(90*60,"Deep Focus 🎯");

    const VIEWS = {
      home:     <HomeView    state={state} dispatch={dispatch} />,
      routine:  <RoutineView state={state} dispatch={dispatch} t1={t1} t2={t2} t3={t3} />,
      focus:    <FocusView   state={state} dispatch={dispatch} timer={focusTimer} />,
      tasks:    <TasksView   state={state} dispatch={dispatch} />,
      workout:  <WorkoutView state={state} dispatch={dispatch} />,
      settings: <SettingsView state={state} dispatch={dispatch} />,
    };

    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');
          *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
          html,body,#kawa-root{height:100%;}
          body{background:${C.bg};-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;overscroll-behavior:none;}
          input,button,textarea,select{font-family:'DM Sans',sans-serif;}
          input,textarea,select,[contenteditable="true"],[data-allow-selection="true"]{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default;}
          a,button,img,svg{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;}
          ::-webkit-scrollbar{width:0;height:0;}
        `}</style>
        <div style={{ maxWidth:430, margin:"0 auto", minHeight:"100vh", background:C.bg, fontFamily:"'DM Sans', sans-serif", position:"relative", isolation:"isolate" }}>
          {[{right:22,opacity:0.038},{right:46,opacity:0.022}].map((b,bi)=>(
            <div key={bi} aria-hidden style={{ position:"fixed", top:0, right:b.right, height:"100vh", pointerEvents:"none", zIndex:0, opacity:b.opacity }}>
              <svg width="14" height="100%" viewBox="0 0 14 900" preserveAspectRatio="none">
                <rect x="6" y="0" width="2" height="900" fill={C.primary}/>
                {[90,190,290,390,490,590,690,790].map(y=><rect key={y} x="1" y={y} width="12" height="3.5" rx="1.75" fill={C.primary}/>)}
              </svg>
            </div>
          ))}
          <div style={{ position:"relative", zIndex:1, overflowY:"auto", height:"100vh", scrollbarWidth:"none" }}>{VIEWS[tab]}</div>
          <nav style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"rgba(248,251,248,.94)", backdropFilter:"blur(18px)", borderTop:`1px solid ${C.border}`, display:"flex", zIndex:20 }}>
            {TABS.map(({id,label,icon})=>{
              const active=tab===id;
              return (
                <button key={id} onClick={()=>setTab(id)} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"9px 4px 11px", background:"none", border:"none", cursor:"pointer", color:active?C.primary:C.textLight, transition:"color .18s", position:"relative" }}>
                  {active&&<span style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:22, height:2, background:C.primary, borderRadius:"0 0 2px 2px" }}/>}
                  {id==="workout"?<WindIcon size={17} color={active?C.primary:C.textLight}/>:<span style={{ fontSize:17, lineHeight:1 }}>{icon}</span>}
                  <span style={{ fontSize:8, fontWeight:active?700:500, letterSpacing:".07em", textTransform:"uppercase", fontFamily:"inherit" }}>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </>
    );
  }
