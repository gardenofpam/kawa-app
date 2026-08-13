import { useState, useEffect, useRef, useReducer } from "react";
import { showTimerNotification, clearTimerNotification, requestPermission } from './timerNotification';

// ─── Design Tokens ────────────────────────────────────────────────────────────
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

const DAY = new Date().toISOStit("T")[0];
const TODAY_LABEL = new Date().toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric",
});
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const clamp = (v, mn, mx) => Math.min(Math.max(v, mn), mx);

// ─── Micro Components ─────────────────────────────────────────────────────────

function Ring({ pct = 0, size = 72, sw = 5, color, label, sub }) {
  color = color || C.primary;
  const r = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - clamp(pct / 100, 0, 1) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={C.pale} strokeWidth={sw} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={sw} fill="none"
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
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
    padding: sm ? "7px 13px" : "10px 20px",
    borderRadius: 100, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    fontSize: sm ? 11 : 13, fontWeight: 600, fontFamily: "inherit",
    transition: "opacity .15s", opacity: disabled ? 0.45 : 1, ...sx,
  };
  const vs = {
    primary: { ...base, background: C.primary, color: "#fff" },
    ghost: { ...base, background: "transparent", color: C.primary, border: `1.5px solid ${C.border}` },
    soft: { ...base, background: C.pale, color: C.primary },
    success: { ...base, background: C.success, color: "#fff" },
    danger: { ...base, background: "#fce8e6", color: "#c0392b" },
  };
  return (
    <button style={vs[v] || vs.primary} onClick={disabled ? undefined : onClick} disabled={disabled}>
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
        <circle cx="5.5" cy="3" r="1.8" fill="rgba(255,255,255,.12)" />
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
  const notifRef = useRef(null);

  useEffect(() => {
    if (running && secs > 0) {
      ref.current = setInterval(() => {
        setSecs((s) => {
          if (s <= 1) {
            clearInterval(ref.current);
            setRunning(false);
            clearTimerNotification();
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      // Update notification every 10 seconds to save battery
      notifRef.current = setInterval(async () => {
        setSecs((s) => {
          showTimerNotification(label, s);
          return s;
        });
      }, 10000);

      // Show immediately when started
      showTimerNotification(label, secs);

    } else {
      clearInterval(ref.current);
      clearInterval(notifRef.current);
      if (!running) clearTimerNotification();
    }

    return () => {
      clearInterval(ref.current);
      clearInterval(notifRef.current);
    };
  }, [running]);

  return {
    secs,
    running,
    start: () => { if (secs > 0) setRunning(true); },
    pause: () => {
      setRunning(false);
      ring().splclearTimerNotification();
    },
    reset: (v) => {
      clearInterval(ref.current);
      clearInterval(notifRef.current);
      setRunning(false);
      clearTimerNotification();
      setSecs(v !== undefined ? v : init);
    },
  };
}

// ─── Home View ────────────────────────────────────────────────────────────────
function HomeView({ state, dispatch }) {
  const todayTasks = state.tasks[DAY] || [];
  const doneTasks = todayTasks.filter((t) => t.done).length;
  const todayR = state.routine.history[DAY] || {};
  const routineDone = [todayR.move, todayR.reflect, todayR.grow].filter(Boolean).length;
  const focusMins = state.focus.sessions[DAY] || 0;
  const maxStreak = Math.max(state.routine.streak, state.focus.streak, 0);

  const QUOTES = [
    "Own your morning. Elevate your life.",
    "Small daily improvements lead to stunning results.",
    "Consistency is the mother of mastery.",
    "Your future is hidden in your daily routine.",
    "Invest in yourself — it pays the best interest.",
    "Rise early. Work hard. Stay disciplined.",
    "The quality of your practice defines your performance.",
  ];
  const quote = QUOTES[new Date().getDay() % QUOTES.length];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ padding: "0 20px 100px" }}>
      <div style={{ paddingTop: 52, paddingBottom: 12 }}>
        <KawaLogo />
        <p style={{ fontSize: 11, color: C.textMid, letterSpacing: ".08em", textTransform: "uppercase",
            marginTop: 16, marginBottom: 4 }}>{TODAY_LABEL}</p>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: "-.03em",
            lineHeight: 1.2, fontFamily: "'Syne', sans-serif" }}>
          {greeting}, {state.profile.name} 🌿
        </h1>
      </div>

      {/* Streak Hero */}
      <div style={{ background: `linear-gradient(135deg, ${C.primary} 0%, #2a4f38 100%)`,
          borderRadius: 20, padding: "20px 22px", marginTop: 14, marginBottom: 14,
          position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
            fontSize: 72, opacity: 0.08, fontFamily: "serif", lineHeight: 1, pointerEvents: "none" }}>竹</div>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: 9, letterSpacing: ".12em",
            textTransform: "uppercase", marginBottom: 6 }}>Current Streak</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 52, fontWeight: 800, color: "#fff", lineHeight: 1,
              fontFamily: "'Syne', sans-serif" }}>{maxStreak}</span>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,.55)" }}>days</span>
        </div>
        <p style={{ color: "rgba(255,255,255,.45)", fontSize: 11, marginTop: 6 }}>
          {maxStreak === 0 ? "Start your journey today" : maxStreak >= 21 ? "You're unstoppable 🔥" : maxStreak >= 7 ? "Great momentum 💪" : "Keep going!"}
        </p>
      </div>

      {/* Quote */}
      <div style={{ padding: "11px 14px", borderLeft: `3px solid ${C.mid}`,
          background: C.pale, borderRadius: "0 10px 10px 0", marginBottom: 16 }}>
        <p style={{ color: C.text, fontSize: 12, fontStyle: "italic", lineHeight: 1.6, margin: 0, opacity: 0.75 }}>
          "{quote}"
        </p>
      </div>

      {/* Summary row */}
      <Label>Today's Progress</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { lbl: "Routine", pct: (routineDone / 3) * 100, val: `${routineDone}/3`, col: C.primary },
          { lbl: "Tasks", pct: todayTasks.length ? (doneTasks / todayTasks.length) * 100 : 0,
              val: `${doneTasks}/${todayTasks.length || 5}`, col: C.mid },
          { lbl: "Focus", pct: clamp((focusMins / 90) * 100, 0, 100),
              val: focusMins ? `${focusMins}m` : "—", col: focusMins >= 90 ? C.success : C.primary },
        ].map(({ lbl, pct, val, col }) => (
          <Card key={lbl} style={{ display: "flex", flexDirection: "column", alignItems: "center",
              gap: 6, padding: "12px 6px" }}>
            <Ring pct={pct} size={52} sw={4} color={col} label={val} />
            <span style={{ fontSize: 9, color: C.textMid, fontWeight: 700, letterSpacing: ".08em",
                textTransform: "uppercase" }}>{lbl}</span>
          </Card>
        ))}
      </div>

      {/* Habits */}
      {state.habits.length > 0 && (
        <>
          <Label>Habits</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {state.habits.map((h) => {
              const done = !!h.history[DAY];
              return (
                <Card key={h.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 10 }}>
                  <button onClick={() => dispatch({ type: "TOGGLE_HABIT", id: h.id })}
                    style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      border: `2px solid ${done ? C.success : C.border}`,
                      background: done ? C.success : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", color: "#fff", fontSize: 10, padding: 0 }}>
                    {done ? "✓" : ""}
                  </button>
                  <span style={{ flex: 1, fontSize: 13, color: done ? C.textMid : C.text,
                      textDecoration: done ? "line-through" : "none" }}>{h.name}</span>
                  <span style={{ fontSize: 11, color: C.textLight }}>🔥 {h.streak}</span>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Routine View ─────────────────────────────────────────────────────────────
function RoutineView({ state, dispatch, t1, t2, t3 }) {
  const done = state.routine.history[DAY] || {};
  const timers = [t1, t2, t3];
  const completedAll = done.move && done.reflect && done.grow;
  const BLOCKS = [
    { key: "move", label: "Move", icon: "🏃", desc: "Cardio · Strength · Stretch", color: "#45a870" },
    { key: "reflect", label: "Reflect", icon: "🧘", desc: "Meditate · Journal · Breathe", color: "#5c8fa8" },
    { key: "grow", label: "Grow", icon: "📚", desc: "Read · Learn · Listen", color: "#8b73c0" },
  ];

  return (
    <div style={{ padding: "0 20px 100px" }}>
      <div style={{ paddingTop: 52, paddingBottom: 18 }}>
        <p style={{ fontSize: 11, color: C.textMid, letterSpacing: ".08em", textTransform: "uppercase",
            marginBottom: 4 }}>Daily Ritual</p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: "-.03em",
            fontFamily: "'Syne', sans-serif" }}>20/20/20</h1>
        <p style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>Win the first hour, win the day.</p>
      </div>

      <Card style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
        <Ring pct={clamp((state.routine.streak / 90) * 100, 0, 100)} size={52} sw={4}
          label={String(state.routine.streak)} sub="streak" />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>Routine Streak</p>
          <p style={{ fontSize: 11, color: C.textMid }}>
            {state.routine.streak >= 90 ? "🎉 90-day master!" : `${90 - state.routine.streak} days to mastery`}
          </p>
        </div>
        {completedAll && (
          <span style={{ fontSize: 10, background: C.pale, color: C.primary, padding: "3px 8px",
              borderRadius: 100, fontWeight: 700 }}>✓ Done</span>
        )}
      </Card>

      {BLOCKS.map(({ key, label, icon, desc, color }, i) => {
        const isDone = !!done[key];
        const timer = timers[i];
        const elapsed = 20 * 60 - timer.secs;
        const pct = isDone ? 100 : (elapsed / (20 * 60)) * 100;
        return (
          <Card key={key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Ring pct={pct} size={64} sw={5} color={isDone ? C.success : color}
                label={isDone ? "✓" : fmt(timer.secs)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 17 }}>{icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{label}</span>
                  <span style={{ fontSize: 10, color: C.textLight, background: C.alt,
                      borderRadius: 100, padding: "2px 7px" }}>20 min</span>
                </div>
                <p style={{ fontSize: 11, color: C.textMid }}>{desc}</p>
              </div>
            </div>
            {!isDone && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12,
                  borderTop: `1px solid ${C.border}` }}>
                {!timer.running
                  ? <Btn sm onClick={timer.start} style={{ flex: 1 }}>▶ Start</Btn>
                  : <Btn sm v="ghost" onClick={timer.pause} style={{ flex: 1 }}>⏸ Pause</Btn>}
                <Btn sm v="ghost" onClick={() => timer.reset()}>↺</Btn>
                <Btn sm v="soft" onClick={() => dispatch({ type: "MARK_ROUTINE", key })}>Mark Done</Btn>
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

  const daysSince = state.focus.startDate
    ? Math.max(1, Math.floor((Date.now() - new Date(state.focus.startDate)) / 86400000) + 1)
    : 0;
  const todayMins = state.focus.sessions[DAY] || 0;
  const elapsed = Math.floor((90 * 60 - timer.secs) / 60);

  const handleLog = () => {
    if (elapsed < 1) return;
    dispatch({ type: "LOG_FOCUS", mins: elapsed });
    timer.reset();
    setLogged(true);
    setTimeout(() => setLogged(false), 2500);
  };

  return (
    <div style={{ padding: "0 20px 100px" }}>
      <div style={{ paddingTop: 52, paddingBottom: 18 }}>
        <p style={{ fontSize: 11, color: C.textMid, letterSpacing: ".08em", textTransform: "uppercase",
            marginBottom: 4 }}>Deep Work</p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: "-.03em",
            fontFamily: "'Syne', sans-serif" }}>90/90/1</h1>
        <p style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>One goal. 90 days. 90 minutes daily.</p>
      </div>

      {/* Goal card */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Label>Your One Goal</Label>
          <button onClick={() => setEditing(!editing)}
            style={{ fontSize: 11, color: C.primary, background: "none", border: "none",
              cursor: "pointer", fontWeight: 600, fontFamily: "inherit", padding: 0, marginTop: -8 }}>
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
        {editing ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { dispatch({ type: "SET_GOAL", goal: draft }); setEditing(false); }
              }}
              placeholder="e.g. Build my first product…"
              style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`,
                fontSize: 13, fontFamily: "inherit", color: C.text, outline: "none", background: C.bg }} />
            <Btn sm onClick={() => { dispatch({ type: "SET_GOAL", goal: draft }); setEditing(false); }}>Set</Btn>
          </div>
        ) : (
          <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4,
              color: state.focus.goal ? C.text : C.textLight,
              fontStyle: state.focus.goal ? "normal" : "italic" }}>
            {state.focus.goal || "No goal set — tap Edit to begin"}
          </p>
        )}
      </Card>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        {[
          { val: Math.min(daysSince, 90), max: 90, lbl: "days", col: C.primary },
          { val: todayMins, max: 90, lbl: "min today", col: todayMins >= 90 ? C.success : C.mid },
          { val: state.focus.streak, max: 90, lbl: "streak", col: C.warn },
        ].map(({ val, max, lbl, col }) => (
          <Card key={lbl} style={{ display: "flex", flexDirection: "column", alignItems: "center",
              gap: 6, padding: "14px 6px" }}>
            <Ring pct={(val / max) * 100} size={60} sw={5} color={col} label={String(val)} />
            <span style={{ fontSize: 9, color: C.textMid, fontWeight: 700, letterSpacing: ".06em",
                textTransform: "uppercase", textAlign: "center" }}>{lbl}</span>
          </Card>
        ))}
      </div>

      {/* Timer */}
      <Card style={{ textAlign: "center", padding: "22px 16px" }}>
        <Label>Focus Timer — 90 min</Label>
        <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: "-.03em", color: C.text,
            lineHeight: 1, marginBottom: 10, fontFamily: "'Syne', sans-serif" }}>
          {fmt(timer.secs)}
        </div>
        <div style={{ height: 4, background: C.pale, borderRadius: 2, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ height: "100%", background: C.primary, borderRadius: 2,
              width: `${((90 * 60 - timer.secs) / (90 * 60)) * 100}%`, transition: "width .8s" }} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {!timer.running
            ? <Btn onClick={timer.start}>▶ Start Focus</Btn>
            : <Btn v="ghost" onClick={timer.pause}>⏸ Pause</Btn>}
          <Btn v={logged ? "success" : "soft"} onClick={handleLog} disabled={elapsed < 1}>
            {logged ? "✓ Logged!" : "✓ Log Session"}
          </Btn>
          <Btn v="ghost" onClick={() => timer.reset()}>↺</Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── Tasks View ───────────────────────────────────────────────────────────────
function TasksView({ state, dispatch }) {
  const [input, setInput] = useState("");
  const tasks = state.tasks[DAY] || [];
  const done = tasks.filter((t) => t.done).length;
  const canAdd = tasks.length < 5;

  const add = () => {
    if (!input.trim() || !canAdd) return;
    dispatch({ type: "ADD_TASK", text: input.trim() });
    setInput("");
  };

  return (
    <div style={{ padding: "0 20px 100px" }}>
      <div style={{ paddingTop: 52, paddingBottom: 18 }}>
        <p style={{ fontSize: 11, color: C.textMid, letterSpacing: ".08em", textTransform: "uppercase",
            marginBottom: 4 }}>Daily 5</p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: "-.03em",
            fontFamily: "'Syne', sans-serif" }}>Today's Tasks</h1>
        <p style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>Max 5 tasks. Focus on what matters.</p>
      </div>

      {/* Status bar */}
      <Card style={{ marginBottom: 14, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 5 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", transition: "background .3s",
                  background: i < tasks.length ? (i < done ? C.success : C.primary) : C.border }} />
            ))}
          </div>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.textMid }}>
            {done}/{tasks.length} complete
          </span>
          {tasks.length >= 5 && done < tasks.length && (
            <span style={{ fontSize: 10, color: C.warn, fontWeight: 600 }}>Limit reached</span>
          )}
          {tasks.length > 0 && done === tasks.length && (
            <span style={{ fontSize: 11, color: C.success, fontWeight: 700 }}>🎉 All done!</span>
          )}
        </div>
      </Card>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={canAdd ? `Task ${tasks.length + 1} of 5…` : "Daily limit reached"}
          disabled={!canAdd}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: `1.5px solid ${C.border}`,
            fontSize: 13, fontFamily: "inherit", color: C.text, outline: "none",
            background: canAdd ? "#fff" : C.alt, opacity: canAdd ? 1 : 0.6 }} />
        <Btn onClick={add} disabled={!canAdd || !input.trim()}>Add</Btn>
      </div>

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: C.textLight }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
            <p style={{ fontSize: 13 }}>No tasks yet. Add up to 5 for today.</p>
          </div>
        )}
        {tasks.map((task, i) => (
          <Card key={task.id} style={{ display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", opacity: task.done ? 0.65 : 1, transition: "opacity .2s" }}>
            <button onClick={() => dispatch({ type: "TOGGLE_TASK", id: task.id })}
              style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${task.done ? C.success : C.border}`,
                background: task.done ? C.success : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#fff", fontSize: 11, padding: 0 }}>
              {task.done ? "✓" : ""}
            </button>
            <span style={{ fontSize: 11, color: C.textLight, fontWeight: 700, width: 14, flexShrink: 0 }}>
              #{i + 1}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: task.done ? C.textMid : C.text,
                textDecoration: task.done ? "line-through" : "none", lineHeight: 1.4 }}>
              {task.text}
            </span>
            <button onClick={() => dispatch({ type: "DELETE_TASK", id: task.id })}
              style={{ fontSize: 17, color: C.textLight, background: "none", border: "none",
                cursor: "pointer", padding: 4, lineHeight: 1, flexShrink: 0 }}>×</button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Settings View ────────────────────────────────────────────────────────────
function SettingsView({ state, dispatch }) {
  const [name, setName] = useState(state.profile.name);
  const [newHabit, setNewHabit] = useState("");

  const exportCSV = () => {
    const rows = [["Date", "Category", "Item", "Status"]];
    Object.entries(state.tasks).forEach(([date, ts]) =>
      ts.forEach((t) => rows.push([date, "task", t.text, t.done ? "done" : "pending"]))
    );
    Object.entries(state.routine.history).forEach(([date, r]) =>
      ["move", "reflect", "grow"].forEach((k) => r[k] && rows.push([date, "routine", k, "done"]))
    );
    Object.entries(state.focus.sessions).forEach(([date, m]) =>
      rows.push([date, "focus", state.focus.goal || "", `${m}min`])
    );
    state.habits.forEach((h) =>
      Object.keys(h.history).forEach((date) => rows.push([date, "habit", h.name, "done"]))
    );
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
      download: `kawa-export-${DAY}.csv`,
    });
    a.click();
  };

  const addHabit = () => {
    if (newHabit.trim()) {
      dispatch({ type: "ADD_HABIT", name: newHabit.trim() });
      setNewHabit("");
    }
  };

  return (
    <div style={{ padding: "0 20px 100px" }}>
      <div style={{ paddingTop: 52, paddingBottom: 18 }}>
        <p style={{ fontSize: 11, color: C.textMid, letterSpacing: ".08em", textTransform: "uppercase",
            marginBottom: 4 }}>Config</p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: "-.03em",
            fontFamily: "'Syne', sans-serif" }}>Settings</h1>
      </div>

      <Label>Profile</Label>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && dispatch({ type: "SET_NAME", name })}
            placeholder="Your name"
            style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`,
              fontSize: 13, fontFamily: "inherit", color: C.text, outline: "none", background: C.bg }} />
          <Btn sm onClick={() => dispatch({ type: "SET_NAME", name })}>Save</Btn>
        </div>
      </Card>

      <Label>Manage Habits</Label>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={newHabit} onChange={(e) => setNewHabit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addHabit()}
            placeholder="New habit…"
            style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`,
              fontSize: 13, fontFamily: "inherit", color: C.text, outline: "none", background: C.bg }} />
          <Btn sm onClick={addHabit}>Add</Btn>
        </div>
        {state.habits.length === 0 && (
          <p style={{ fontSize: 12, color: C.textLight, textAlign: "center", padding: "8px 0" }}>
            No habits yet
          </p>
        )}
        {state.habits.map((h, idx) => (
          <div key={h.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 0", borderBottom: idx < state.habits.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary }} />
              <span style={{ fontSize: 13, color: C.text }}>{h.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: C.textLight }}>🔥 {h.streak}</span>
              <button onClick={() => dispatch({ type: "DELETE_HABIT", id: h.id })}
                style={{ color: C.textLight, background: "none", border: "none", cursor: "pointer",
                  fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
            </div>
          </div>
        ))}
      </Card>

      <Label>Data</Label>
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 3 }}>Export as CSV</p>
        <p style={{ fontSize: 11, color: C.textMid, marginBottom: 12 }}>
          Download all tasks, habits, routine, and focus data.
        </p>
        <Btn v="soft" onClick={exportCSV}>↓ Export CSV</Btn>
      </Card>

      <Label>About</Label>
      <Card style={{ marginBottom: 20, padding: "20px 16px" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 44, height: 44, background: C.primary, borderRadius: 13, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 22, opacity: 0.9 }}>🌿</span>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: C.primary, fontFamily: "'Syne', sans-serif",
                marginBottom: 3 }}>Kawa — Discipline Tracker</p>
            <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
              Inspired by The 5 AM Club · Robin Sharma
            </p>
            <p style={{ fontSize: 11, color: C.textLight, marginTop: 4 }}>
              v1.0 · Offline-first · SQLite-ready
            </p>
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
      return {
        ...state,
        habits: state.habits.map((h) => {
          if (h.id !== action.id) return h;
          const done = !!h.history[DAY];
          return {
            ...h,
            streak: done ? Math.max(0, h.streak - 1) : h.streak + 1,
            history: done
              ? Object.fromEntries(Object.entries(h.history).filter(([k]) => k !== DAY))
              : { ...h.history, [DAY]: true },
          };
        }),
      };
    }
    case "MARK_ROUTINE": {
      const existing = state.routine.history[DAY] || {};
      const todayR = { ...existing, [action.key]: true };
      const allDone = todayR.move && todayR.reflect && todayR.grow;
      const wasAllDone = existing.move && existing.reflect && existing.grow;
      return {
        ...state,
        routine: {
          ...state.routine,
          history: { ...state.routine.history, [DAY]: todayR },
          streak: allDone && !wasAllDone ? state.routine.streak + 1 : state.routine.streak,
        },
      };
    }
    case "SET_GOAL":
      return {
        ...state,
        focus: { ...state.focus, goal: action.goal, startDate: state.focus.startDate || DAY },
      };
    case "LOG_FOCUS": {
      const prev = state.focus.sessions[DAY] || 0;
      const next = prev + action.mins;
      return {
        ...state,
        focus: {
          ...state.focus,
          sessions: { ...state.focus.sessions, [DAY]: next },
          streak: prev < 90 && next >= 90 ? state.focus.streak + 1 : state.focus.streak,
        },
      };
    }
    case "ADD_TASK": {
      const ts = state.tasks[DAY] || [];
      if (ts.length >= 5) return state;
      return { ...state, tasks: { ...state.tasks, [DAY]: [...ts, { id: uid(), text: action.text, done: false }] } };
    }
    case "TOGGLE_TASK":
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [DAY]: (state.tasks[DAY] || []).map((t) => t.id === action.id ? { ...t, done: !t.done } : t),
        },
      };
    case "DELETE_TASK":
      return { ...state, tasks: { ...state.tasks, [DAY]: (state.tasks[DAY] || []).filter((t) => t.id !== action.id) } };
    case "SET_NAME":
      return { ...state, profile: { ...state.profile, name: action.name } };
    case "ADD_HABIT":
      return { ...state, habits: [...state.habits, { id: uid(), name: action.name, streak: 0, history: {} }] };
    case "DELETE_HABIT":
      return { ...state, habits: state.habits.filter((h) => h.id !== action.id) };
    default:
      return state;
  }
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "home",     label: "Home",   icon: "⌂" },
  { id: "routine",  label: "Ritual", icon: "◎" },
  { id: "focus",    label: "Focus",  icon: "◉" },
  { id: "tasks",    label: "Tasks",  icon: "✓" },
  { id: "settings", label: "More",   icon: "⚙" },
];

// ─── Initial State ────────────────────────────────────────────────────────────
const INIT = {
  profile: { name: "Practitioner" },
  routine: { history: {}, streak: 0 },
  focus: { goal: "", startDate: null, sessions: {}, streak: 0 },
  tasks: {},
  habits: [
    { id: "h1", name: "Morning meditation", streak: 3, history: {} },
    { id: "h2", name: "Cold shower", streak: 7, history: {} },
    { id: "h3", name: "Evening journal", streak: 1, history: {} },
  ],
};

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function KawaApp() {
  const [state, dispatch] = useReducer(reducer, INIT, () => {
    try {
      const saved = localStorage.getItem("kawa-state");
      return saved ? JSON.parse(saved) : INIT;
    } catch {
      return INIT;
    }
  });

  useEffect(() => {
    localStorage.setItem("kawa-state", JSON.stringify(state));
  }, [state]);

  useEffect(() => {
  requestPermission();
}, []);

  const [tab, setTab] = useState("home");

  // ── Move all timers here so they survive tab changes ──
  const t1 = useTimer(20 * 60, "Move 🏃");
const t2 = useTimer(20 * 60, "Reflect 🧘");
const t3 = useTimer(20 * 60, "Grow 📚");
const focusTimer = useTimer(90 * 60, "Deep Focus 🎯");

  const VIEWS = {
    home: <HomeView state={state} dispatch={dispatch} />,
    routine: <RoutineView state={state} dispatch={dispatch} t1={t1} t2={t2} t3={t3} />,
    focus: <FocusView state={state} dispatch={dispatch} timer={focusTimer} />,
    tasks: <TasksView state={state} dispatch={dispatch} />,
    settings: <SettingsView state={state} dispatch={dispatch} />,
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        input, button, textarea, select { font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>

      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh",
          background: C.bg, fontFamily: "'DM Sans', sans-serif",
          position: "relative", isolation: "isolate" }}>

        {/* Bamboo watermark */}
        {[{ right: 22, h: "100vh", opacity: 0.038 }, { right: 46, h: "100vh", opacity: 0.022 }].map((b, bi) => (
          <div key={bi} aria-hidden style={{ position: "fixed", top: 0, right: b.right,
              height: b.h, pointerEvents: "none", zIndex: 0, opacity: b.opacity }}>
            <svg width="14" height="100%" viewBox="0 0 14 900" preserveAspectRatio="none">
              <rect x="6" y="0" width="2" height="900" fill={C.primary} />
              {[90, 190, 290, 390, 490, 590, 690, 790].map((y) => (
                <rect key={y} x="1" y={y} width="12" height="3.5" rx="1.75" fill={C.primary} />
              ))}
            </svg>
          </div>
        ))}

        {/* Content scroll area */}
        <div style={{ position: "relative", zIndex: 1, overflowY: "auto",
            height: "100vh", scrollbarWidth: "none" }}>
          {VIEWS[tab]}
        </div>

        {/* Bottom navigation */}
        <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
            width: "100%", maxWidth: 430, background: "rgba(248,251,248,.94)",
            backdropFilter: "blur(18px)", borderTop: `1px solid ${C.border}`,
            display: "flex", zIndex: 20 }}>
          {TABS.map(({ id, label, icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 3, padding: "9px 4px 11px", background: "none", border: "none",
                  cursor: "pointer", color: active ? C.primary : C.textLight,
                  transition: "color .18s", position: "relative" }}>
                {active && (
                  <span style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                      width: 22, height: 2, background: C.primary, borderRadius: "0 0 2px 2px" }} />
                )}
                <span style={{ fontSize: 17, lineHeight: 1 }}>{icon}</span>
                <span style={{ fontSize: 8, fontWeight: active ? 700 : 500,
                    letterSpacing: ".07em", textTransform: "uppercase", fontFamily: "inherit" }}>
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
