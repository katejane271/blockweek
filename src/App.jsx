import React, { useState, useRef, useCallback, useEffect } from "react";
import { Plus, X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

// ---------- constants ----------
const DAY_START = 6; // 6am
const DAY_END = 23; // 11pm
const HOUR_HEIGHT = 64; // px per hour
const SNAP_MIN = 15; // snap granularity in minutes
const PX_PER_MIN = HOUR_HEIGHT / 60;

const COLORS = [
  { name: "ink", bg: "#2B3A4A", text: "#F4F2EC" },
  { name: "rust", bg: "#B5573A", text: "#F4F2EC" },
  { name: "moss", bg: "#5C6B4F", text: "#F4F2EC" },
  { name: "ochre", bg: "#C08A2E", text: "#2B241A" },
  { name: "slate", bg: "#5E6B73", text: "#F4F2EC" },
  { name: "plum", bg: "#6B4C6B", text: "#F4F2EC" },
];

function pad(n) {
  return n.toString().padStart(2, "0");
}

function fmtTime(totalMin) {
  let h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let idCounter = 1;
function newId() {
  return `blk_${Date.now()}_${idCounter++}`;
}

// ---------- storage ----------
const STORAGE_KEY = "blockweek-blocks-v1";

function persistLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return null;
}

function persistSave(blocks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
  } catch (e) {
    // ignore
  }
}

function sampleBlocks(weekStart) {
  const mon = addDays(weekStart, 1);
  const tue = addDays(weekStart, 2);
  return [
    {
      id: newId(),
      date: isoDate(mon),
      title: "Deep work: proposal",
      startMin: 9 * 60,
      durMin: 90,
      color: "ink",
      notes: "Finish section 2, send draft to Sam for review before EOD.",
    },
    {
      id: newId(),
      date: isoDate(mon),
      title: "Team sync",
      startMin: 11 * 60,
      durMin: 30,
      color: "rust",
      notes: "",
    },
    {
      id: newId(),
      date: isoDate(tue),
      title: "Gym",
      startMin: 7 * 60,
      durMin: 60,
      color: "moss",
      notes: "Leg day",
    },
  ];
}

// ---------- main component ----------
export default function App() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [blocks, setBlocks] = useState(() => {
    const stored = persistLoad();
    return stored && stored.length ? stored : sampleBlocks(startOfWeek(new Date()));
  });
  const [editing, setEditing] = useState(null); // block being edited, or "new"
  const [draft, setDraft] = useState(null);
  const gridRef = useRef(null);
  const dragState = useRef(null);
  const [dragPreview, setDragPreview] = useState(null); // {id, date, startMin}
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    persistSave(blocks);
  }, [blocks]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from(
    { length: DAY_END - DAY_START + 1 },
    (_, i) => DAY_START + i
  );

  const goToday = () => setWeekStart(startOfWeek(new Date()));
  const goPrevWeek = () => setWeekStart((w) => addDays(w, -7));
  const goNextWeek = () => setWeekStart((w) => addDays(w, 7));

  const snapMin = (min) => Math.round(min / SNAP_MIN) * SNAP_MIN;

  // ---- drag handling ----
  const onBlockPointerDown = useCallback(
    (e, block) => {
      e.preventDefault();
      e.stopPropagation();
      const grid = gridRef.current;
      if (!grid) return;
      const gridRect = grid.getBoundingClientRect();
      const pointerId = e.pointerId;
      e.currentTarget.setPointerCapture?.(pointerId);

      dragState.current = {
        id: block.id,
        origDate: block.date,
        origStartMin: block.startMin,
        durMin: block.durMin,
        startClientY: e.clientY,
        startClientX: e.clientX,
        gridRect,
        moved: false,
      };
      setDragPreview({ id: block.id, date: block.date, startMin: block.startMin });

      const onMove = (ev) => {
        const ds = dragState.current;
        if (!ds) return;
        const dy = ev.clientY - ds.startClientY;
        const dx = ev.clientX - ds.startClientX;
        if (Math.abs(dy) > 3 || Math.abs(dx) > 3) ds.moved = true;

        const deltaMin = snapMin(dy / PX_PER_MIN);
        let newStart = ds.origStartMin + deltaMin;
        // clamp within day bounds
        const dayStartMin = DAY_START * 60;
        const dayEndMin = DAY_END * 60 + 60;
        newStart = Math.max(dayStartMin, Math.min(newStart, dayEndMin - ds.durMin));

        // figure out day column shift
        const colWidth = ds.gridRect.width / 7;
        const dayShift = Math.round(dx / colWidth);
        const origIdx = days.findIndex((d) => isoDate(d) === ds.origDate);
        let newIdx = origIdx + dayShift;
        newIdx = Math.max(0, Math.min(6, newIdx));
        const newDate = isoDate(days[newIdx]);

        setDragPreview({ id: ds.id, date: newDate, startMin: newStart });
      };

      const onUp = () => {
        const ds = dragState.current;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (ds && ds.moved) {
          setDragPreview((preview) => {
            if (preview) {
              setBlocks((prev) =>
                prev.map((b) =>
                  b.id === ds.id
                    ? { ...b, date: preview.date, startMin: preview.startMin }
                    : b
                )
              );
            }
            return null;
          });
        } else {
          setDragPreview(null);
          if (ds) {
            const b = blocks.find((bb) => bb.id === ds.id);
            if (b) openEdit(b);
          }
        }
        dragState.current = null;
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [days, blocks]
  );

  // ---- resize handling (drag bottom edge to change duration) ----
  const onResizePointerDown = useCallback((e, block) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const origDur = block.durMin;

    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      const deltaMin = snapMin(dy / PX_PER_MIN);
      let newDur = Math.max(15, origDur + deltaMin);
      setBlocks((prev) =>
        prev.map((b) => (b.id === block.id ? { ...b, durMin: newDur } : b))
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // ---- create new block by clicking empty grid cell ----
  const onCellClick = (date, hour) => {
    const b = {
      id: newId(),
      date: isoDate(date),
      title: "",
      startMin: hour * 60,
      durMin: 60,
      color: COLORS[Math.floor(Math.random() * COLORS.length)].name,
      notes: "",
    };
    setDraft(b);
    setEditing("new");
  };

  const openEdit = (block) => {
    setDraft({ ...block });
    setEditing(block.id);
  };

  const saveDraft = () => {
    if (!draft.title.trim()) draft.title = "Untitled block";
    setBlocks((prev) => {
      const exists = prev.some((b) => b.id === draft.id);
      if (exists) return prev.map((b) => (b.id === draft.id ? draft : b));
      return [...prev, draft];
    });
    setEditing(null);
    setDraft(null);
  };

  const deleteDraft = () => {
    setBlocks((prev) => prev.filter((b) => b.id !== draft.id));
    setEditing(null);
    setDraft(null);
  };

  const today = new Date();
  const todayIso = isoDate(today);

  return (
    <div className="app-root">
      <style>{CSS}</style>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◱</span>
          <span className="brand-name">Blockweek</span>
        </div>
        <div className="week-nav">
          <button className="nav-btn" onClick={goPrevWeek} aria-label="Previous week">
            <ChevronLeft size={18} />
          </button>
          <button className="today-btn" onClick={goToday}>
            Today
          </button>
          <button className="nav-btn" onClick={goNextWeek} aria-label="Next week">
            <ChevronRight size={18} />
          </button>
          <span className="week-range">
            {days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {" – "}
            {days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </div>
      </header>

      <div className="grid-scroll">
        <div className="grid-wrap" ref={gridRef}>
          {/* day headers */}
          <div className="day-headers">
            <div className="gutter-spacer" />
            {days.map((d) => {
              const iso = isoDate(d);
              const isToday = iso === todayIso;
              return (
                <div
                  key={iso}
                  className={"day-header" + (isToday ? " is-today" : "")}
                >
                  <span className="dh-weekday">{WEEKDAY_LABELS[d.getDay()]}</span>
                  <span className="dh-num">{d.getDate()}</span>
                </div>
              );
            })}
          </div>

          <div className="grid-body">
            {/* time gutter */}
            <div className="time-gutter">
              {hours.map((h) => (
                <div key={h} className="time-label" style={{ height: HOUR_HEIGHT }}>
                  {fmtTime(h * 60)}
                </div>
              ))}
            </div>

            {/* day columns */}
            {days.map((d, colIdx) => {
              const iso = isoDate(d);
              const isToday = iso === todayIso;
              const dayBlocks = blocks.filter((b) => {
                if (dragPreview && dragPreview.id === b.id) {
                  return dragPreview.date === iso;
                }
                return b.date === iso;
              });

              return (
                <div key={iso} className={"day-col" + (isToday ? " is-today" : "")}>
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="hour-cell"
                      style={{ height: HOUR_HEIGHT }}
                      onClick={() => onCellClick(d, h)}
                    />
                  ))}

                  {isToday && (
                    <div
                      className="now-line"
                      style={{
                        top:
                          ((today.getHours() * 60 + today.getMinutes() - DAY_START * 60) *
                            PX_PER_MIN),
                      }}
                    />
                  )}

                  {dayBlocks.map((b) => {
                    const usingPreview = dragPreview && dragPreview.id === b.id;
                    const startMin = usingPreview ? dragPreview.startMin : b.startMin;
                    const top = (startMin - DAY_START * 60) * PX_PER_MIN;
                    const height = Math.max(20, b.durMin * PX_PER_MIN);
                    const color = COLORS.find((c) => c.name === b.color) || COLORS[0];
                    return (
                      <div
                        key={b.id}
                        className={"block" + (usingPreview ? " is-dragging" : "")}
                        style={{
                          top,
                          height,
                          background: color.bg,
                          color: color.text,
                        }}
                        onPointerDown={(e) => onBlockPointerDown(e, b)}
                      >
                        <div className="block-title-row">
                          <div className="block-title">{b.title}</div>
                          {b.notes && b.notes.trim() && (
                            <span className="note-dot" title="Has notes" />
                          )}
                        </div>
                        {height > 34 && (
                          <div className="block-time">
                            {fmtTime(b.startMin)} – {fmtTime(b.startMin + b.durMin)}
                          </div>
                        )}
                        {height > 52 && b.notes && b.notes.trim() && (
                          <div className="block-notes-preview">{b.notes}</div>
                        )}
                        <div
                          className="resize-handle"
                          onPointerDown={(e) => onResizePointerDown(e, b)}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        className="fab"
        onClick={() => onCellClick(days[Math.min(today.getDay(), 6)], 9)}
        aria-label="Add block"
      >
        <Plus size={22} />
      </button>

      {editing && draft && (
        <div className="modal-overlay" onClick={() => { setEditing(null); setDraft(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>{editing === "new" ? "New block" : "Edit block"}</span>
              <button
                className="icon-btn"
                onClick={() => { setEditing(null); setDraft(null); }}
              >
                <X size={18} />
              </button>
            </div>

            <label className="field-label">Title</label>
            <input
              className="text-input"
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="What are you doing?"
            />

            <div className="field-row">
              <div className="field-col">
                <label className="field-label">Date</label>
                <input
                  className="text-input"
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </div>
              <div className="field-col">
                <label className="field-label">Start</label>
                <input
                  className="text-input"
                  type="time"
                  value={`${pad(Math.floor(draft.startMin / 60))}:${pad(draft.startMin % 60)}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    setDraft({ ...draft, startMin: h * 60 + m });
                  }}
                />
              </div>
              <div className="field-col">
                <label className="field-label">Duration (min)</label>
                <input
                  className="text-input"
                  type="number"
                  min={15}
                  step={15}
                  value={draft.durMin}
                  onChange={(e) =>
                    setDraft({ ...draft, durMin: Math.max(15, Number(e.target.value)) })
                  }
                />
              </div>
            </div>

            <label className="field-label">Notes</label>
            <textarea
              className="text-input notes-input"
              value={draft.notes || ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="What do you need to do here? Any details worth remembering…"
              rows={4}
            />

            <label className="field-label">Color</label>
            <div className="color-row">
              {COLORS.map((c) => (
                <button
                  key={c.name}
                  className={"color-swatch" + (draft.color === c.name ? " is-selected" : "")}
                  style={{ background: c.bg }}
                  onClick={() => setDraft({ ...draft, color: c.name })}
                  aria-label={c.name}
                />
              ))}
            </div>

            <div className="modal-actions">
              {editing !== "new" && (
                <button className="danger-btn" onClick={deleteDraft}>
                  <Trash2 size={16} />
                  Delete
                </button>
              )}
              <div className="spacer" />
              <button
                className="ghost-btn"
                onClick={() => { setEditing(null); setDraft(null); }}
              >
                Cancel
              </button>
              <button className="primary-btn" onClick={saveDraft}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
  * { box-sizing: border-box; }
  .app-root {
    --paper: #F1EFE7;
    --paper-line: #D9D5C7;
    --ink: #2B3A4A;
    --ink-soft: #6B7280;
    --accent: #B5573A;
    --today-tint: #FBF3E3;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--paper);
    color: var(--ink);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    -webkit-tap-highlight-color: transparent;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--paper-line);
    background: var(--paper);
    z-index: 20;
    flex-wrap: wrap;
    gap: 10px;
  }
  .brand { display: flex; align-items: center; gap: 8px; }
  .brand-mark { font-size: 20px; color: var(--accent); }
  .brand-name {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.02em;
  }

  .week-nav { display: flex; align-items: center; gap: 6px; }
  .nav-btn, .today-btn, .icon-btn {
    background: transparent;
    border: 1px solid var(--paper-line);
    border-radius: 8px;
    color: var(--ink);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease;
  }
  .nav-btn { width: 30px; height: 30px; }
  .today-btn { padding: 0 12px; height: 30px; font-size: 13px; font-weight: 500; }
  .nav-btn:hover, .today-btn:hover { background: #E8E4D6; }
  .week-range {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 12px;
    color: var(--ink-soft);
    margin-left: 4px;
  }

  .grid-scroll {
    flex: 1;
    overflow: auto;
    position: relative;
  }
  .grid-wrap { min-width: 720px; }

  .day-headers {
    display: grid;
    grid-template-columns: 56px repeat(7, 1fr);
    position: sticky;
    top: 0;
    background: var(--paper);
    z-index: 10;
    border-bottom: 1px solid var(--paper-line);
  }
  .gutter-spacer { border-right: 1px solid var(--paper-line); }
  .day-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 0;
    border-right: 1px solid var(--paper-line);
  }
  .day-header.is-today { background: var(--today-tint); }
  .dh-weekday {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-soft);
  }
  .dh-num {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 16px;
    font-weight: 600;
    margin-top: 2px;
  }
  .day-header.is-today .dh-num { color: var(--accent); }

  .grid-body {
    display: grid;
    grid-template-columns: 56px repeat(7, 1fr);
    position: relative;
  }
  .time-gutter { border-right: 1px solid var(--paper-line); }
  .time-label {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 10px;
    color: var(--ink-soft);
    text-align: right;
    padding-right: 8px;
    transform: translateY(-6px);
  }

  .day-col {
    position: relative;
    border-right: 1px solid var(--paper-line);
  }
  .day-col.is-today { background: var(--today-tint); }
  .hour-cell {
    border-bottom: 1px solid var(--paper-line);
    cursor: cell;
  }
  .hour-cell:hover { background: rgba(181, 87, 58, 0.06); }

  .now-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
    z-index: 5;
    pointer-events: none;
  }
  .now-line::before {
    content: '';
    position: absolute;
    left: -3px;
    top: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }

  .block {
    position: absolute;
    left: 3px;
    right: 3px;
    border-radius: 8px;
    padding: 5px 8px;
    font-size: 12px;
    cursor: grab;
    box-shadow: 0 1px 2px rgba(43, 58, 74, 0.25);
    overflow: hidden;
    user-select: none;
    touch-action: none;
    transition: box-shadow 0.15s ease, transform 0.15s ease;
    z-index: 3;
  }
  .block:active { cursor: grabbing; }
  .block.is-dragging {
    box-shadow: 0 10px 20px rgba(43, 58, 74, 0.35), 0 2px 6px rgba(43,58,74,0.25);
    transform: scale(1.02);
    z-index: 15;
    opacity: 0.95;
  }
  .block-title-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .block-title {
    font-weight: 600;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .note-dot {
    flex-shrink: 0;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.75;
  }
  .block-time {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 10px;
    opacity: 0.85;
    margin-top: 2px;
  }
  .block-notes-preview {
    font-size: 10.5px;
    line-height: 1.3;
    opacity: 0.8;
    margin-top: 3px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .resize-handle {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
    touch-action: none;
  }

  .fab {
    position: fixed;
    bottom: 22px;
    right: 22px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--paper);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 6px 16px rgba(43,58,74,0.35);
    z-index: 30;
  }
  .fab:hover { background: var(--accent); }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(43, 58, 74, 0.35);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 100;
  }
  @media (min-width: 560px) {
    .modal-overlay { align-items: center; }
  }
  .modal {
    background: var(--paper);
    width: 100%;
    max-width: 420px;
    border-radius: 16px 16px 0 0;
    padding: 20px;
    box-shadow: 0 -8px 30px rgba(0,0,0,0.2);
  }
  @media (min-width: 560px) {
    .modal { border-radius: 16px; }
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
    font-size: 15px;
    margin-bottom: 16px;
  }
  .icon-btn { width: 28px; height: 28px; }

  .field-label {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
    margin: 12px 0 6px;
  }
  .text-input {
    width: 100%;
    border: 1px solid var(--paper-line);
    border-radius: 8px;
    padding: 9px 10px;
    font-size: 14px;
    background: #FCFAF4;
    color: var(--ink);
    font-family: inherit;
  }
  .text-input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .notes-input {
    resize: vertical;
    min-height: 64px;
    line-height: 1.4;
    font-family: inherit;
  }

  .field-row { display: flex; gap: 10px; }
  .field-col { flex: 1; min-width: 0; }

  .color-row { display: flex; gap: 8px; }
  .color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
  }
  .color-swatch.is-selected { border-color: var(--ink); }

  .modal-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 20px;
  }
  .spacer { flex: 1; }
  .primary-btn, .ghost-btn, .danger-btn {
    border-radius: 8px;
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .primary-btn { background: var(--ink); color: var(--paper); }
  .primary-btn:hover { background: var(--accent); }
  .ghost-btn { background: transparent; border-color: var(--paper-line); color: var(--ink); }
  .ghost-btn:hover { background: #E8E4D6; }
  .danger-btn {
    background: transparent;
    color: #B5573A;
    display: flex;
    align-items: center;
    gap: 5px;
    border: none;
  }
  .danger-btn:hover { text-decoration: underline; }
`;
