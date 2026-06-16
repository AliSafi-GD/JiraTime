import { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  Pin,
  Plus,
  ChevronRight,
  ChevronLeft,
  Clock,
  Trash2,
  Layers,
  Settings as SettingsIcon,
  Loader2,
  RefreshCw,
  X,
  Search,
} from "lucide-react";
import {
  getCurrentWindow,
  currentMonitor,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { enable } from "@tauri-apps/plugin-autostart";
import { REPO_SLUG, REPO_URL } from "./config";
import Login from "./Login";
import Onboarding from "./Onboarding";
import {
  type Settings,
  type SortKey,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "./settings";
import {
  searchIssues,
  getBoards,
  getBoardSprints,
  getAgileIssues,
  getTransitions,
  applyTransition,
  addWorklog,
  type Transition,
  type Board,
  type Sprint,
} from "./jira";
import { loadState, saveState, clearState } from "./state";
import type { Task, LogEntry } from "./types";
import { makeT, isRTL, type Lang } from "./i18n";
import "./App.css";

type View = "loading" | "onboarding" | "login" | "widget";

interface StatusMenu {
  key: string;
  x: number;
  y: number;
}

// window dimensions (logical px)
const WIN_W = 340;
const WIN_H = 620;
const TAB_W = 34;
const TAB_H = 150;
const MENU_W = 150;

function fmt(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}`;
}

const asMsg = (e: unknown) => (typeof e === "string" ? e : String(e));
const isProg = (status: string) => /progress|انجام|بازبینی|review/i.test(status);

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [accumulatedSecs, setAccumulatedSecs] = useState(0);
  const [, setTick] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [temp, setTemp] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [tabDim, setTabDim] = useState(false);
  const dimTimer = useRef<number | null>(null);
  const apprSaveTimer = useRef<number | null>(null);
  const [pinned, setPinned] = useState(true);
  const [statusMenu, setStatusMenu] = useState<StatusMenu | null>(null);
  const [menuTransitions, setMenuTransitions] = useState<Transition[] | null>(null);
  const [search, setSearch] = useState("");
  // sortKey + scopeBoard + scopeSprint live in settings (persisted)

  // ---- board / sprint scope ----
  const [boards, setBoards] = useState<Board[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);

  // ---- auth / view state ----
  const [view, setView] = useState<View>("loading");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasCreds, setHasCreds] = useState(false);

  // ---- task loading state ----
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // ---- persistence ----
  const [stateLoaded, setStateLoaded] = useState(false);
  const saveTimer = useRef<number | null>(null);

  // ---- update check ----
  const [version, setVersion] = useState("");
  const checkedRef = useRef(false);
  const normV = (v: string) => v.replace(/^v/, "");
  const hasUpdate =
    !!version &&
    !!settings.lastSeenLatest &&
    normV(settings.lastSeenLatest) !== version;

  // ---- transient notice after stopping a timer ----
  const [notice, setNotice] = useState<{
    text: string;
    kind: "info" | "ok" | "err";
  } | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const showNotice = (text: string, kind: "info" | "ok" | "err") => {
    setNotice({ text, kind });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    // errors linger longer so they can be read
    noticeTimer.current = window.setTimeout(
      () => setNotice(null),
      kind === "err" ? 8000 : 4000
    );
  };

  // decide the initial screen + restore persisted state
  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);

      // restore temp tasks, logs, and any in-progress timer
      const st = await loadState();
      if (st) {
        setTasks(st.tempTasks ?? []);
        setLogs(st.logs ?? []);
        setSelected(st.selected ?? null);
        setAccumulatedSecs(st.accumulatedSecs ?? 0);
        if (st.running && st.startedAt) {
          setStartedAt(st.startedAt);
          setRunning(true);
        } else if (st.paused) {
          setPaused(true);
        }
      }
      setStateLoaded(true);

      const has = await invoke<boolean>("has_credentials");
      setHasCreds(has);
      setView(!s.onboarded ? "onboarding" : has ? "widget" : "login");
    })();
  }, []);

  // first-run: language picked → save, enable autostart by default, continue
  const finishOnboarding = async (lang: Lang) => {
    const next = { ...settings, lang, onboarded: true };
    setSettings(next);
    await saveSettings(next);
    try {
      await enable(); // autostart on by default
    } catch {
      /* ignore */
    }
    setView(hasCreds ? "widget" : "login");
  };

  // persist state (debounced) whenever the meaningful bits change
  useEffect(() => {
    if (!stateLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveState({
        tempTasks: tasks.filter((t) => t.temp),
        logs,
        selected,
        running,
        startedAt,
        accumulatedSecs,
        paused,
      });
    }, 300);
  }, [stateLoaded, tasks, logs, selected, running, startedAt, accumulatedSecs, paused]);

  const refreshIssues = async (
    s: Settings,
    board: number | null,
    sprint: number | null
  ) => {
    setLoadingTasks(true);
    setTasksError(null);
    try {
      const issues =
        board == null
          ? await searchIssues(s)
          : await getAgileIssues(s, board, sprint);
      setTasks((prev) => [
        ...prev.filter((t) => t.temp),
        ...issues.map((i) => ({
          key: i.key,
          title: i.summary,
          status: i.status,
          temp: false,
          created: i.created,
          updated: i.updated,
        })),
      ]);
    } catch (e) {
      setTasksError(asMsg(e));
    } finally {
      setLoadingTasks(false);
    }
  };

  const pickBoard = (board: number | null) => {
    updateAppearance({ scopeBoard: board, scopeSprint: null });
    setSprints([]);
    refreshIssues(settings, board, null);
    if (board != null) {
      getBoardSprints(settings, board)
        .then(setSprints)
        .catch(() => setSprints([]));
    }
  };
  const pickSprint = (sprint: number | null) => {
    updateAppearance({ scopeSprint: sprint });
    refreshIssues(settings, settings.scopeBoard, sprint);
  };

  // appearance change from the settings screen: apply live + persist (debounced)
  const updateAppearance = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (apprSaveTimer.current) clearTimeout(apprSaveTimer.current);
      apprSaveTimer.current = window.setTimeout(() => saveSettings(next), 400);
      return next;
    });
  };

  // fetch issues + load boards/sprints whenever we (re-)enter the widget while authed
  useEffect(() => {
    if (view !== "widget" || !hasCreds) return;
    refreshIssues(settings, settings.scopeBoard, settings.scopeSprint);
    if (boards.length === 0) getBoards(settings).then(setBoards).catch(() => {});
    if (settings.scopeBoard != null && sprints.length === 0) {
      getBoardSprints(settings, settings.scopeBoard)
        .then(setSprints)
        .catch(() => setSprints([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, hasCreds]);

  // auto update check — once per launch, throttled to every 6h
  useEffect(() => {
    if (view !== "widget" || !hasCreds || checkedRef.current) return;
    checkedRef.current = true;
    (async () => {
      const v = await getVersion().catch(() => "");
      setVersion(v);
      if (Date.now() - (settings.lastUpdateCheck || 0) > 6 * 3600 * 1000) {
        try {
          const info = await invoke<{ latest: string; url: string }>(
            "check_update",
            { repo: REPO_SLUG }
          );
          updateAppearance({
            lastUpdateCheck: Date.now(),
            lastSeenLatest: info.latest,
          });
        } catch {
          /* ignore */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, hasCreds]);

  // clear timers on unmount
  useEffect(() => () => {
    if (dimTimer.current) clearTimeout(dimTimer.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  // live timer — re-render every second while running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // close the status menu when clicking anywhere else
  useEffect(() => {
    if (!statusMenu) return;
    const close = () => setStatusMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [statusMenu]);

  const t = makeT(settings.lang);

  // apply text direction / language to the document + tray menu
  useEffect(() => {
    document.documentElement.dir = isRTL(settings.lang) ? "rtl" : "ltr";
    document.documentElement.lang = settings.lang;
    invoke("set_tray_language", { lang: settings.lang }).catch(() => {});
  }, [settings.lang]);

  const liveSeg =
    running && startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const elapsed = accumulatedSecs + liveSeg;
  const active = running || paused;
  const selTask = tasks.find((tk) => tk.key === selected);

  const start = () => {
    if (!selected) return;
    setAccumulatedSecs(0);
    setStartedAt(Date.now());
    setRunning(true);
    setPaused(false);
  };
  const pause = () => {
    if (!running || !startedAt) return;
    setAccumulatedSecs((a) => a + Math.floor((Date.now() - startedAt) / 1000));
    setStartedAt(null);
    setRunning(false);
    setPaused(true);
  };
  const resume = () => {
    setStartedAt(Date.now());
    setRunning(true);
    setPaused(false);
  };
  const stop = async () => {
    if (!active || !selTask) return;
    const secs =
      accumulatedSecs +
      (running && startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0);
    const task = selTask;
    setRunning(false);
    setPaused(false);
    setStartedAt(null);
    setAccumulatedSecs(0);
    setLogs((l) => [
      { id: Date.now(), key: task.key, title: task.title, temp: task.temp, secs },
      ...l,
    ]);

    // explicit feedback about what happened with the Jira worklog
    if (task.temp) {
      showNotice(t("nTempLocal"), "info");
      return;
    }
    if (secs < 60) {
      showNotice(t("nUnder60", { t: fmt(secs) }), "info");
      return;
    }
    showNotice(t("nLogging"), "info");
    try {
      await addWorklog(settings, task.key, secs);
      showNotice(t("nLogged", { t: fmt(secs) }), "ok");
    } catch (e) {
      showNotice(t("nLogFail", { e: asMsg(e) }), "err");
    }
  };
  const addTemp = () => {
    const label = temp.trim();
    if (!label) return;
    const n = tasks.filter((t) => t.temp).length + 1;
    const key = `TEMP-${n}`;
    const now = new Date().toISOString();
    setTasks((t) => [
      { key, title: label, status: "موقت", temp: true, created: now, updated: now },
      ...t,
    ]);
    setSelected(key);
    setTemp("");
  };

  const openStatusMenu = async (e: React.MouseEvent, t: Task) => {
    e.stopPropagation();
    if (t.temp) return;
    if (statusMenu?.key === t.key) {
      setStatusMenu(null);
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setStatusMenu({ key: t.key, x: r.right, y: r.bottom });
    setMenuTransitions(null); // loading
    try {
      setMenuTransitions(await getTransitions(settings, t.key));
    } catch {
      setMenuTransitions([]);
    }
  };
  const applyStatus = async (key: string, tr: Transition) => {
    setStatusMenu(null);
    try {
      await applyTransition(settings, key, tr.id);
      setTasks((ts) =>
        ts.map((t) => (t.key === key ? { ...t, status: tr.toStatus } : t))
      );
    } catch (e) {
      setTasksError(t("nStatusFail", { e: asMsg(e) }));
    }
  };

  // ---- Tauri window controls ----
  const togglePin = async () => {
    const next = !pinned;
    setPinned(next);
    await getCurrentWindow().setAlwaysOnTop(next);
  };
  const closeWindow = () => getCurrentWindow().close();

  // snap the window to the configured screen edge at width `wLogical`
  const snapDock = async (wLogical: number) => {
    const w = getCurrentWindow();
    try {
      const mon = await currentMonitor();
      if (!mon) return;
      const scale = mon.scaleFactor;
      const pos = await w.outerPosition();
      const x =
        settings.dockSide === "left"
          ? mon.position.x
          : mon.position.x + mon.size.width - Math.round(wLogical * scale);
      await w.setPosition(new PhysicalPosition(Math.max(mon.position.x, x), pos.y));
    } catch {
      /* not fatal — just leave the window where it is */
    }
  };

  // dim the collapsed tab after the configured idle delay (0 = never); wake on hover
  const scheduleDim = () => {
    if (dimTimer.current) clearTimeout(dimTimer.current);
    if (settings.dimDelaySec <= 0) return;
    dimTimer.current = window.setTimeout(
      () => setTabDim(true),
      settings.dimDelaySec * 1000
    );
  };
  const wakeTab = () => {
    if (dimTimer.current) clearTimeout(dimTimer.current);
    setTabDim(false);
  };

  const collapse = async () => {
    await getCurrentWindow().setSize(new LogicalSize(TAB_W, TAB_H));
    await snapDock(TAB_W);
    setCollapsed(true);
    setTabDim(false);
    scheduleDim();
  };
  const expand = async () => {
    wakeTab();
    await getCurrentWindow().setSize(new LogicalSize(WIN_W, WIN_H));
    await snapDock(WIN_W);
    setCollapsed(false);
  };

  // tab: short click expands, drag moves the window — but ONLY vertically,
  // keeping it pinned to the right edge of the screen.
  const onTabPointerDown = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startScreenY = e.screenY; // CSS px, captured synchronously
    const w = getCurrentWindow();

    const mon = await currentMonitor();
    const scale = mon ? mon.scaleFactor : window.devicePixelRatio || 1;
    let startWinY = 0;
    let xFixed = 0;
    let minY = 0;
    let maxY = Number.MAX_SAFE_INTEGER;
    try {
      startWinY = (await w.outerPosition()).y; // physical px
      if (mon) {
        xFixed =
          settings.dockSide === "left"
            ? mon.position.x
            : mon.position.x + mon.size.width - Math.round(TAB_W * scale);
        minY = mon.position.y;
        maxY = mon.position.y + mon.size.height - Math.round(TAB_H * scale);
      }
    } catch {
      /* ignore */
    }

    let dragging = false;
    const move = (ev: PointerEvent) => {
      const dyCss = ev.screenY - startScreenY;
      if (!dragging && Math.abs(dyCss) > 4) dragging = true;
      if (!dragging) return;
      const newY = Math.max(
        minY,
        Math.min(maxY, startWinY + Math.round(dyCss * scale))
      );
      w.setPosition(new PhysicalPosition(xFixed, newY)); // X fixed → vertical only
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!dragging) expand();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const totalSecs = logs.reduce((a, l) => a + l.secs, 0);
  const tempLogs = logs.filter((l) => l.temp);

  // ---- search + sort + (status) grouping ----
  const q = search.trim().toLowerCase();
  const filtered = tasks.filter(
    (tk) =>
      !q || tk.key.toLowerCase().includes(q) || tk.title.toLowerCase().includes(q)
  );
  const sorted = [...filtered].sort((a, b) => {
    switch (settings.sortKey) {
      case "created":
        return b.created.localeCompare(a.created);
      case "key":
        return a.key.localeCompare(b.key);
      case "name":
        return a.title.localeCompare(b.title);
      case "status":
        return a.status.localeCompare(b.status);
      default:
        return b.updated.localeCompare(a.updated);
    }
  });
  const groups: { status: string; items: Task[] }[] = [];
  if (settings.sortKey === "status") {
    for (const tk of sorted) {
      const g = groups.find((x) => x.status === tk.status);
      if (g) g.items.push(tk);
      else groups.push({ status: tk.status, items: [tk] });
    }
  }

  const renderRow = (tk: Task) => (
    <div
      key={tk.key}
      className={
        "row" + (tk.temp ? " temprow" : "") + (selected === tk.key ? " sel" : "")
      }
      onClick={() => !active && setSelected(tk.key)}
      style={active ? { opacity: 0.6, cursor: "not-allowed" } : {}}
    >
      <span className="rkey">{tk.key}</span>
      <span className="rtitle">{tk.title}</span>
      <button
        className={
          "badge" + (tk.temp ? " temp" : isProg(tk.status) ? " prog" : "")
        }
        onClick={(e) => openStatusMenu(e, tk)}
      >
        {tk.status}
      </button>
    </div>
  );

  if (view === "loading") {
    return (
      <div className="loadingview">
        <Loader2 size={22} className="spin" />
      </div>
    );
  }
  if (view === "onboarding") {
    return <Onboarding onPick={finishOnboarding} />;
  }
  if (view === "login") {
    return (
      <Login
        current={settings}
        configured={hasCreds}
        t={t}
        hasUpdate={hasUpdate}
        latestTag={settings.lastSeenLatest}
        releaseUrl={`${REPO_URL}/releases/latest`}
        onSaved={(s) => {
          setSettings(s);
          setHasCreds(true);
          setView("widget");
        }}
        onCancel={hasCreds ? () => setView("widget") : undefined}
        onLoggedOut={() => {
          setSettings(DEFAULT_SETTINGS);
          setHasCreds(false);
          setTasks([]);
          setLogs([]);
          setSelected(null);
          setRunning(false);
          setStartedAt(null);
          clearState();
          setView("login");
        }}
        onAppearanceChange={updateAppearance}
      />
    );
  }

  // ---- collapsed tab fills the tiny window ----
  if (collapsed) {
    return (
      <div
        className={
          "tab" +
          (running ? " live" : "") +
          (settings.dockSide === "left" ? " dockleft" : "")
        }
        style={{ opacity: tabDim ? settings.dimOpacity : 1 }}
        onPointerDown={onTabPointerDown}
        onPointerEnter={wakeTab}
        onPointerLeave={scheduleDim}
        title={t("tabTitle")}
      >
        {settings.dockSide === "left" ? (
          <ChevronRight size={16} />
        ) : (
          <ChevronLeft size={16} />
        )}
        {active && <span className="tabtime">{fmt(elapsed)}</span>}
        <Clock size={15} />
      </div>
    );
  }

  return (
    <div className={"widget" + (running ? " live" : "")}>
      <div className="whead" data-tauri-drag-region>
        <span className="brand">
          <Layers size={15} color="var(--blue)" /> {t("brand")}
        </span>
        <span className="reclamp">
          <span className={"recdot" + (running ? " on" : paused ? " pause" : "")} />
          {running ? t("recording") : paused ? t("pausedLabel") : t("ready")}
        </span>
        <button
          className={"iconbtn" + (pinned ? " active" : "")}
          title={t("pinTitle")}
          onClick={togglePin}
        >
          <Pin size={14} />
        </button>
        <button
          className="iconbtn"
          title={t("settingsTitle")}
          onClick={() => setView("login")}
        >
          <SettingsIcon size={15} />
          {hasUpdate && <span className="updot" />}
        </button>
        <button className="iconbtn" title={t("hideTitle")} onClick={collapse}>
          {settings.dockSide === "left" ? (
            <ChevronLeft size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
        </button>
        <button className="iconbtn closebtn" title={t("closeTitle")} onClick={closeWindow}>
          <X size={16} />
        </button>
      </div>

      <div className="clock">
        <div className={"time" + (running ? " live" : paused ? " pausedclock" : "")}>
          {fmt(active ? elapsed : 0)}
        </div>
        <div className="nowtask">
          {selTask ? (
            <>
              <span className="keytag">{selTask.key}</span> — <b>{selTask.title}</b>
            </>
          ) : (
            t("selectPrompt")
          )}
        </div>
      </div>

      {!active ? (
        <button className="bigbtn start" onClick={start} disabled={!selected}>
          <Play size={16} fill={selected ? "#0c0f16" : "var(--soft)"} /> {t("startBtn")}
        </button>
      ) : (
        <div className="btnrow">
          {running ? (
            <button className="bigbtn pause" onClick={pause}>
              <Pause size={16} fill="#0c0f16" /> {t("pauseBtn")}
            </button>
          ) : (
            <button className="bigbtn start" onClick={resume}>
              <Play size={16} fill="#0c0f16" /> {t("resumeBtn")}
            </button>
          )}
          <button className="bigbtn stop" onClick={stop}>
            <Square size={16} fill="#0c0f16" /> {t("stopBtn")}
          </button>
        </div>
      )}

      {notice && <div className={"notice " + notice.kind}>{notice.text}</div>}

      <div className="section">
        <div className="lab">
          <Layers size={13} /> {t("tasksLabel")}
          <button
            className="iconbtn"
            style={{ width: 22, height: 22, marginInlineStart: "auto" }}
            title={t("reloadTitle")}
            onClick={() =>
              refreshIssues(settings, settings.scopeBoard, settings.scopeSprint)
            }
            disabled={loadingTasks}
          >
            <RefreshCw size={13} className={loadingTasks ? "spin" : ""} />
          </button>
        </div>

        {tasksError && <div className="errbox">{tasksError}</div>}

        {boards.length > 0 && (
          <div className="tasktools">
            <select
              className="sortsel"
              style={{ flex: 1 }}
              value={settings.scopeBoard ?? "mine"}
              onChange={(e) =>
                pickBoard(e.target.value === "mine" ? null : Number(e.target.value))
              }
            >
              <option value="mine">{t("myIssues")}</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {settings.scopeBoard != null && sprints.length > 0 && (
              <select
                className="sortsel"
                style={{ flex: 1 }}
                value={settings.scopeSprint ?? "all"}
                onChange={(e) =>
                  pickSprint(e.target.value === "all" ? null : Number(e.target.value))
                }
              >
                <option value="all">{t("wholeBoard")}</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="tasktools">
          <div className="searchbox">
            <Search size={13} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
            />
          </div>
          <select
            className="sortsel"
            value={settings.sortKey}
            onChange={(e) => updateAppearance({ sortKey: e.target.value as SortKey })}
            title={t("sortBy")}
          >
            <option value="updated">{t("sortUpdated")}</option>
            <option value="created">{t("sortCreated")}</option>
            <option value="key">{t("sortKey")}</option>
            <option value="name">{t("sortName")}</option>
            <option value="status">{t("sortStatus")}</option>
          </select>
        </div>

        <div className="list">
          {loadingTasks && tasks.length === 0 ? (
            <div className="empty">{t("loadingTasks")}</div>
          ) : tasks.length === 0 && !tasksError ? (
            <div className="empty">{t("noTasks")}</div>
          ) : sorted.length === 0 ? (
            <div className="empty">{t("noMatch")}</div>
          ) : settings.sortKey === "status" ? (
            groups.map((g) => (
              <div key={g.status} className="statusgroup">
                <div className="grouphdr">
                  {g.status} · {g.items.length}
                </div>
                {g.items.map(renderRow)}
              </div>
            ))
          ) : (
            sorted.map(renderRow)
          )}
        </div>

        <div className="lab" style={{ marginTop: 14 }}>
          <Plus size={13} /> {t("notInJira")}
        </div>
        <div className="tempbar">
          <input
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTemp()}
            placeholder={t("tempPlaceholder")}
          />
          <button className="addbtn" onClick={addTemp} title={t("addTempTitle")}>
            <Plus size={18} />
          </button>
        </div>

        <div className="lab" style={{ marginTop: 16 }}>
          <Clock size={13} /> {t("loggedTimes")}
        </div>
        {logs.length === 0 ? (
          <div className="empty">{t("nothingLogged")}</div>
        ) : (
          <>
            {logs.map((l) => (
              <div className="logrow" key={l.id}>
                <span
                  className="logkey"
                  style={l.temp ? { color: "var(--grape)" } : {}}
                >
                  {l.key}
                </span>
                <span className="rtitle">{l.title}</span>
                <span className="logdur">{fmt(l.secs)}</span>
                <button
                  className="iconbtn"
                  style={{ width: 22, height: 22 }}
                  onClick={() => setLogs((x) => x.filter((i) => i.id !== l.id))}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <div className="total">
              {t("todayTotal")} <b>{fmt(totalSecs)}</b>
            </div>
          </>
        )}

        {tempLogs.length > 0 && (
          <div className="scrumnote">
            {t("scrumNote")}
            {tempLogs.map((l) => (
              <div key={l.id} style={{ marginTop: 4 }}>
                • {l.title} ({fmt(l.secs)})
              </div>
            ))}
          </div>
        )}
      </div>

      {statusMenu && (
        <div
          className="statusmenu"
          style={{
            top: statusMenu.y + 4,
            left: Math.max(8, statusMenu.x - MENU_W),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuTransitions === null ? (
            <span className="menuinfo">{t("menuLoading")}</span>
          ) : menuTransitions.length === 0 ? (
            <span className="menuinfo">{t("noTransitions")}</span>
          ) : (
            menuTransitions.map((tr) => (
              <button key={tr.id} onClick={() => applyStatus(statusMenu.key, tr)}>
                {tr.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
