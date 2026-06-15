import { invoke } from "@tauri-apps/api/core";
import { type Settings } from "./settings";

export interface Issue {
  key: string;
  summary: string;
  status: string;
  created: string;
  updated: string;
}

export interface Transition {
  id: string;
  name: string;
  toStatus: string;
}

export interface Board {
  id: number;
  name: string;
  boardType: string;
}

export interface Sprint {
  id: number;
  name: string;
  state: string;
}

// auth fields every command needs; secret is read from the keychain in Rust
function auth(s: Settings) {
  return {
    baseUrl: s.baseUrl,
    authMethod: s.authMethod,
    username: s.authMethod === "basic" ? s.username : null,
  };
}

export function searchIssues(s: Settings, jql?: string): Promise<Issue[]> {
  return invoke<Issue[]>("search_issues", { ...auth(s), jql: jql ?? null });
}

export function getBoards(s: Settings): Promise<Board[]> {
  return invoke<Board[]>("get_boards", { ...auth(s) });
}

export function getBoardSprints(s: Settings, boardId: number): Promise<Sprint[]> {
  return invoke<Sprint[]>("get_board_sprints", { ...auth(s), boardId });
}

export function getAgileIssues(
  s: Settings,
  boardId: number,
  sprintId: number | null
): Promise<Issue[]> {
  return invoke<Issue[]>("get_agile_issues", {
    ...auth(s),
    boardId,
    sprintId: sprintId ?? null,
  });
}

export function getTransitions(s: Settings, issueKey: string): Promise<Transition[]> {
  return invoke<Transition[]>("get_transitions", { ...auth(s), issueKey });
}

export function applyTransition(
  s: Settings,
  issueKey: string,
  transitionId: string
): Promise<void> {
  return invoke("apply_transition", { ...auth(s), issueKey, transitionId });
}

export function addWorklog(
  s: Settings,
  issueKey: string,
  timeSeconds: number,
  comment?: string
): Promise<void> {
  return invoke("add_worklog", {
    ...auth(s),
    issueKey,
    timeSeconds,
    comment: comment ?? null,
  });
}
