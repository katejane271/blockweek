import React, { useState, useRef, useCallback, useEffect } from "react";
import { Plus, X, ChevronLeft, ChevronRight, Trash2, Copy, ExternalLink, Download, Upload, RefreshCw } from "lucide-react";

// ---------- constants ----------
const DAY_START = 6; // 6am
const DAY_END = 23; // 11pm
const HOUR_HEIGHT = 64; // px per hour
const SNAP_MIN = 15; // snap granularity in minutes
const PX_PER_MIN = HOUR_HEIGHT / 60;

const PRESET_COLORS = [
  "#2B3A4A", // ink
  "#B5573A", // rust
  "#5C6B4F", // moss
  "#C08A2E", // ochre
  "#5E6B73", // slate
  "#6B4C6B", // plum
];

// Map old-style preset names (from earlier versions) to hex, for backward compatibility
const LEGACY_NAME_TO_HEX = {
  ink: "#2B3A4A",
  rust: "#B5573A",
  moss: "#5C6B4F",
  ochre: "#C08A2E",
  slate: "#5E6B73",
  plum: "#6B4C6B",
};

function resolveColor(color) {
  if (!color) return PRESET_COLORS[0];
  if (LEGACY_NAME_TO_HEX[color]) return LEGACY_NAME_TO_HEX[color];
  return color;
}

// Pick readable text color (near-black or near-white) based on background luminance
function textColorFor(hex) {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#F4F2EC";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#2B241A" : "#F4F2EC";
}

function isValidHex(hex) {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

// Pull out any URLs typed in free text (matches http(s):// links and bare www. links)
const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+\.[^\s]+)/gi;
function extractLinks(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX) || [];
  const seen = new Set();
  const links = [];
  for (let raw of matches) {
    // trim common trailing punctuation that isn't part of the URL
    const cleaned = raw.replace(/[),.;!?]+$/, "");
    const href = cleaned.startsWith("http") ? cleaned : `https://${cleaned}`;
    if (!seen.has(href)) {
      seen.add(href);
      let label = cleaned.replace(/^https?:\/\//, "").replace(/^www\./, "");
      if (label.length > 34) label = label.slice(0, 34) + "…";
      links.push({ href, label });
    }
  }
  return links;
}

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

// Compact "11AM" style label for the hour gutter (no minutes, no space, no colon)
function fmtHourCompact(hour) {
  let h12 = hour % 12;
  if (h12 === 0) h12 = 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${h12}${suffix}`;
}

function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Parse a "YYYY-MM-DD" string as a local date (avoids UTC-parsing off-by-one issues)
function parseIsoDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday ... 6 = Saturday
  const diffToMonday = (day + 6) % 7; // 0 when day is already Monday
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function stepDate(date, unit, interval) {
  if (unit === "day") return addDays(date, interval);
  if (unit === "month") return addMonths(date, interval);
  return addDays(date, interval * 7); // week (default)
}

const REPEAT_UNITS = [
  { value: "day", label: "day" },
  { value: "week", label: "week" },
];

const REPEAT_OCCURRENCE_COUNT = 20; // how many future occurrences to generate at once


const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let idCounter = 1;
function newId() {
  return `blk_${Date.now()}_${idCounter++}`;
}

// ---------- storage ----------
const STORAGE_KEY = "blockweek-blocks-v1";
const CUSTOM_COLORS_KEY = "blockweek-custom-colors-v1";

function loadCustomColors() {
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return [];
}

function saveCustomColors(colors) {
  try {
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors));
  } catch (e) {
    // ignore
  }
}

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
  const [hexText, setHexText] = useState("");
  const [customColors, setCustomColors] = useState(() => loadCustomColors());
  // Custom in-app dialog replaces window.confirm/alert, which can silently fail
  // to appear when this app is running as an "Add to Home Screen" standalone app.
  const [dialog, setDialog] = useState(null); // { message, mode: 'confirm' | 'alert', onConfirm }
  const askConfirm = (message, onConfirm) => setDialog({ message, mode: "confirm", onConfirm });
  const showAlert = (message) => setDialog({ message, mode: "alert" });
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

  // ---- backup: export / import ----
  const fileInputRef = useRef(null);

  const exportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      blocks,
      customColors,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = isoDate(new Date());
    a.href = url;
    a.download = `blockweek-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const importedBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : null;
        if (!importedBlocks) {
          showAlert("This file doesn't look like a Blockweek backup.");
          return;
        }
        askConfirm(
          `Restore ${importedBlocks.length} block${importedBlocks.length === 1 ? "" : "s"} from this backup? This will replace everything currently in your week.`,
          () => {
            setBlocks(importedBlocks);
            if (Array.isArray(parsed.customColors)) {
              setCustomColors(parsed.customColors);
              saveCustomColors(parsed.customColors);
            }
          }
        );
      } catch (err) {
        showAlert("Couldn't read that file — make sure it's a Blockweek backup JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-importing the same filename later
  };

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
      color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
      notes: "",
      repeatEnabled: false,
      repeatInterval: 1,
      repeatUnit: "week",
      seriesId: null,
    };
    setDraft(b);
    setHexText(resolveColor(b.color));
    setEditing("new");
  };

  const openEdit = (block) => {
    setDraft({ ...block });
    setHexText(resolveColor(block.color));
    setEditing(block.id);
  };

  const upsertBlock = useCallback((b) => {
    setBlocks((prev) => {
      const exists = prev.some((x) => x.id === b.id);
      if (exists) return prev.map((x) => (x.id === b.id ? b : x));
      return [...prev, b];
    });
  }, []);

  // Autosave: sync every field change straight into the blocks list as you type.
  // A brand-new block only gets created once it has a title, so accidental empty
  // taps don't litter the week with blank entries.
  useEffect(() => {
    if (!draft) return;
    const titleFilled = draft.title && draft.title.trim() !== "";
    setBlocks((prev) => {
      const exists = prev.some((b) => b.id === draft.id);
      if (exists) return prev.map((b) => (b.id === draft.id ? draft : b));
      if (titleFilled) return [...prev, draft];
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const closeModal = () => {
    if (draft) {
      const finalTitle = draft.title && draft.title.trim() ? draft.title : "Untitled block";
      upsertBlock({ ...draft, title: finalTitle });
    }
    setEditing(null);
    setDraft(null);
  };

  const deleteDraft = () => {
    setBlocks((prev) => prev.filter((b) => b.id !== draft.id));
    setEditing(null);
    setDraft(null);
  };

  const duplicateDraft = () => {
    const dayEndMin = DAY_END * 60 + 60;
    let newStart = draft.startMin + 60; // offset by an hour so it doesn't sit exactly on top
    if (newStart + draft.durMin > dayEndMin) {
      newStart = Math.max(DAY_START * 60, draft.startMin - 60);
    }
    const copy = {
      ...draft,
      id: newId(),
      startMin: newStart,
      repeatEnabled: false,
      seriesId: null,
    };
    setBlocks((prev) => [...prev, copy]);
    setEditing(null);
    setDraft(null);
  };

  // Regenerates this occurrence's future series from scratch using the given overrides
  // (e.g. a just-changed interval or unit). Removes any previously generated future
  // occurrences of this series so stale ones from an old interval don't linger, but
  // leaves past occurrences untouched.
  const regenerateSeries = (overrides = {}) => {
    if (!draft) return;
    const merged = { ...draft, ...overrides };
    const baseDraft = merged.title && merged.title.trim() ? merged : { ...merged, title: "Untitled block" };
    const interval = Math.max(1, Number(baseDraft.repeatInterval) || 1);
    const unit = baseDraft.repeatUnit || "week";
    const sid = baseDraft.seriesId || `series_${Date.now()}_${idCounter++}`;
    const baseDate = parseIsoDate(baseDraft.date);
    const futureInstances = [];
    let cursor = baseDate;
    for (let i = 1; i <= REPEAT_OCCURRENCE_COUNT; i++) {
      cursor = stepDate(cursor, unit, interval);
      futureInstances.push({
        ...baseDraft,
        id: newId(),
        date: isoDate(cursor),
        seriesId: sid,
        repeatEnabled: true,
        repeatInterval: interval,
        repeatUnit: unit,
      });
    }
    const updatedSelf = { ...baseDraft, seriesId: sid, repeatEnabled: true, repeatInterval: interval, repeatUnit: unit };
    const thisDate = baseDraft.date;
    setBlocks((prev) => {
      const kept = prev.filter((b) => {
        if (b.id === draft.id) return false; // this occurrence, re-added below as updatedSelf
        if (sid && b.seriesId === sid && b.date >= thisDate) return false; // stale future occurrences from old interval
        return true;
      });
      return [...kept, updatedSelf, ...futureInstances];
    });
    setDraft(updatedSelf);
  };

  const disableRepeat = () => {
    if (!draft) return;
    setDraft({ ...draft, repeatEnabled: false, seriesId: null });
  };

  const deleteSeries = () => {
    if (!draft || !draft.seriesId) return;
    const seriesId = draft.seriesId;
    askConfirm(
      "Delete this event and every future occurrence in its repeating series? This can't be undone.",
      () => {
        setBlocks((prev) => prev.filter((b) => b.seriesId !== seriesId));
        setEditing(null);
        setDraft(null);
      }
    );
  };

  const addCustomColor = (hex) => {
    if (!isValidHex(hex)) return;
    setCustomColors((prev) => {
      const normalized = hex.toUpperCase();
      if (
        PRESET_COLORS.some((c) => c.toUpperCase() === normalized) ||
        prev.some((c) => c.toUpperCase() === normalized)
      ) {
        return prev; // already exists, no duplicate
      }
      const next = [...prev, normalized];
      saveCustomColors(next);
      return next;
    });
  };

  const removeCustomColor = (hex) => {
    setCustomColors((prev) => {
      const next = prev.filter((c) => c !== hex);
      saveCustomColors(next);
      return next;
    });
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
        <div className="right-controls">
          <span className="week-range">
            {days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {" – "}
            {days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
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
          </div>
          <div className="backup-controls">
            <button className="nav-btn" onClick={exportBackup} aria-label="Download backup" title="Download backup">
              <Download size={16} />
            </button>
            <button className="nav-btn" onClick={triggerImport} aria-label="Restore from backup" title="Restore from backup">
              <Upload size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              style={{ display: "none" }}
            />
          </div>
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
                  {fmtHourCompact(h)}
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
                    const bgHex = resolveColor(b.color);
                    const color = { bg: bgHex, text: textColorFor(bgHex) };
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
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>{editing === "new" ? "New block" : "Edit block"}</span>
              <button
                className="icon-btn"
                onClick={closeModal}
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

            <label className="repeat-toggle">
              <input
                type="checkbox"
                checked={!!draft.repeatEnabled}
                onChange={(e) => {
                  if (e.target.checked) setDraft({ ...draft, repeatEnabled: true });
                  else disableRepeat();
                }}
              />
              <span>Repeats</span>
            </label>
            {draft.repeatEnabled && (
              <>
                <div className="repeat-interval-row">
                  <span className="repeat-interval-label">every</span>
                  <input
                    className="text-input repeat-interval-input"
                    type="number"
                    min={1}
                    step={1}
                    value={draft.repeatInterval}
                    onChange={(e) =>
                      setDraft({ ...draft, repeatInterval: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                  <select
                    className="text-input repeat-unit-select"
                    value={draft.repeatUnit}
                    onChange={(e) => setDraft({ ...draft, repeatUnit: e.target.value })}
                  >
                    {REPEAT_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                        {Number(draft.repeatInterval) === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="save-repeat-btn" onClick={() => regenerateSeries()}>
                  <RefreshCw size={14} />
                  {draft.seriesId ? "Save repeat settings" : "Create repeating series"}
                </button>
                <div className="repeat-hint">
                  {draft.seriesId
                    ? `Generates the next ${REPEAT_OCCURRENCE_COUNT} occurrences and applies this occurrence's title, time, duration, color, and notes to all of them. Tap the button above any time you change the interval, unit, or these details, to push the update through.`
                    : `Set your interval and unit, then tap the button above to generate the next ${REPEAT_OCCURRENCE_COUNT} occurrences.`}
                </div>
              </>
            )}

            <label className="field-label">Notes</label>
            <textarea
              className="text-input notes-input"
              value={draft.notes || ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="What do you need to do here? Paste a link and it'll show below as a tap-through shortcut."
              rows={4}
            />
            {extractLinks(draft.notes).length > 0 && (
              <div className="link-chip-row">
                {extractLinks(draft.notes).map((link) => (
                  <a
                    key={link.href}
                    className="link-chip"
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={12} />
                    {link.label}
                  </a>
                ))}
              </div>
            )}

            <label className="field-label">Color</label>
            <div className="color-picker-row">
              <input
                className="color-wheel"
                type="color"
                value={isValidHex(hexText) ? hexText : resolveColor(draft.color)}
                onChange={(e) => {
                  const hex = e.target.value;
                  setHexText(hex);
                  setDraft({ ...draft, color: hex });
                }}
                aria-label="Pick a custom color"
              />
              <input
                className="text-input hex-input"
                type="text"
                value={hexText}
                onChange={(e) => {
                  let val = e.target.value;
                  if (val && !val.startsWith("#")) val = "#" + val;
                  setHexText(val);
                  if (isValidHex(val)) {
                    setDraft({ ...draft, color: val });
                  }
                }}
                placeholder="#2B3A4A"
                maxLength={7}
                spellCheck={false}
              />
              <button
                className="save-color-btn"
                onClick={() => addCustomColor(isValidHex(hexText) ? hexText : resolveColor(draft.color))}
                title="Save this color to your presets"
                aria-label="Save this color to your presets"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="color-row">
              {PRESET_COLORS.map((hex) => (
                <button
                  key={hex}
                  className={"color-swatch" + (resolveColor(draft.color).toLowerCase() === hex.toLowerCase() ? " is-selected" : "")}
                  style={{ background: hex }}
                  onClick={() => { setDraft({ ...draft, color: hex }); setHexText(hex); }}
                  aria-label={hex}
                />
              ))}
              {customColors.map((hex) => (
                <div key={hex} className="color-swatch-wrap">
                  <button
                    className={"color-swatch" + (resolveColor(draft.color).toLowerCase() === hex.toLowerCase() ? " is-selected" : "")}
                    style={{ background: hex }}
                    onClick={() => { setDraft({ ...draft, color: hex }); setHexText(hex); }}
                    aria-label={hex}
                  />
                  <button
                    className="color-swatch-remove"
                    onClick={(e) => { e.stopPropagation(); removeCustomColor(hex); }}
                    aria-label={`Remove ${hex} from presets`}
                    title="Remove from presets"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
            {customColors.length === 0 && (
              <div className="color-hint">Pick a color above, then tap + to save it here as a preset.</div>
            )}

            {editing !== "new" && (
              <div className="modal-actions">
                <button className="danger-btn" onClick={deleteDraft}>
                  <Trash2 size={16} />
                  Delete
                </button>
                {draft.seriesId && (
                  <button className="danger-btn" onClick={deleteSeries}>
                    <Trash2 size={16} />
                    Delete series
                  </button>
                )}
                <button className="duplicate-btn" onClick={duplicateDraft}>
                  <Copy size={16} />
                  Duplicate
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {dialog && (
        <div className="modal-overlay" onClick={() => setDialog(null)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-message">{dialog.message}</div>
            <div className="dialog-actions">
              {dialog.mode === "confirm" && (
                <button
                  className="ghost-btn"
                  onClick={() => setDialog(null)}
                >
                  Cancel
                </button>
              )}
              <button
                className="primary-btn"
                onClick={() => {
                  if (dialog.mode === "confirm" && dialog.onConfirm) dialog.onConfirm();
                  setDialog(null);
                }}
              >
                {dialog.mode === "confirm" ? "Confirm" : "OK"}
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

  .right-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .week-nav { display: flex; align-items: center; gap: 6px; }
  .backup-controls { display: flex; align-items: center; gap: 6px; }
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
  }

  .grid-scroll {
    flex: 1;
    overflow: auto;
    position: relative;
  }
  .grid-wrap { min-width: 720px; }

  .day-headers {
    display: grid;
    grid-template-columns: 44px repeat(7, 1fr);
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
    padding: 5px 0;
    border-right: 1px solid var(--paper-line);
  }
  .day-header.is-today { background: var(--today-tint); }
  .dh-weekday {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
  }
  .dh-num {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    margin-top: 1px;
  }
  .day-header.is-today .dh-num { color: var(--accent); }

  .grid-body {
    display: grid;
    grid-template-columns: 44px repeat(7, 1fr);
    position: relative;
  }
  .time-gutter { border-right: 1px solid var(--paper-line); }
  .time-label {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 10px;
    color: var(--ink-soft);
    text-align: right;
    padding-right: 8px;
    padding-top: 3px;
    white-space: nowrap;
    overflow: hidden;
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
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.4;
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
  .dialog-box {
    background: var(--paper);
    width: calc(100% - 32px);
    max-width: 360px;
    border-radius: 14px;
    padding: 20px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.25);
  }
  .dialog-message {
    font-size: 14px;
    line-height: 1.5;
    color: var(--ink);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
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
  .link-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .link-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 999px;
    background: #E8E4D6;
    color: var(--ink);
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
    max-width: 100%;
    overflow: hidden;
  }
  .link-chip:hover { background: var(--accent); color: var(--paper); }

  .field-row { display: flex; gap: 10px; }
  .field-col { flex: 1; min-width: 0; }

  .repeat-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    cursor: pointer;
  }
  .repeat-toggle input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .repeat-hint {
    font-size: 11px;
    color: var(--ink-soft);
    line-height: 1.4;
    margin-top: 6px;
  }
  .repeat-interval-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }
  .repeat-interval-label {
    font-size: 13px;
    color: var(--ink-soft);
    flex-shrink: 0;
  }
  .repeat-interval-input {
    width: 56px;
    flex-shrink: 0;
    text-align: center;
  }
  .repeat-unit-select {
    flex: 1;
    cursor: pointer;
  }
  .save-repeat-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    margin-top: 10px;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid var(--ink);
    background: var(--ink);
    color: var(--paper);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .save-repeat-btn:hover { background: var(--accent); border-color: var(--accent); }

  .color-picker-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .color-wheel {
    -webkit-appearance: none;
    appearance: none;
    width: 40px;
    height: 40px;
    border: 1px solid var(--paper-line);
    border-radius: 8px;
    padding: 0;
    cursor: pointer;
    background: none;
    flex-shrink: 0;
  }
  .color-wheel::-webkit-color-swatch-wrapper { padding: 3px; }
  .color-wheel::-webkit-color-swatch { border: none; border-radius: 6px; }
  .hex-input {
    flex: 1;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    text-transform: uppercase;
  }
  .color-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .save-color-btn {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px dashed var(--paper-line);
    background: transparent;
    color: var(--ink-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .save-color-btn:hover { background: #E8E4D6; color: var(--ink); border-color: var(--ink-soft); }
  .color-swatch-wrap {
    position: relative;
    display: inline-flex;
  }
  .color-swatch-remove {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--paper);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .color-swatch-wrap:hover .color-swatch-remove { opacity: 1; }
  .color-hint {
    font-size: 11px;
    color: var(--ink-soft);
    margin-top: 8px;
    line-height: 1.4;
  }
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
    flex-wrap: wrap;
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
  .duplicate-btn {
    background: transparent;
    color: var(--ink-soft);
    display: flex;
    align-items: center;
    gap: 5px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 9px 4px;
    margin-left: 8px;
  }
  .duplicate-btn:hover { color: var(--ink); text-decoration: underline; }
`;
