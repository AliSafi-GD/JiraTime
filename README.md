# Jira Time Tracker

A small **floating, always-on-top desktop widget for Windows** to manage and
time-track Jira tasks without opening the Jira web UI. Built with Tauri 2
(Rust backend) + React + TypeScript, so it stays light enough to run all day.

> Works with **self-hosted Jira (Server / Data Center)** — not Jira Cloud.

## Features

- **One-click timing** — pick a task, Start, work, Stop → time is logged to Jira.
- **Temporary tasks** — track work that isn't a Jira issue yet ("TEMP-n"); a note
  reminds you to ask the scrum master to create the real issue later.
- **Collapsible tab** — fold the widget into a thin tab pinned to a screen edge;
  it keeps showing the live timer while collapsed. Dock left/right, auto-dim when idle.
- **Live status badge** — change an issue's status straight from the widget using its
  real, allowed workflow transitions.
- **Board / sprint filter** — list your issues by board and active sprint (Agile API).
- **Search & sort** — filter by key/title; sort by updated, created, key, name, or
  group by status.
- **Worklog feedback** — clear messages on stop (logged to Jira, local-only, or error).
- **Crash-safe** — temp tasks, logs, and the running timer survive restarts.
- **Bilingual** — Persian / English with automatic RTL/LTR.
- **System tray** — closing hides to tray; quit from the tray menu.
- **Run at startup** — optional, enabled by default on first run.

## Security

- All Jira API calls go through the Rust backend (avoids CORS and keeps the token
  off the WebView).
- The Personal Access Token (or password) is stored in the **Windows Credential
  Manager**, never in a plaintext file.

## Authentication

Self-hosted Jira, authenticated with a **Personal Access Token** (Bearer) or
**username + password** (Basic). Create a PAT in Jira: profile → *Personal Access
Tokens* (Jira Server 8.14+ / Data Center). Older versions: use username + password.

## Install (end users)

Download the latest installer from the
[Releases](https://github.com/AliSafi-GD/JiraTime/releases) page:

- `Jira Timer_x.y.z_x64-setup.exe` (NSIS) — or
- `Jira Timer_x.y.z_x64_en-US.msi` (MSI)

Windows 10/11 with the WebView2 runtime (already present on Windows 11).

## Build from source

Prerequisites: [Rust](https://rustup.rs), [Node.js](https://nodejs.org) LTS, and the
MSVC C++ build tools.

```bash
npm install
npm run tauri dev     # run in development
npm run tauri build   # produce exe + msi + nsis in src-tauri/target/release
```

## Tech stack

Tauri 2 · React · Vite · TypeScript · Rust (`reqwest`, `keyring`) ·
`tauri-plugin-store` · `tauri-plugin-autostart`.
