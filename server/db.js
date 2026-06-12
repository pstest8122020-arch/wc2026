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
      pick_player_tournament  TEXT,
      eligibility_status      TEXT DEFAULT 'pending',
      eligibility_reason      TEXT,
      eligibility_checked_at  TEXT,
      forked_from             TEXT,
      submit_ip               TEXT,
      submit_user_agent       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_participants_wallet ON participants(wallet_address);
    -- One wallet per participant + case-insensitive unique usernames, enforced at the
    -- DB level. The API also checks, but these unique indexes close race-condition gaps
    -- (two simultaneous submits) and guarantee no duplicate entries can ever be stored.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_wallet_unique
      ON participants(wallet_address) WHERE wallet_address IS NOT NULL AND wallet_address != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_discord_nocase
      ON participants(discord COLLATE NOCASE);

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

    -- Owner-minted "copy this bracket" share tokens (fork-to-edit feature).
    CREATE TABLE IF NOT EXISTS copy_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      discord     TEXT NOT NULL,
      token       TEXT UNIQUE NOT NULL,
      created_at  TEXT DEFAULT (datetime('now')),
      revoked_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_copy_tokens_token ON copy_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_copy_tokens_discord ON copy_tokens(discord);

    -- First-party click tracking for outbound CTAs (e.g. the "Get eligible" link).
    CREATE TABLE IF NOT EXISTS link_clicks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event       TEXT NOT NULL,
      path        TEXT,
      target_url  TEXT,
      discord     TEXT,
      ip          TEXT,
      user_agent  TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_link_clicks_event ON link_clicks(event);

    -- Pre-tournament bracket prediction: group finish order + 8 third-place
    -- picks + tapped knockout winners -> champion. Stored as JSON and locked as
    -- a unit before kickoff. Awards remain on the participants row; the ongoing
    -- score + player picks keep their own tables (score_predictions, player_picks).
    CREATE TABLE IF NOT EXISTS bracket_predictions (
      discord       TEXT PRIMARY KEY REFERENCES participants(discord),
      groups_json   TEXT NOT NULL,
      thirds_json   TEXT NOT NULL,
      knockout_json TEXT NOT NULL,
      champion      TEXT,
      points        INTEGER DEFAULT 0,
      submitted_at  TEXT DEFAULT (datetime('now')),
      updated_at    TEXT
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

  // Forward migration: add forked_from (provenance for copied/forked brackets).
  const hasForkedFrom = partCols.some((c) => c.name === 'forked_from');
  if (!hasForkedFrom) {
    db.exec('ALTER TABLE participants ADD COLUMN forked_from TEXT');
  }

  // Forward migration: add eligibility tracking columns.
  // eligibility_status: 'pending' | 'eligible' | 'ineligible' | 'disqualified'
  // eligibility_reason: human-readable explanation from the check
  // eligibility_checked_at: timestamp of last check
  const hasElStatus = partCols.some((c) => c.name === 'eligibility_status');
  if (!hasElStatus) {
    db.exec("ALTER TABLE participants ADD COLUMN eligibility_status TEXT DEFAULT 'pending'");
    db.exec('ALTER TABLE participants ADD COLUMN eligibility_reason TEXT');
    db.exec('ALTER TABLE participants ADD COLUMN eligibility_checked_at TEXT');
  }

  // First-party DAU: one row per visitor per UTC day, written from
  // /api/auth/discord/me (which every page load calls). visitor = "d:<discord_id>"
  // for logged-in users, "a:<salted hash of ip+ua>" for anonymous — no raw PII.
  // Read by ad-hoc/admin reporting only; never exposed publicly.
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_visits (
      day       TEXT NOT NULL,
      visitor   TEXT NOT NULL,
      logged_in INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, visitor)
    )
  `);

  // Forward migration: anti-sybil submission metadata (IP + user-agent captured
  // at bracket submission). Admin-only; never exposed on public endpoints.
  const hasSubmitIp = partCols.some((c) => c.name === 'submit_ip');
  if (!hasSubmitIp) {
    db.exec('ALTER TABLE participants ADD COLUMN submit_ip TEXT');
    db.exec('ALTER TABLE participants ADD COLUMN submit_user_agent TEXT');
  }

  // Forward migration: verified Discord identity (snowflake id from "Log in with
  // Discord"). Stable even if the user changes their handle; null for legacy
  // entries created before Discord login existed.
  const hasDiscordId = partCols.some((c) => c.name === 'discord_id');
  if (!hasDiscordId) {
    db.exec('ALTER TABLE participants ADD COLUMN discord_id TEXT');
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_discord_id ON participants(discord_id) WHERE discord_id IS NOT NULL AND discord_id != ''",
    );
  }

  // Forward migration: richer click-tracking columns (originating page + destination URL).
  const clickCols = db.prepare('PRAGMA table_info(link_clicks)').all();
  if (!clickCols.some((c) => c.name === 'path')) {
    db.exec('ALTER TABLE link_clicks ADD COLUMN path TEXT');
  }
  if (!clickCols.some((c) => c.name === 'target_url')) {
    db.exec('ALTER TABLE link_clicks ADD COLUMN target_url TEXT');
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
