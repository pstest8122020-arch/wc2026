import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : resolve(__dirname, 'data', 'wc2026.db');

const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id              INTEGER PRIMARY KEY,
      api_id          TEXT UNIQUE,
      round           TEXT NOT NULL,
      group_name      TEXT,
      match_num       INTEGER NOT NULL,
      home_team       TEXT NOT NULL DEFAULT 'TBD',
      away_team       TEXT NOT NULL DEFAULT 'TBD',
      home_goals      INTEGER,
      away_goals      INTEGER,
      status          TEXT DEFAULT 'SCHEDULED',
      kickoff_utc     TEXT,
      pts_multiplier  INTEGER DEFAULT 1,
      manual_result   INTEGER DEFAULT 0
    );

    -- Add manual_result column if upgrading from older schema
    -- (idempotent: ignored if it already exists)

    CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
    CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round);
    CREATE INDEX IF NOT EXISTS idx_matches_match_num ON matches(match_num);

    CREATE TABLE IF NOT EXISTS participants (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      discord                 TEXT UNIQUE NOT NULL,
      email                   TEXT,
      wallet_address          TEXT,
      referred_by             TEXT,
      submitted_at            TEXT DEFAULT (datetime('now')),
      pick_golden_boot        TEXT,
      pick_top_assister       TEXT,
      pick_golden_glove       TEXT,
      pick_best_young         TEXT,
      pick_player_tournament  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_participants_wallet ON participants(wallet_address);

    CREATE TABLE IF NOT EXISTS score_predictions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      discord         TEXT NOT NULL REFERENCES participants(discord),
      match_id        INTEGER NOT NULL REFERENCES matches(id),
      pred_home       INTEGER NOT NULL,
      pred_away       INTEGER NOT NULL,
      points_earned   INTEGER DEFAULT 0,
      UNIQUE(discord, match_id)
    );

    CREATE INDEX IF NOT EXISTS idx_score_predictions_discord ON score_predictions(discord);
    CREATE INDEX IF NOT EXISTS idx_score_predictions_match ON score_predictions(match_id);

    CREATE TABLE IF NOT EXISTS player_picks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      discord         TEXT NOT NULL REFERENCES participants(discord),
      match_id        INTEGER NOT NULL REFERENCES matches(id),
      first_scorer    TEXT NOT NULL,
      assist_player   TEXT NOT NULL,
      motm            TEXT NOT NULL,
      fs_points       INTEGER DEFAULT 0,
      assist_points   INTEGER DEFAULT 0,
      motm_points     INTEGER DEFAULT 0,
      submitted_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(discord, match_id)
    );

    CREATE INDEX IF NOT EXISTS idx_player_picks_discord ON player_picks(discord);
    CREATE INDEX IF NOT EXISTS idx_player_picks_match ON player_picks(match_id);

    CREATE TABLE IF NOT EXISTS match_player_results (
      match_id        INTEGER PRIMARY KEY REFERENCES matches(id),
      first_scorer    TEXT,
      all_scorers     TEXT,
      assist_players  TEXT,
      motm            TEXT,
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tournament_awards (
      id                 INTEGER PRIMARY KEY CHECK (id = 1),
      golden_boot        TEXT,
      top_assister       TEXT,
      golden_glove       TEXT,
      best_young         TEXT,
      player_tournament  TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ran_at      TEXT DEFAULT (datetime('now')),
      ok          INTEGER NOT NULL,
      message     TEXT
    );
  `);

  // Forward migration: add manual_result column on older databases
  const matchCols = db.prepare("PRAGMA table_info(matches)").all();
  const hasManual = matchCols.some((c) => c.name === 'manual_result');
  if (!hasManual) {
    db.exec('ALTER TABLE matches ADD COLUMN manual_result INTEGER DEFAULT 0');
  }

  // Forward migration: add wallet_address column on older databases
  const partCols = db.prepare("PRAGMA table_info(participants)").all();
  const hasWallet = partCols.some((c) => c.name === 'wallet_address');
  if (!hasWallet) {
    db.exec('ALTER TABLE participants ADD COLUMN wallet_address TEXT');
  }
}

migrate();

export function seedPlaceholderMatches() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM matches').get().c;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO matches (round, group_name, match_num, pts_multiplier)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    const groupLetters = 'ABCDEFGHIJKLMNOP'.split('');
    let matchNum = 1;

    for (const letter of groupLetters) {
      for (let g = 0; g < 3; g++) {
        insert.run('Group Stage', letter, matchNum++, 1);
      }
    }
    for (let i = 0; i < 16; i++) insert.run('Round of 32', null, matchNum++, 1);
    for (let i = 0; i < 8; i++) insert.run('Round of 16', null, matchNum++, 2);
    for (let i = 0; i < 4; i++) insert.run('Quarterfinal', null, matchNum++, 2);
    for (let i = 0; i < 2; i++) insert.run('Semifinal', null, matchNum++, 2);
    insert.run('3rd Place', null, matchNum++, 2);
    insert.run('Final', null, matchNum++, 2);
  });

  tx();
  console.log('[db] Seeded 80 placeholder matches');
}
