import { load, type Store } from "@tauri-apps/plugin-store";
import type { Task, LogEntry } from "./types";

// Persisted widget state so a crash/restart doesn't lose an in-progress session.
export interface PersistState {
  tempTasks: Task[]; // client-only tasks (not real Jira issues)
  logs: LogEntry[]; // recorded time entries
  selected: string | null; // currently selected task key
  running: boolean; // was a timer running
  startedAt: number | null; // epoch ms the current running segment started
  accumulatedSecs: number; // seconds banked from previous segments (before a pause)
  paused: boolean; // session active but not counting
}

const FILE = "state.json";
let storePromise: Promise<Store> | null = null;

function store(): Promise<Store> {
  if (!storePromise)
    storePromise = load(FILE, { defaults: {}, autoSave: true });
  return storePromise;
}

export async function loadState(): Promise<PersistState | null> {
  const s = await store();
  return (await s.get<PersistState>("state")) ?? null;
}

export async function saveState(state: PersistState): Promise<void> {
  const s = await store();
  await s.set("state", state);
  await s.save();
}

export async function clearState(): Promise<void> {
  const s = await store();
  await s.delete("state");
  await s.save();
}
