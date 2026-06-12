import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'alpha.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    total_messages  INTEGER NOT NULL DEFAULT 0,
    total_calls     INTEGER NOT NULL DEFAULT 0,
    distinct_callers INTEGER NOT NULL DEFAULT 0,
    distinct_posters INTEGER NOT NULL DEFAULT 0,
    active_days     INTEGER NOT NULL DEFAULT 0,
    start_ts        TEXT,
    end_ts          TEXT
  );

  CREATE TABLE IF NOT EXISTS daily (
    channel_id  TEXT NOT NULL,
    date        TEXT NOT NULL,
    msgs        INTEGER NOT NULL DEFAULT 0,
    calls       INTEGER NOT NULL DEFAULT 0,
    posters     INTEGER NOT NULL DEFAULT 0,
    callers     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, date)
  );

  CREATE TABLE IF NOT EXISTS callers (
    channel_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    msgs        INTEGER NOT NULL DEFAULT 0,
    calls       INTEGER NOT NULL DEFAULT 0,
    is_bot      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, name)
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);
