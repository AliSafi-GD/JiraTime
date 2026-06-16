import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Layers,
  LogIn,
  Loader2,
  LogOut,
  ArrowRight,
  ArrowLeft,
  PanelLeft,
  PanelRight,
  ExternalLink,
} from "lucide-react";
import { REPO_URL, REPO_SLUG, APP_AUTHOR } from "./config";

interface UpdateInfo {
  latest: string;
  url: string;
}
import {
  type Settings,
  type AuthMethod,
  saveSettings,
  clearSettings,
} from "./settings";
import { type T, isRTL } from "./i18n";

interface Myself {
  displayName: string;
  name: string;
}

interface Props {
  current: Settings;
  configured: boolean;
  t: T;
  hasUpdate: boolean;
  latestTag: string;
  releaseUrl: string;
  onSaved: (s: Settings) => void;
  onCancel?: () => void;
  onLoggedOut?: () => void;
  onAppearanceChange: (patch: Partial<Settings>) => void;
}

export default function Login({
  current,
  configured,
  t,
  hasUpdate,
  latestTag,
  releaseUrl,
  onSaved,
  onCancel,
  onLoggedOut,
  onAppearanceChange,
}: Props) {
  const [baseUrl, setBaseUrl] = useState(current.baseUrl);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(current.authMethod);
  const [username, setUsername] = useState(current.username);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autostartOn, setAutostartOn] = useState(false);
  const [tab, setTab] = useState<"conn" | "appear" | "general" | "about">("conn");
  const [version, setVersion] = useState("");
  const [updateState, setUpdateState] = useState<
    { kind: "idle" | "checking" | "ok" | "err" } | { kind: "new"; v: string; url: string }
  >({ kind: "idle" });

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const checkUpdate = async () => {
    setUpdateState({ kind: "checking" });
    try {
      const info = await invoke<UpdateInfo>("check_update", { repo: REPO_SLUG });
      const latest = info.latest.replace(/^v/, "");
      if (latest && latest !== version) {
        setUpdateState({ kind: "new", v: info.latest, url: info.url });
      } else {
        setUpdateState({ kind: "ok" });
      }
    } catch {
      setUpdateState({ kind: "err" });
    }
  };

  const rtl = isRTL(current.lang);
  const Back = rtl ? ArrowRight : ArrowLeft;

  useEffect(() => {
    isEnabled()
      .then(setAutostartOn)
      .catch(() => setAutostartOn(false));
  }, []);

  const toggleAutostart = async () => {
    try {
      if (autostartOn) {
        await disable();
        setAutostartOn(false);
      } else {
        await enable();
        setAutostartOn(true);
      }
    } catch {
      /* ignore */
    }
  };

  const canSubmit =
    baseUrl.trim() !== "" &&
    secret.trim() !== "" &&
    (authMethod === "pat" || username.trim() !== "");

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    const cleanUrl = baseUrl.trim().replace(/\/+$/, "");
    try {
      const me = await invoke<Myself>("test_and_save_credentials", {
        baseUrl: cleanUrl,
        authMethod,
        username: authMethod === "basic" ? username.trim() : null,
        secret,
      });
      const next: Settings = {
        ...current,
        baseUrl: cleanUrl,
        authMethod,
        username: authMethod === "basic" ? username.trim() : "",
        displayName: me.displayName || me.name,
      };
      await saveSettings(next);
      onSaved(next);
    } catch (e) {
      setError(typeof e === "string" ? e : t("connFail"));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await invoke("clear_credentials");
      await clearSettings();
      onLoggedOut?.();
    } catch (e) {
      setError(typeof e === "string" ? e : t("logoutFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login widget" dir={rtl ? "rtl" : "ltr"}>
      <div className="whead" data-tauri-drag-region>
        <span className="brand">
          <Layers size={15} color="var(--blue)" />{" "}
          {configured ? t("settingsTitle") : t("loginTitle")}
        </span>
        {configured && onCancel && (
          <button
            className="iconbtn"
            style={{ marginInlineStart: "auto" }}
            title={t("backTitle")}
            onClick={onCancel}
          >
            <Back size={16} />
          </button>
        )}
      </div>

      <div className="tabbar">
        <button
          className={tab === "conn" ? "on" : ""}
          onClick={() => setTab("conn")}
        >
          {t("secConnection")}
        </button>
        <button
          className={tab === "appear" ? "on" : ""}
          onClick={() => setTab("appear")}
        >
          {t("secAppearance")}
        </button>
        <button
          className={tab === "general" ? "on" : ""}
          onClick={() => setTab("general")}
        >
          {t("secGeneral")}
        </button>
        <button
          className={tab === "about" ? "on" : ""}
          onClick={() => setTab("about")}
        >
          {t("secAbout")}
          {hasUpdate && <span className="updot" />}
        </button>
      </div>

      <div className="loginbody">
        {tab === "conn" && (
          <>
            <label className="fld">
              <span>{t("jiraUrl")}</span>
              <input
                dir="ltr"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://jira.example.com"
              />
            </label>

            <div className="fld">
              <span>{t("loginMethod")}</span>
              <div className="seg">
                <button
                  className={authMethod === "pat" ? "on" : ""}
                  onClick={() => setAuthMethod("pat")}
                >
                  {t("pat")}
                </button>
                <button
                  className={authMethod === "basic" ? "on" : ""}
                  onClick={() => setAuthMethod("basic")}
                >
                  {t("userpass")}
                </button>
              </div>
            </div>

            {authMethod === "basic" && (
              <label className="fld">
                <span>{t("username")}</span>
                <input
                  dir="ltr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                />
              </label>
            )}

            <label className="fld">
              <span>{authMethod === "pat" ? t("patLabel") : t("passLabel")}</span>
              <input
                dir="ltr"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={authMethod === "pat" ? "••••••••••••" : "••••••••"}
              />
            </label>

            {authMethod === "pat" && <div className="hint">{t("patHint")}</div>}

            {error && <div className="errbox">{error}</div>}

            <button
              className="bigbtn start loginbtn"
              onClick={submit}
              disabled={!canSubmit || busy}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <LogIn size={16} fill="#0c0f16" />
              )}
              {busy ? t("checking") : t("testSave")}
            </button>

            {configured && (
              <button className="linklike" onClick={logout} disabled={busy}>
                <LogOut size={13} /> {t("logout")}
              </button>
            )}
          </>
        )}

        {tab === "appear" && (
          <>
            <div className="fld">
              <span>{t("dockSide")}</span>
              <div className="seg">
                <button
                  className={current.dockSide === "left" ? "on" : ""}
                  onClick={() => onAppearanceChange({ dockSide: "left" })}
                >
                  <PanelLeft size={14} /> {t("left")}
                </button>
                <button
                  className={current.dockSide === "right" ? "on" : ""}
                  onClick={() => onAppearanceChange({ dockSide: "right" })}
                >
                  {t("right")} <PanelRight size={14} />
                </button>
              </div>
            </div>

            <div className="fld">
              <span>
                {t("dimOpacity", { p: Math.round(current.dimOpacity * 100) })}
              </span>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={Math.round(current.dimOpacity * 100)}
                onChange={(e) =>
                  onAppearanceChange({ dimOpacity: Number(e.target.value) / 100 })
                }
              />
            </div>

            <div className="fld">
              <span>
                {t("dimDelay")} —{" "}
                {current.dimDelaySec === 0
                  ? t("never")
                  : t("secondsVal", { n: current.dimDelaySec })}
              </span>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={current.dimDelaySec}
                onChange={(e) =>
                  onAppearanceChange({ dimDelaySec: Number(e.target.value) })
                }
              />
            </div>
          </>
        )}

        {tab === "general" && (
          <>
            <div className="fld">
              <span>{t("language")}</span>
              <div className="seg">
                <button
                  className={current.lang === "fa" ? "on" : ""}
                  onClick={() => onAppearanceChange({ lang: "fa" })}
                >
                  فارسی
                </button>
                <button
                  className={current.lang === "en" ? "on" : ""}
                  onClick={() => onAppearanceChange({ lang: "en" })}
                >
                  English
                </button>
              </div>
            </div>

            <label className="switchrow">
              <span>{t("startup")}</span>
              <input
                type="checkbox"
                checked={autostartOn}
                onChange={toggleAutostart}
              />
            </label>
          </>
        )}

        {tab === "about" && (
          <div className="about">
            <Layers size={30} color="var(--blue)" />
            <div className="aboutname">{t("brand")}</div>
            <div className="aboutrow">
              <span>{t("version")}</span>
              <b dir="ltr">{version || "—"}</b>
            </div>
            <button className="repobtn" onClick={() => openUrl(REPO_URL)}>
              <ExternalLink size={14} /> {t("repo")}
            </button>

            <button
              className="repobtn"
              onClick={checkUpdate}
              disabled={updateState.kind === "checking"}
            >
              {updateState.kind === "checking" ? t("checking2") : t("checkUpdate")}
            </button>
            {updateState.kind === "idle" && hasUpdate && (
              <button
                className="notice ok"
                style={{ margin: 0, border: "none", cursor: "pointer" }}
                onClick={() => openUrl(releaseUrl)}
              >
                {t("updateAvailable", { v: latestTag })}
              </button>
            )}
            {updateState.kind === "ok" && (
              <div className="notice ok" style={{ margin: 0 }}>
                {t("upToDate")}
              </div>
            )}
            {updateState.kind === "err" && (
              <div className="notice err" style={{ margin: 0 }}>
                {t("checkFailed")}
              </div>
            )}
            {updateState.kind === "new" && (
              <button
                className="notice ok"
                style={{ margin: 0, border: "none", cursor: "pointer" }}
                onClick={() => openUrl(updateState.url)}
              >
                {t("updateAvailable", { v: updateState.v })}
              </button>
            )}

            <div className="aboutfoot">
              {t("madeWith")}
              <br />© {APP_AUTHOR}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
