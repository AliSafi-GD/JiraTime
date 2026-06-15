import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Square,
  Pin,
  Plus,
  ChevronRight,
  Clock,
  Trash2,
  Layers,
} from "lucide-react";

// ---- mock Jira issues (replace with real API later) ----
const INITIAL_TASKS = [
  { key: "PROJ-142", title: "اصلاح باگ لاگین کاربران", status: "در حال انجام", temp: false },
  { key: "PROJ-155", title: "رفع کرش هنگام آپلود فایل", status: "در حال انجام", temp: false },
  { key: "PROJ-138", title: "طراحی صفحه داشبورد", status: "آماده انجام", temp: false },
  { key: "PROJ-130", title: "نوشتن تست واحد سرویس پرداخت", status: "آماده انجام", temp: false },
];

function fmt(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}`;
}

const css = `
:root{
  --ink:#13161F; --surface:#1B1F2B; --raised:#252A39; --line:#323849;
  --text:#E8EAF1; --muted:#8B92A6; --soft:#5E667C;
  --blue:#5B8DEF; --amber:#FF8A3D; --grape:#C77DFF; --green:#3FB68B;
}
*{box-sizing:border-box}
.stage{position:relative;width:100%;height:560px;border-radius:14px;overflow:hidden;
  background:
   radial-gradient(120% 90% at 80% 0%, #2b3350 0%, #161b28 55%, #0e111a 100%);
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
.wallpaper-grid{position:absolute;inset:0;opacity:.06;
  background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);
  background-size:34px 34px;}
.fauxwin{position:absolute;background:rgba(20,24,34,.62);border:1px solid rgba(255,255,255,.06);
  border-radius:10px;backdrop-filter:blur(2px);padding:10px;}
.fauxbar{display:flex;gap:6px;margin-bottom:10px}
.dot{width:9px;height:9px;border-radius:50%}
.line{height:8px;border-radius:5px;background:rgba(255,255,255,.07);margin:7px 0}
.taskbar{position:absolute;left:0;right:0;bottom:0;height:34px;background:rgba(10,13,20,.78);
  border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:8px;padding:0 12px;
  backdrop-filter:blur(6px);}
.tbicon{width:18px;height:18px;border-radius:5px;background:rgba(255,255,255,.12)}

/* ---- widget ---- */
.widget{position:absolute;width:308px;background:var(--surface);
  border:1px solid var(--line);border-radius:14px;color:var(--text);direction:rtl;
  box-shadow:0 18px 50px -12px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.02);
  user-select:none;overflow:hidden;transition:box-shadow .2s;}
.widget.live{box-shadow:0 18px 60px -10px rgba(255,138,61,.35),0 0 0 1px rgba(255,138,61,.25);}
.whead{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:grab;
  background:linear-gradient(180deg,var(--raised),var(--surface));border-bottom:1px solid var(--line);}
.whead:active{cursor:grabbing}
.brand{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;letter-spacing:.2px}
.reclamp{display:flex;align-items:center;gap:6px;margin-inline-start:auto;font-size:11px;color:var(--muted)}
.recdot{width:8px;height:8px;border-radius:50%;background:var(--soft)}
.recdot.on{background:var(--amber);box-shadow:0 0 0 0 rgba(255,138,61,.6);animation:pulse 1.4s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(255,138,61,.55)}70%{box-shadow:0 0 0 7px rgba(255,138,61,0)}100%{box-shadow:0 0 0 0 rgba(255,138,61,0)}}
.iconbtn{display:grid;place-items:center;width:26px;height:26px;border-radius:7px;color:var(--muted);
  background:transparent;border:none;cursor:pointer}
.iconbtn:hover{background:rgba(255,255,255,.07);color:var(--text)}

.clock{text-align:center;padding:14px 12px 6px}
.time{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:38px;font-weight:600;
  letter-spacing:1px;line-height:1;direction:ltr}
.time.live{color:var(--amber)}
.nowtask{margin-top:7px;font-size:12px;color:var(--muted);min-height:16px}
.nowtask b{color:var(--text);font-weight:600}
.keytag{font-family:ui-monospace,monospace;direction:ltr;display:inline-block}

.bigbtn{margin:8px 12px 12px;height:44px;width:calc(100% - 24px);border:none;border-radius:10px;
  cursor:pointer;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;
  color:#0c0f16;transition:filter .15s,transform .05s}
.bigbtn:active{transform:translateY(1px)}
.bigbtn.start{background:var(--green)}
.bigbtn.start:disabled{background:var(--raised);color:var(--soft);cursor:not-allowed}
.bigbtn.stop{background:var(--amber)}
.bigbtn:hover:not(:disabled){filter:brightness(1.07)}

.section{padding:0 12px 12px}
.lab{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);
  text-transform:uppercase;letter-spacing:.5px;margin:6px 2px 8px}
.list{display:flex;flex-direction:column;gap:5px;max-height:150px;overflow:auto}
.row{display:flex;align-items:center;gap:9px;padding:8px 9px;border-radius:9px;cursor:pointer;
  background:var(--raised);border:1px solid transparent;text-align:right}
.row:hover{border-color:var(--line)}
.row.sel{border-color:var(--blue);background:rgba(91,141,239,.12)}
.row.sel.temprow{border-color:var(--grape);background:rgba(199,125,255,.12)}
.rkey{font-family:ui-monospace,monospace;font-size:11px;color:var(--blue);direction:ltr;flex:none}
.temprow .rkey{color:var(--grape)}
.rtitle{font-size:12.5px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{font-size:9.5px;padding:2px 6px;border-radius:20px;flex:none;
  background:rgba(255,255,255,.07);color:var(--muted)}
.badge.prog{background:rgba(91,141,239,.16);color:#9bbcff}
.badge.temp{background:rgba(199,125,255,.16);color:#dcb6ff}

.tempbar{display:flex;gap:6px;margin-top:2px}
.tempbar input{flex:1;background:var(--ink);border:1px solid var(--line);border-radius:8px;
  color:var(--text);padding:8px 10px;font-size:12px;font-family:inherit;outline:none;direction:rtl}
.tempbar input:focus{border-color:var(--grape)}
.tempbar input::placeholder{color:var(--soft)}
.addbtn{flex:none;width:38px;border-radius:8px;border:1px solid var(--line);background:var(--raised);
  color:var(--grape);cursor:pointer;display:grid;place-items:center}
.addbtn:hover{background:rgba(199,125,255,.12)}

.logrow{display:flex;align-items:center;gap:8px;padding:6px 2px;font-size:12px;border-bottom:1px solid var(--line)}
.logrow:last-child{border-bottom:none}
.logkey{font-family:ui-monospace,monospace;font-size:11px;direction:ltr;color:var(--muted)}
.logdur{margin-inline-start:auto;font-family:ui-monospace,monospace;direction:ltr;color:var(--text)}
.total{display:flex;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);
  font-size:12px;color:var(--muted)}
.total b{margin-inline-start:auto;font-family:ui-monospace,monospace;direction:ltr;color:var(--text);font-size:14px}
.empty{font-size:12px;color:var(--soft);text-align:center;padding:10px 0}

.scrumnote{margin-top:10px;background:rgba(199,125,255,.08);border:1px solid rgba(199,125,255,.22);
  border-radius:9px;padding:9px 10px;font-size:11.5px;color:#dcb6ff;line-height:1.6}

/* collapsed tab */
.tab{position:absolute;width:30px;padding:10px 0;border-radius:11px 0 0 11px;cursor:pointer;
  background:var(--surface);border:1px solid var(--line);border-inline-end:none;
  display:flex;flex-direction:column;align-items:center;gap:9px;color:var(--muted);
  box-shadow:-8px 10px 30px -10px rgba(0,0,0,.6)}
.tab:hover{color:var(--text)}
.tab.live{border-color:rgba(255,138,61,.4);color:var(--amber)}
.tabtime{writing-mode:vertical-rl;font-family:ui-monospace,monospace;font-size:11px;letter-spacing:1px}

.list::-webkit-scrollbar{width:7px}
.list::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
`;

export default function App() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [selected, setSelected] = useState(null); // task key
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [tick, setTick] = useState(0);
  const [logs, setLogs] = useState([]);
  const [temp, setTemp] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState({ x: 392, y: 26 });
  const drag = useRef(null);

  // live timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const elapsed = running ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const selTask = tasks.find((t) => t.key === selected);

  const start = () => {
    if (!selected) return;
    setStartedAt(Date.now());
    setRunning(true);
    setTick(0);
  };
  const stop = () => {
    const secs = Math.floor((Date.now() - startedAt) / 1000);
    setLogs((l) => [
      { id: Date.now(), key: selTask.key, title: selTask.title, temp: selTask.temp, secs },
      ...l,
    ]);
    setRunning(false);
    setStartedAt(null);
  };
  const addTemp = () => {
    const label = temp.trim();
    if (!label) return;
    const n = tasks.filter((t) => t.temp).length + 1;
    const key = `TEMP-${n}`;
    setTasks((t) => [{ key, title: label, status: "موقت", temp: true }, ...t]);
    setSelected(key);
    setTemp("");
  };

  // drag
  const onDown = (e) => {
    drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  };
  const onMove = useCallback(
    (e) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.px;
      const dy = e.clientY - drag.current.py;
      setPos({
        x: Math.max(8, Math.min(700, drag.current.x + dx)),
        y: Math.max(8, Math.min(470, drag.current.y + dy)),
      });
    },
    []
  );
  const onUp = () => (drag.current = null);
  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onMove]);

  const totalSecs = logs.reduce((a, l) => a + l.secs, 0);
  const tempLogs = logs.filter((l) => l.temp);

  return (
    <div style={{ padding: 16, background: "#0b0d14", minHeight: "100%" }}>
      <style>{css}</style>
      <div className="stage">
        <div className="wallpaper-grid" />

        {/* faux desktop windows behind the widget */}
        <div className="fauxwin" style={{ left: 26, top: 30, width: 320, height: 230 }}>
          <div className="fauxbar">
            <span className="dot" style={{ background: "#ff5f57" }} />
            <span className="dot" style={{ background: "#febc2e" }} />
            <span className="dot" style={{ background: "#28c840" }} />
          </div>
          <div className="line" style={{ width: "70%" }} />
          <div className="line" style={{ width: "90%" }} />
          <div className="line" style={{ width: "55%" }} />
          <div className="line" style={{ width: "80%" }} />
          <div className="line" style={{ width: "40%" }} />
        </div>
        <div className="fauxwin" style={{ left: 60, top: 250, width: 360, height: 230 }}>
          <div className="fauxbar">
            <span className="dot" style={{ background: "#ff5f57" }} />
            <span className="dot" style={{ background: "#febc2e" }} />
            <span className="dot" style={{ background: "#28c840" }} />
          </div>
          <div className="line" style={{ width: "85%" }} />
          <div className="line" style={{ width: "60%" }} />
          <div className="line" style={{ width: "75%" }} />
          <div className="line" style={{ width: "45%" }} />
        </div>

        {/* the floating widget — or collapsed tab */}
        {collapsed ? (
          <div
            className={"tab" + (running ? " live" : "")}
            style={{ right: 0, top: pos.y }}
            onClick={() => setCollapsed(false)}
            title="نمایش ابزار"
          >
            <ChevronRight size={16} />
            {running && <span className="tabtime">{fmt(elapsed)}</span>}
            <Clock size={15} />
          </div>
        ) : (
          <div
            className={"widget" + (running ? " live" : "")}
            style={{ left: pos.x, top: pos.y }}
          >
            <div className="whead" onPointerDown={onDown}>
              <span className="brand">
                <Layers size={15} color="var(--blue)" /> تایم‌ترکر جیرا
              </span>
              <span className="reclamp">
                <span className={"recdot" + (running ? " on" : "")} />
                {running ? "در حال ضبط" : "آماده"}
              </span>
              <button className="iconbtn" title="سنجاق روی همه پنجره‌ها">
                <Pin size={14} />
              </button>
              <button
                className="iconbtn"
                title="مخفی کردن"
                onClick={() => setCollapsed(true)}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="clock">
              <div className={"time" + (running ? " live" : "")}>
                {fmt(running ? elapsed : 0)}
              </div>
              <div className="nowtask">
                {selTask ? (
                  <>
                    <span className="keytag">{selTask.key}</span> — <b>{selTask.title}</b>
                  </>
                ) : (
                  "یک تسک انتخاب کن یا تسک موقت بساز"
                )}
              </div>
            </div>

            {running ? (
              <button className="bigbtn stop" onClick={stop}>
                <Square size={16} fill="#0c0f16" /> توقف و ثبت زمان
              </button>
            ) : (
              <button className="bigbtn start" onClick={start} disabled={!selected}>
                <Play size={16} fill={selected ? "#0c0f16" : "var(--soft)"} /> شروع تایم
              </button>
            )}

            <div className="section">
              <div className="lab">
                <Layers size={13} /> تسک‌ها
              </div>
              <div className="list">
                {tasks.map((t) => (
                  <div
                    key={t.key}
                    className={
                      "row" +
                      (t.temp ? " temprow" : "") +
                      (selected === t.key ? " sel" : "")
                    }
                    onClick={() => !running && setSelected(t.key)}
                    style={running ? { opacity: 0.6, cursor: "not-allowed" } : {}}
                  >
                    <span className="rkey">{t.key}</span>
                    <span className="rtitle">{t.title}</span>
                    <span
                      className={
                        "badge" +
                        (t.temp ? " temp" : t.status === "در حال انجام" ? " prog" : "")
                      }
                    >
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="lab" style={{ marginTop: 14 }}>
                <Plus size={13} /> کاری که توی جیرا نیست
              </div>
              <div className="tempbar">
                <input
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTemp()}
                  placeholder="مثلاً: جلسه‌ی فنی با تیم بک‌اند…"
                />
                <button className="addbtn" onClick={addTemp} title="ساخت تسک موقت">
                  <Plus size={18} />
                </button>
              </div>

              <div className="lab" style={{ marginTop: 16 }}>
                <Clock size={13} /> زمان‌های ثبت‌شده
              </div>
              {logs.length === 0 ? (
                <div className="empty">هنوز چیزی ثبت نشده</div>
              ) : (
                <>
                  {logs.map((l) => (
                    <div className="logrow" key={l.id}>
                      <span className="logkey" style={l.temp ? { color: "var(--grape)" } : {}}>
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
                    مجموع امروز <b>{fmt(totalSecs)}</b>
                  </div>
                </>
              )}

              {tempLogs.length > 0 && (
                <div className="scrumnote">
                  برای اسکرام‌مستر — این تسک‌های موقت رو بعداً توی جیرا بساز:
                  {tempLogs.map((l) => (
                    <div key={l.id} style={{ marginTop: 4 }}>
                      • {l.title} ({fmt(l.secs)})
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="taskbar">
          <span className="tbicon" style={{ background: "var(--blue)" }} />
          <span className="tbicon" />
          <span className="tbicon" />
          <span style={{ marginInlineStart: "auto", fontSize: 11, color: "#6b7486" }}>
            ۱۲:۴۸
          </span>
        </div>
      </div>
    </div>
  );
}
