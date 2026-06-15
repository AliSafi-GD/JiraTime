export interface Task {
  key: string;
  title: string;
  status: string;
  temp: boolean;
  created: string; // ISO timestamp
  updated: string; // ISO timestamp
}

export interface LogEntry {
  id: number;
  key: string;
  title: string;
  temp: boolean;
  secs: number;
}
