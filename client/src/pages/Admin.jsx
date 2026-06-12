import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { formatKickoff } from '../lib/scoring.js';
import TeamName from '../components/TeamName.jsx';

const TOKEN_KEY = 'jcpc_admin_token';

export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState(null);
  const [matches, setMatches] = useState([]);
  const [awards, setAwards] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function tryLogin(t) {
    setError('');
    try {
      const s = await api.admin.stats(t);
      setStats(s);
      setAuthed(true);
      sessionStorage.setItem(TOKEN_KEY, t);
      const m = await api.matches();
      setMatches(m);
      const a = await api.admin.getAwards(t).catch(() => null);
      setAwards(a);
    } catch (e) {
      setError(e.message || 'Login failed');
      setAuthed(false);
    }
  }

  useEffect(() => {
    if (token) tryLogin(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshAll() {
    const s = await api.admin.stats(token).catch(() => null);
    if (s) setStats(s);
    const m = await api.matches().catch(() => null);
    if (m) setMatches(m);
  }

  async function doSync() {
    setBusy(true);
    try {
      await api.admin.sync(token);
      await refreshAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <h1 className="font-display text-2xl sm:text-3xl font-black text-cloud mb-6">Admin</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            tryLogin(token);
          }}
          className="space-y-3"
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Admin token"
            className="w-full bg-meteorite border border-charcoal rounded px-3 py-2 text-cloud placeholder:text-steel focus:border-nebula focus:outline-none"
          />
          <button type="submit" className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded">
            Enter
          </button>
        </form>
        {error && <div className="mt-3 text-trifid text-sm">{error}</div>}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl sm:text-3xl font-black text-cloud">Admin</h1>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem(TOKEN_KEY);
            setToken('');
            setAuthed(false);
          }}
          className="text-xs text-steel hover:text-cloud underline"
        >
          Sign out
        </button>
      </div>

      {error && (
        <div className="bg-trifid/10 border border-trifid/40 text-trifid rounded px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Participants" value={stats?.participants ?? '—'} />
        <Stat label="Score subs" value={stats?.score_predictions ?? '—'} />
        <Stat label="Player picks" value={stats?.player_picks ?? '—'} />
        <Stat
          label="Matches L/F/S"
          value={
            stats
              ? `${stats.matches.live}/${stats.matches.finished}/${stats.matches.scheduled}`
              : '—'
          }
        />
      </section>

      <section className="bg-meteorite border border-charcoal rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-bold text-cloud">Football API sync</h2>
          <button
            type="button"
            onClick={doSync}
            disabled={busy}
            className="bg-jupiter-gradient text-space font-display font-bold px-3 py-1.5 rounded disabled:opacity-50 text-sm"
          >
            {busy ? 'Syncing…' : 'Run sync now'}
          </button>
        </div>
        {stats?.last_sync && (
          <div className="text-xs text-steel">
            Last: {stats.last_sync.ran_at} · {stats.last_sync.ok ? 'OK' : 'ERROR'} · {stats.last_sync.message}
          </div>
        )}
      </section>

      <AwardsEditor token={token} initial={awards} onSaved={(a) => setAwards(a)} />

      <ParticipantsTable token={token} />

      <SybilReport token={token} />

      <MatchesTable token={token} matches={matches} onChange={refreshAll} />
    </div>
  );
}

function ParticipantsTable({ token }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await api.admin.participants(token);
      setRows(data);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = rows.filter((r) =>
    filter === 'all' ? true : r.eligibility_status === filter,
  );

  async function recheck(discord) {
    setBusy(discord);
    try { await api.admin.recheckEligibility(token, discord); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }
  async function disqualify(discord) {
    const reason = prompt(`Reason for disqualifying ${discord}?`, '');
    if (reason === null) return;
    setBusy(discord);
    try { await api.admin.disqualify(token, discord, reason); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }
  async function reinstate(discord) {
    setBusy(discord);
    try { await api.admin.reinstate(token, discord); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  const counts = rows.reduce((acc, r) => {
    acc[r.eligibility_status || 'pending'] = (acc[r.eligibility_status || 'pending'] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="bg-meteorite border border-charcoal rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="font-display font-bold text-cloud">Participants</h2>
        <div className="text-xs text-steel">
          {rows.length} total · pending: {counts.pending || 0} · eligible: {counts.eligible || 0}
          {' · '}ineligible: {counts.ineligible || 0} · disqualified: {counts.disqualified || 0}
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="ml-auto bg-charcoal border border-gunmetal rounded px-2 py-1 text-xs text-cloud focus:border-nebula focus:outline-none"
        >
          <option value="all">all</option>
          <option value="pending">pending</option>
          <option value="eligible">eligible</option>
          <option value="ineligible">ineligible</option>
          <option value="disqualified">disqualified</option>
        </select>
      </div>
      {error && <div className="text-trifid text-xs mb-2">{error}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-steel bg-charcoal">
              <th className="px-2 py-1 text-left">User</th>
              <th className="px-2 py-1 text-left">Wallet</th>
              <th className="px-2 py-1 text-left">Submitted</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Reason</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal">
            {filtered.map((r) => (
              <tr key={r.discord} className="text-cloud/90">
                <td className="px-2 py-1 font-medium text-cloud">{r.discord}</td>
                <td className="px-2 py-1 font-mono text-xs">
                  {r.wallet_address
                    ? `${r.wallet_address.slice(0, 6)}…${r.wallet_address.slice(-6)}`
                    : <span className="text-steel">—</span>}
                </td>
                <td className="px-2 py-1 text-xs text-steel whitespace-nowrap">{r.submitted_at}</td>
                <td className="px-2 py-1">
                  <StatusBadge value={r.eligibility_status || 'pending'} />
                </td>
                <td className="px-2 py-1 text-xs text-cloud/70 max-w-md truncate" title={r.eligibility_reason || ''}>
                  {r.eligibility_reason || ''}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  <button type="button" disabled={busy === r.discord}
                    onClick={() => recheck(r.discord)}
                    className="text-xs underline text-nebula disabled:opacity-50">
                    Recheck
                  </button>
                  {r.eligibility_status === 'disqualified' ? (
                    <button type="button" disabled={busy === r.discord}
                      onClick={() => reinstate(r.discord)}
                      className="ml-2 text-xs underline text-cosmic disabled:opacity-50">
                      Reinstate
                    </button>
                  ) : (
                    <button type="button" disabled={busy === r.discord}
                      onClick={() => disqualify(r.discord)}
                      className="ml-2 text-xs underline text-trifid disabled:opacity-50">
                      Disqualify
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-4 text-center text-steel">No participants in this view.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusBadge({ value }) {
  const colors = {
    pending: 'bg-charcoal text-steel border border-gunmetal',
    eligible: 'bg-trifid/20 text-trifid border border-trifid/40',
    ineligible: 'bg-cosmic/10 text-cosmic border border-cosmic/40',
    disqualified: 'bg-rose-500/10 text-rose-400 border border-rose-500/40',
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${colors[value] || colors.pending}`}>
      {value}
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-meteorite border border-charcoal rounded-xl p-3">
      <div className="text-xs text-steel">{label}</div>
      <div className="font-display text-xl font-bold text-cloud">{value}</div>
    </div>
  );
}

function SybilReport({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.admin
      .sybilReport(token)
      .then(setData)
      .catch((e) => setErr(e.message || 'Failed to load'));
  }, [token]);

  const ip = data?.ip_clusters || [];
  const dup = data?.duplicate_clusters || [];

  return (
    <section className="bg-meteorite border border-charcoal rounded-xl p-4">
      <h2 className="font-display font-bold text-cloud mb-1">Sybil signals</h2>
      <p className="text-xs text-steel mb-3">
        Heuristics only — investigate before acting (disqualify via the participants table above).
        Forked copies are expected and flagged as such.
      </p>
      {err && <div className="text-sm text-trifid mb-2">{err}</div>}

      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.15em] text-steel font-bold mb-1.5">
          Shared submit IP ({ip.length})
        </div>
        {ip.length === 0 ? (
          <div className="text-sm text-cloud/50">None.</div>
        ) : (
          <ul className="space-y-1.5">
            {ip.map((c) => (
              <li key={c.ip} className="text-sm bg-charcoal border border-gunmetal rounded px-3 py-2">
                <span className="font-mono text-xs text-cosmic">{c.ip}</span>{' '}
                <span className="text-steel">· {c.count} entries</span>
                <div className="text-cloud/80 mt-0.5 break-words">{c.participants.join(', ')}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-[0.15em] text-steel font-bold mb-1.5">
          Identical brackets ({dup.length})
        </div>
        {dup.length === 0 ? (
          <div className="text-sm text-cloud/50">None.</div>
        ) : (
          <ul className="space-y-1.5">
            {dup.map((c, i) => (
              <li key={i} className="text-sm bg-charcoal border border-gunmetal rounded px-3 py-2">
                <span className="text-steel">{c.size} identical brackets</span>
                {c.fork_linked > 0 && (
                  <span className="ml-2 text-[11px] text-cosmic">{c.fork_linked} forked (expected)</span>
                )}
                <div className="text-cloud/80 mt-0.5 break-words">{c.participants.join(', ')}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AwardsEditor({ token, initial, onSaved }) {
  const [form, setForm] = useState(() => ({
    golden_boot: '',
    best_young: '',
    player_tournament: '',
  }));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) {
      setForm({
        golden_boot: initial.golden_boot || '',
        best_young: initial.best_young || '',
        player_tournament: initial.player_tournament || '',
      });
    }
  }, [initial]);

  async function save() {
    setError('');
    setSaved(false);
    try {
      await api.admin.setAwards(token, form);
      setSaved(true);
      onSaved?.(form);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="bg-meteorite border border-charcoal rounded-xl p-4">
      <h2 className="font-display font-bold text-cloud mb-3">Tournament awards</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          ['golden_boot', 'Golden Boot'],
          ['best_young', 'FIFA Young Player Award'],
          ['player_tournament', 'Golden Ball'],
        ].map(([k, label]) => (
          <label key={k} className="text-sm">
            <div className="text-steel mb-1">{label}</div>
            <input
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className="w-full bg-charcoal border border-gunmetal rounded px-3 py-1.5 text-cloud focus:border-nebula focus:outline-none"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          className="bg-jupiter-gradient text-space font-display font-bold px-3 py-1.5 rounded text-sm"
        >
          Save awards
        </button>
        {saved && <span className="text-trifid text-xs">Saved.</span>}
        {error && <span className="text-trifid text-xs">{error}</span>}
      </div>
    </section>
  );
}

function MatchesTable({ token, matches, onChange }) {
  const sorted = useMemo(() => [...matches].sort((a, b) => a.match_num - b.match_num), [matches]);
  const [expandedMatch, setExpandedMatch] = useState(null);

  return (
    <section className="bg-meteorite border border-charcoal rounded-xl p-4">
      <h2 className="font-display font-bold text-cloud mb-3">Matches</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-steel bg-charcoal">
              <th className="px-2 py-1 text-left">#</th>
              <th className="px-2 py-1 text-left">Round</th>
              <th className="px-2 py-1 text-left">Match</th>
              <th className="px-2 py-1 text-left">Kickoff</th>
              <th className="px-2 py-1">Score</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal">
            {sorted.map((m) => (
              <MatchRow
                key={m.id}
                m={m}
                token={token}
                onChange={onChange}
                expanded={expandedMatch === m.id}
                setExpanded={(v) => setExpandedMatch(v ? m.id : null)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatchRow({ m, token, onChange, expanded, setExpanded }) {
  const [homeGoals, setHomeGoals] = useState(m.home_goals ?? '');
  const [awayGoals, setAwayGoals] = useState(m.away_goals ?? '');
  const [status, setStatus] = useState(m.status);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setHomeGoals(m.home_goals ?? '');
    setAwayGoals(m.away_goals ?? '');
    setStatus(m.status);
  }, [m]);

  async function save() {
    setErr('');
    setBusy(true);
    try {
      await api.admin.setResult(token, m.id, {
        home_goals: Number(homeGoals),
        away_goals: Number(awayGoals),
        status,
      });
      setSavedAt(Date.now());
      onChange?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inp = "w-12 text-center bg-charcoal border border-gunmetal rounded text-cloud focus:border-nebula focus:outline-none";

  return (
    <>
      <tr className="align-top text-cloud/90">
        <td className="px-2 py-1 text-steel">{m.match_num}</td>
        <td className="px-2 py-1 text-steel whitespace-nowrap">
          {m.round}{m.group_name ? ` ${m.group_name}` : ''}
        </td>
        <td className="px-2 py-1">
          <span className="inline-flex items-center gap-1 flex-wrap">
            <TeamName name={m.home_team} size={13} />
            <span className="text-steel">vs</span>
            <TeamName name={m.away_team} size={13} />
          </span>
        </td>
        <td className="px-2 py-1 text-xs text-steel whitespace-nowrap">{formatKickoff(m.kickoff_utc)}</td>
        <td className="px-2 py-1 whitespace-nowrap">
          <input type="number" min="0" max="20" value={homeGoals}
            onChange={(e) => setHomeGoals(e.target.value)} onWheel={(e) => e.currentTarget.blur()} className={inp} />
          <span className="mx-1 text-steel">–</span>
          <input type="number" min="0" max="20" value={awayGoals}
            onChange={(e) => setAwayGoals(e.target.value)} onWheel={(e) => e.currentTarget.blur()} className={inp} />
        </td>
        <td className="px-2 py-1">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-charcoal border border-gunmetal rounded px-1 py-0.5 text-xs text-cloud focus:border-nebula focus:outline-none"
          >
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="LIVE">LIVE</option>
            <option value="FINISHED">FINISHED</option>
          </select>
        </td>
        <td className="px-2 py-1 whitespace-nowrap">
          <button
            type="button"
            onClick={save}
            disabled={busy || homeGoals === '' || awayGoals === ''}
            className="bg-jupiter-gradient text-space text-xs font-display font-bold px-2 py-1 rounded disabled:opacity-40"
          >
            {busy ? '…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="ml-1 text-xs underline text-nebula"
          >
            {expanded ? 'Hide' : 'Players'}
          </button>
          {savedAt && <span className="ml-2 text-trifid text-xs">✓</span>}
          {err && <div className="text-trifid text-xs">{err}</div>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-charcoal px-2 py-3">
            <PlayerResultEditor token={token} matchId={m.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function PlayerResultEditor({ token, matchId }) {
  const [form, setForm] = useState({
    first_scorer: '',
    all_scorers: '',
    assist_players: '',
    motm: '',
  });
  const [savedAt, setSavedAt] = useState(null);
  const [err, setErr] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState('');

  // Pre-fill from ESPN's scoring plays. Fills the fields only — the admin
  // reviews (adds MOTM, fixes anything) and explicitly saves.
  async function prefill() {
    setSuggesting(true);
    setErr('');
    setSuggestNote('');
    try {
      const s = await api.admin.espnSuggest(token, matchId);
      if (s?.error) {
        setSuggestNote(s.error);
      } else {
        setForm((f) => ({
          ...f,
          first_scorer: s.first_scorer || f.first_scorer,
          all_scorers: (s.all_scorers || []).join(', ') || f.all_scorers,
          assist_players: (s.assist_players || []).join(', ') || f.assist_players,
        }));
        setSuggestNote(
          [(s.goals || []).join(' · '), ...(s.notes || [])].filter(Boolean).join(' — ') ||
            'No scoring plays found.',
        );
      }
    } catch (e) {
      setSuggestNote(e.message || 'ESPN suggestion failed');
    } finally {
      setSuggesting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    api.admin
      .getPlayerResult(token, matchId)
      .then((r) => {
        if (cancelled || !r) return;
        setForm({
          first_scorer: r.first_scorer || '',
          all_scorers: Array.isArray(r.all_scorers) ? r.all_scorers.join(', ') : '',
          assist_players: Array.isArray(r.assist_players) ? r.assist_players.join(', ') : '',
          motm: r.motm || '',
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId, token]);

  async function save() {
    setErr('');
    try {
      await api.admin.setPlayerResult(token, matchId, form);
      setSavedAt(Date.now());
    } catch (e) {
      setErr(e.message);
    }
  }

  const inp = "w-full bg-meteorite border border-gunmetal rounded px-2 py-1 text-cloud focus:border-nebula focus:outline-none";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <label>
          <div className="text-steel">First scorer</div>
          <input value={form.first_scorer}
            onChange={(e) => setForm({ ...form, first_scorer: e.target.value })} className={inp} />
        </label>
        <label>
          <div className="text-steel">MOTM</div>
          <input value={form.motm}
            onChange={(e) => setForm({ ...form, motm: e.target.value })} className={inp} />
        </label>
        <label>
          <div className="text-steel">All scorers (comma-separated)</div>
          <input value={form.all_scorers}
            onChange={(e) => setForm({ ...form, all_scorers: e.target.value })} className={inp} />
        </label>
        <label>
          <div className="text-steel">Assist players (comma-separated)</div>
          <input value={form.assist_players}
            onChange={(e) => setForm({ ...form, assist_players: e.target.value })} className={inp} />
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        className="bg-jupiter-gradient text-space text-xs font-display font-bold px-2 py-1 rounded"
      >
        Save player result
      </button>
      <button
        type="button"
        onClick={prefill}
        disabled={suggesting}
        className="ml-2 bg-charcoal border border-nebula/50 text-nebula text-xs font-display font-bold px-2 py-1 rounded disabled:opacity-50"
      >
        {suggesting ? 'Fetching…' : 'Prefill from ESPN'}
      </button>
      {savedAt && <span className="ml-2 text-trifid text-xs">Saved.</span>}
      {err && <span className="ml-2 text-trifid text-xs">{err}</span>}
      {suggestNote && <div className="text-xs text-steel mt-1">{suggestNote}</div>}
    </div>
  );
}


