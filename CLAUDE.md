# CLAUDE.md — Jira Floating Time Tracker (handoff brief)

> این فایل ادامه‌ی یک گفتگو در claude.ai است. هدفش این است که Claude Code با خواندن آن،
> دقیقاً از همان‌جایی که در آن گفتگو رسیدیم کار را ادامه دهد. هر تصمیمی که گرفته‌ایم
> اینجا ثبت شده است. اگر چیزی مبهم بود، از کاربر بپرس.

## 1. What we're building

A small **floating, always-on-top desktop widget for Windows** that lets the user
manage and time-track their Jira tasks without opening the Jira web UI.

Core user stories (all already designed in the prototype `jira-timer-widget.jsx`):

- Pick a task from a list, press **Start**, work, press **Stop** → logs the time.
- If the work isn't a Jira issue yet, create a **temporary task** ("TEMP-n"), time it,
  and surface it in a "tell the scrum master" note so they can create the real issue later.
- The widget can **collapse into a thin arrow tab** pinned to the screen edge; clicking the
  arrow expands it again. While collapsed and running, the tab still shows the live timer.
- Each real Jira task shows a **status badge** that is clickable to change the task's status
  (To Do / In Progress / In Review / Done). Temp tasks have no status (not real issues yet).
- The widget header is **draggable**; a pin icon represents the always-on-top behavior.

## 2. Tech stack (decided)

- **Desktop shell:** Tauri 2 (stable; current ~v2.10+). Chosen over Electron for low memory /
  small footprint since this widget runs all day. Uses Windows' built-in WebView2.
- **Frontend:** React + Vite + **TypeScript**. Reuse the existing prototype component.
- **Backend logic:** Rust (Tauri commands) — used ONLY to call the Jira API (see §4).
- **Local persistence:** `tauri-plugin-store` (a simple JSON store) for temp tasks, logs,
  and in-progress timer state.
- **Secure token storage:** OS keychain — Windows Credential Manager (e.g. a keyring plugin),
  NOT a plaintext config file.
- **Window features to configure:** `alwaysOnTop: true`, `decorations: false`,
  `transparent: true`, `skipTaskbar: true`, plus a system-tray icon and a global shortcut
  for start/stop. The collapse/expand action resizes & repositions the window.
- **Packaging:** Tauri bundler → Windows `.msi` / `.exe` (NSIS).

## 3. The user's Jira (IMPORTANT)

- URL: `https://jira.medrick.info/` → it is a **self-hosted Jira (Server or Data Center)**,
  **NOT** Jira Cloud (it is not on `*.atlassian.net`).
- Exact version unknown — user should check **Help (?) → About Jira** if needed.
- **Auth:** Personal Access Token (PAT), sent as `Authorization: Bearer <token>`.
  PAT is available in Jira Server 8.14+ and Data Center. If the user's version is older
  (no "Personal Access Tokens" tab under Profile), fall back to username + password / basic auth.

### Jira API notes (Server/DC — different from Cloud!)

- The Cloud-only deprecation of `/rest/api/3/search` does **NOT** apply here. Self-hosted
  Jira still uses the classic search endpoint with `startAt` pagination:
  - Search issues (JQL): `GET /rest/api/2/search?jql=...&startAt=...&maxResults=...`
- Log work on stop: `POST /rest/api/2/issue/{issueKey}/worklog`
- Status changes must use allowed workflow transitions, NOT a fixed status list:
  - List transitions: `GET /rest/api/2/issue/{issueKey}/transitions`
  - Apply transition: `POST /rest/api/2/issue/{issueKey}/transitions`
  - So the clickable status badge should fetch the issue's *available* transitions and show
    only those, instead of the hardcoded 4-status list used in the prototype.

## 4. Architecture rules / gotchas

- **All Jira API calls go through the Rust backend, never from the WebView directly.**
  Reasons: (1) CORS — the webview can't fetch the Jira domain directly; (2) the PAT must
  not be exposed to the frontend. Frontend calls Tauri commands; Rust uses `reqwest`.
- Keep the PAT in the OS keychain; load it in Rust only when making requests.
- Persist running-timer state so a crash/restart doesn't lose an in-progress session.

## 5. Prerequisites to install on the user's Windows machine

- **Rust** (for the Tauri backend) — https://rustup.rs
- **Node.js** (for Vite/React) — LTS
- **WebView2** — already present on Windows 11; install runtime if missing.
- (Tauri also needs the MSVC C++ build tools on Windows.)

## 6. Current state

- We have a working **UI prototype** as a single React file: `jira-timer-widget.jsx`.
  It runs in-browser with MOCK data (no real Jira yet) and demonstrates every feature in §1,
  rendered over a faux Windows desktop so the floating concept is visible.
- Nothing is wired to real Jira yet. No Tauri project scaffolded yet.

## 7. Next steps (where to continue)

1. Scaffold a Tauri 2 + React + Vite + TS project.
2. Port the prototype component in; split styles/components as sensible; convert to TSX.
3. Configure the Tauri window (always-on-top, frameless, transparent, skipTaskbar, tray,
   global shortcut) and the collapse/expand resize logic.
4. Add a settings screen: Jira base URL (`https://jira.medrick.info`) + PAT, stored in the
   OS keychain.
5. Implement Rust Tauri commands: `search_issues` (JQL), `add_worklog`,
   `get_transitions`, `apply_transition`. Use `/rest/api/2/...` with Bearer auth.
6. Replace mock data with real calls; make the status badge use real transitions.
7. Wire local persistence (temp tasks, logs, running timer) via `tauri-plugin-store`.
8. Test against the user's Jira, then bundle to `.msi`.

When you start, confirm prerequisites are installed (offer to run the install/check commands),
then begin at step 1.
