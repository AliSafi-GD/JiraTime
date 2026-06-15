import { load, type Store } from "@tauri-apps/plugin-store";
import type { Lang } from "./i18n";

export type AuthMethod = "pat" | "basic";
export type DockSide = "left" | "right";
export type SortKey = "updated" | "created" | "key" | "name" | "status";

export interface Settings {
  baseUrl: string;
  authMethod: AuthMethod;
  username: string; // only used for basic auth
  displayName: string; // cached identity from last successful login
  // appearance
  dockSide: DockSide; // which screen edge the tab docks to
  dimOpacity: number; // 0..1 opacity of the collapsed tab when idle
  dimDelaySec: number; // seconds of idle before the tab dims
  // general
  lang: Lang;
  onboarded: boolean; // false until the first-run language pick is done
  // task list filters (persisted)
  sortKey: SortKey;
  scopeBoard: number | null; // null = my issues
  scopeSprint: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "https://jira.medrick.info",
  authMethod: "pat",
  username: "",
  displayName: "",
  dockSide: "right",
  dimOpacity: 0.3,
  dimDelaySec: 3,
  lang: "fa",
  onboarded: false,
  sortKey: "updated",
  scopeBoard: null,
  scopeSprint: null,
};

const STORE_FILE = "settings.json";
let storePromise: Promise<Store> | null = null;

function store(): Promise<Store> {
  if (!storePromise)
    storePromise = load(STORE_FILE, { defaults: {}, autoSave: true });
  return storePromise;
}

export async function loadSettings(): Promise<Settings> {
  const s = await store();
  const saved = await s.get<Partial<Settings>>("settings");
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const s = await store();
  await s.set("settings", settings);
  await s.save();
}

export async function clearSettings(): Promise<void> {
  const s = await store();
  await s.delete("settings");
  await s.save();
}
