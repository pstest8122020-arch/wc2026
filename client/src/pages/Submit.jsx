import { useEffect, useMemo, useReducer, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import ScoreInput from '../components/ScoreInput.jsx';
import PlayerAutocomplete from '../components/PlayerAutocomplete.jsx';
import TeamName from '../components/TeamName.jsx';
import PredictMarketsCTA from '../components/PredictMarketsCTA.jsx';
import { formatKickoff } from '../lib/scoring.js';
import { useAuth, discordLoginUrl } from '../hooks/useAuth.js';
import { setIdentity } from '../lib/identity.js';
import { useJupiterOdds } from '../hooks/useJupiterOdds.js';
import MatchOdds from '../components/MatchOdds.jsx';

const STEPS = [
  'Your Info',
  'Group Stage',
  'Award Picks',
  'Review',
];

const initial = {
  step: 0,
  info: { discord: '', wallet_address: '' },
  awards: {
    golden_boot: '',
    best_young: '',
    player_tournament: '',
  },
  scores: {}, // { [matchId]: { pred_home, pred_away } }
  copiedFrom: null,
  copiedSkipped: 0,
};

function reducer(state, action) {
  switch (action.type) {
    case 'setStep':
      return { ...state, step: action.step };
    case 'setInfo':
      return { ...state, info: { ...state.info, ...action.patch } };
    case 'setAward':
      return { ...state, awards: { ...state.awards, [action.key]: action.value } };
    case 'setScore':
      return {
        ...state,
        scores: {
          ...state.scores,
          [action.matchId]: {
            pred_home: action.pred_home,
            pred_away: action.pred_away,
          },
        },
      };
    case 'fillScores':
      return { ...state, scores: { ...state.scores, ...action.scores } };
    case 'loadCopy':
      return {
        ...state,
        awards: { ...state.awards, ...(action.awards || {}) },
        scores: { ...state.scores, ...(action.scores || {}) },
        copiedFrom: action.from,
        copiedSkipped: action.skipped || 0,
      };
    default:
      return state;
  }
}

function DiceIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Realistic random scoreline — most games are 0–2 goals a side.
function randGoals() {
  const r = Math.random();
  if (r < 0.34) return 0;
  if (r < 0.7) return 1;
  if (r < 0.88) return 2;
  if (r < 0.97) return 3;
  return 4;
}

export default function Submit() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [matches, setMatches] = useState(null);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [state, dispatch] = useReducer(reducer, initial);
  const auth = useAuth();
  // When logged in with Discord, the verified handle is the identity — keep the
  // form's username synced to it (the field renders read-only).
  useEffect(() => {
    if (auth.loggedIn && auth.handle && state.info.discord !== auth.handle) {
      dispatch({ type: 'setInfo', patch: { discord: auth.handle } });
    }
  }, [auth.loggedIn, auth.handle, state.info.discord]);
  const { data: oddsData } = useJupiterOdds();
  const oddsMatches = oddsData?.matches || {};
  const [confirmCheck, setConfirmCheck] = useState(false);

  useEffect(() => {
    api
      .matches()
      .then((list) => {
        setMatches(list);
        const m1 = list.find((m) => m.match_num === 1);
        if (m1 && m1.status !== 'SCHEDULED') setClosed(true);
      })
      .catch(() => setError('Could not load matches'));
  }, []);

  // Fork-to-edit: if arriving via a "copy a bracket" link (?from=&copy=), pull
  // the source's still-open picks + awards and pre-fill the draft.
  useEffect(() => {
    const from = (searchParams.get('from') || '').trim();
    const copyToken = (searchParams.get('copy') || '').trim();
    if (!from) return;
    api
      .copyBracket(from, copyToken)
      .then((r) => {
        const scoreMap = {};
        for (const s of r.scores || []) scoreMap[s.match_id] = { pred_home: s.pred_home, pred_away: s.pred_away };
        const awards = {};
        for (const k of ['golden_boot', 'best_young', 'player_tournament']) {
          if (r.awards && r.awards[k]) awards[k] = r.awards[k];
        }
        dispatch({ type: 'loadCopy', from: r.source_handle || from, awards, scores: scoreMap, skipped: r.skipped || 0 });
      })
      .catch((e) => setError(e.message || 'Could not load that bracket to copy.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open matches = SCHEDULED + both teams known. At launch this is all 72 group games.
  const openMatches = useMemo(() => {
    if (!matches) return [];
    return matches.filter(
      (m) => m.status === 'SCHEDULED' && m.home_team !== 'TBD' && m.away_team !== 'TBD',
    );
  }, [matches]);

  if (closed) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="font-display text-2xl font-extrabold text-trifid mb-2">Submissions are closed</h1>
        <p className="text-cloud/80 mb-4">The tournament has already started.</p>
        <Link to="/" className="text-nebula hover:text-helix underline">
          View live bracket →
        </Link>
      </div>
    );
  }

  if (!matches) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-steel">Loading…</div>;
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="font-display text-3xl font-extrabold mb-2 bg-jupiter-gradient bg-clip-text text-transparent">
          You're in.
        </h1>
        <p className="text-cloud/80 mb-6">
          Your bracket has been submitted. Good luck.
        </p>
        <div className="mb-6 text-left">
          <div className="text-[10px] uppercase tracking-[0.2em] text-cosmic font-bold mb-2 text-center">
            Your next step
          </div>
          <PredictMarketsCTA telegram="https://t.me/worldcuplounge" />
        </div>
        <p className="text-cloud/70 text-sm mb-6">
          Knockout-round predictions open once the group stage is complete and the draw is set. Your wallet
          qualifies for leaderboard payouts once it has traded on Jupiter Prediction Markets.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            to="/leaderboard"
            className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded"
          >
            View leaderboard
          </Link>
          <Link
            to="/"
            className="bg-meteorite border border-charcoal text-cloud font-display font-bold px-4 py-2 rounded"
          >
            View bracket
          </Link>
        </div>
      </div>
    );
  }

  const step = state.step;

  async function next() {
    setError('');
    if (step === 0) {
      const { discord, wallet_address } = state.info;
      if (!discord.trim()) return setError('Discord username or X handle is required');
      if (discord.length > 50) return setError('Username must be 50 chars or fewer');
      if (!wallet_address.trim()) return setError('Wallet address is required');
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet_address.trim())) {
        return setError('That doesn\'t look like a valid Solana wallet address');
      }
      try {
        const existing = await api.participant(discord.trim()).catch(() => null);
        if (existing) {
          return setError(
            `A submission already exists for ${discord}. If you believe this is an error, contact the admin.`,
          );
        }
      } catch {}
    }
    if (step === 1) {
      for (const m of openMatches) {
        const s = state.scores[m.id];
        if (!s || s.pred_home === '' || s.pred_away === '' || s.pred_home == null || s.pred_away == null) {
          return setError(`Fill in the score for match #${m.match_num}: ${m.home_team} vs ${m.away_team}`);
        }
      }
    }
    if (step === 2) {
      for (const [k, v] of Object.entries(state.awards)) {
        if (!v.trim()) return setError(`Please fill in: ${k.replace(/_/g, ' ')}`);
      }
    }
    dispatch({ type: 'setStep', step: Math.min(STEPS.length - 1, step + 1) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function back() {
    setError('');
    dispatch({ type: 'setStep', step: Math.max(0, step - 1) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function doSubmit() {
    setError('');
    if (!confirmCheck) return setError('Please confirm the eligibility checkbox');
    const scoresArr = openMatches.map((m) => {
      const s = state.scores[m.id];
      return {
        match_id: m.id,
        pred_home: Number(s.pred_home),
        pred_away: Number(s.pred_away),
      };
    });
    setSubmitting(true);
    try {
      await api.submitPredictions({
        discord: state.info.discord.trim(),
        wallet_address: state.info.wallet_address.trim(),
        awards: state.awards,
        scores: scoresArr,
        forked_from: state.copiedFrom || undefined,
      });
      // Remember locally so MyPicks / MatchPicks can prove ownership to the API.
      setIdentity({
        discord: state.info.discord.trim(),
        wallet: state.info.wallet_address.trim(),
      });
      setSuccess(true);
    } catch (e) {
      setError(e.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <div className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-steel font-medium mb-2">
        Jupiter Community Predictor Challenge
      </div>
      <h1 className="font-display text-2xl sm:text-3xl font-black text-cloud mb-1">Submit your bracket</h1>
      <div className="text-sm text-steel mb-5">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </div>

      <div className="w-full bg-charcoal rounded-full h-2 mb-6 overflow-hidden">
        <div
          className="h-2 bg-jupiter-gradient rounded-full transition-all"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* The OAuth callback bounces here with ?login_error= on failure — without
          this banner the login just silently "doesn't work". */}
      {searchParams.get('login_error') && !auth.loggedIn && (
        <div className="mb-4 rounded-lg border border-trifid/50 bg-trifid/10 px-4 py-3 text-sm text-cloud">
          <b className="text-trifid">Discord login didn&apos;t complete</b>{' '}
          <span className="text-steel">({searchParams.get('login_error')})</span>
          {' — '}
          {searchParams.get('login_error') === 'rate_limited'
            ? 'Discord is rate-limiting logins from our server right now. Wait a few minutes, then '
            : ['expired', 'bad_state'].includes(searchParams.get('login_error'))
              ? 'the attempt timed out. '
              : 'something went wrong on the way back from Discord. '}
          <a className="underline text-nebula hover:text-helix" href={discordLoginUrl('/submit')}>
            Try again
          </a>
        </div>
      )}

      {state.copiedFrom && (
        <div className="mb-4 bg-jupiter-gradient rounded-lg p-[1px]">
          <div className="bg-space rounded-[7px] px-4 py-3 text-sm text-cloud">
            Forking <b className="text-cosmic">@{state.copiedFrom}</b>'s bracket — picks are pre-filled
            below. Edit anything, enter your own details, then submit as your own.
            {state.copiedSkipped > 0 && (
              <span className="text-steel">
                {' '}({state.copiedSkipped} already-started{' '}
                {state.copiedSkipped === 1 ? 'match was' : 'matches were'} skipped.)
              </span>
            )}
          </div>
        </div>
      )}

      <div className="bg-meteorite border border-charcoal rounded-xl p-5 mb-4">
        {step === 0 && <YourInfo state={state} dispatch={dispatch} auth={auth} />}
        {step === 1 && <GroupStageStep matches={openMatches} state={state} dispatch={dispatch} odds={oddsMatches} />}
        {step === 2 && <Awards state={state} dispatch={dispatch} />}
        {step === 3 && (
          <Review
            state={state}
            openMatches={openMatches}
            confirmCheck={confirmCheck}
            setConfirmCheck={setConfirmCheck}
          />
        )}

        {error && (
          <div className="mt-4 text-sm text-trifid bg-trifid/10 border border-trifid/30 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        {step === 0 ? (
          <button
            type="button"
            onClick={() => {
              const dirty =
                state.info.discord ||
                state.info.wallet_address ||
                Object.values(state.awards).some(Boolean) ||
                Object.keys(state.scores).length > 0;
              if (dirty && !confirm('Cancel and go back? Your entries will be lost.')) return;
              navigate('/');
            }}
            className="px-4 py-2 rounded bg-meteorite border border-charcoal text-cloud font-medium hover:border-nebula transition"
          >
            ← Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={back}
            className="px-4 py-2 rounded bg-meteorite border border-charcoal text-cloud font-medium hover:border-nebula transition"
          >
            ← Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="px-4 py-2 rounded bg-jupiter-gradient text-space font-display font-bold"
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            onClick={doSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded bg-jupiter-gradient text-space font-display font-bold disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit bracket'}
          </button>
        )}
      </div>
    </div>
  );
}

function YourInfo({ state, dispatch }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display font-bold text-cloud">Your info</h2>
      <Field label="Discord username or X handle">
        <input
          value={state.info.discord}
          maxLength={50}
          onChange={(e) => dispatch({ type: 'setInfo', patch: { discord: e.target.value } })}
          placeholder="e.g. @ronaldo99"
          className={inputCls}
        />
      </Field>
      <Field label="Solana wallet address (eligibility + payout)">
        <input
          value={state.info.wallet_address}
          onChange={(e) => dispatch({ type: 'setInfo', patch: { wallet_address: e.target.value } })}
          placeholder="e.g. 7xKXt…"
          spellCheck={false}
          autoComplete="off"
          className={`${inputCls} font-mono text-sm`}
        />
        <div className="text-xs text-steel mt-1">
          Must be a wallet that has interacted with{' '}
          <a className="text-nebula hover:text-helix underline" href="https://jup.ag/prediction/world-cup" target="_blank" rel="noreferrer">
            Jupiter Prediction Markets
          </a>
          . We'll verify after the submission. Ineligible submissions will be disqualified.{' '}
          <b className="text-cloud/90">Any prizes you win are paid to this wallet</b>, so use one you control.
        </div>
      </Field>
    </div>
  );
}

function Awards({ state, dispatch }) {
  const fields = [
    {
      key: 'golden_boot',
      label: 'Golden Boot',
      pts: 25,
      help: 'Awarded to the tournament\'s top goalscorer. Tiebreaker: most assists, then fewest minutes played.',
    },
    {
      key: 'best_young',
      label: 'Best Young Player',
      pts: 15,
      help: 'Awarded to the best player aged 21 or under (born on or after January 1, 2005 for WC 2026).',
    },
    {
      key: 'player_tournament',
      label: 'Player of the Tournament',
      pts: 20,
      help: 'Also called the Golden Ball. Awarded to the best player overall, chosen by FIFA\'s Technical Study Group.',
    },
  ];
  return (
    <div className="space-y-3">
      <h2 className="font-display font-bold text-cloud">Player award picks</h2>
      <p className="text-xs bg-cosmic/10 border border-cosmic/30 text-cosmic rounded px-3 py-2">
        You can edit these (and your scores) from <b>My Picks</b> until the tournament kicks off — after
        that they're <b>locked for the full tournament</b>. Hover the label for a quick description of each award.
      </p>
      {fields.map((f) => (
        <Field key={f.key} label={`${f.label} (${f.pts} pts)`} help={f.help}>
          <PlayerAutocomplete
            value={state.awards[f.key]}
            onChange={(v) => dispatch({ type: 'setAward', key: f.key, value: v })}
            className={inputCls}
            placeholder="Start typing a player…"
          />
        </Field>
      ))}
    </div>
  );
}

function GroupStageStep({ matches, state, dispatch, odds = {} }) {
  const byGroup = useMemo(() => {
    const m = {};
    for (const x of matches) {
      const g = x.group_name || '?';
      if (!m[g]) m[g] = [];
      m[g].push(x);
    }
    return m;
  }, [matches]);

  const groups = Object.keys(byGroup).sort();

  const isFilled = (m) => {
    const s = state.scores[m.id];
    return s && s.pred_home !== '' && s.pred_home != null && s.pred_away !== '' && s.pred_away != null;
  };
  const filledCount = matches.filter(isFilled).length;
  function autofill() {
    const fill = {};
    for (const m of matches) {
      if (!isFilled(m)) fill[m.id] = { pred_home: randGoals(), pred_away: randGoals() };
    }
    if (Object.keys(fill).length) dispatch({ type: 'fillScores', scores: fill });
  }

  return (
    <div>
      <h2 className="font-display font-bold text-cloud mb-1">Group Stage predictions</h2>
      <p className="text-xs text-cloud/70 mb-3">
        {matches.length} matches across {groups.length} groups · 3 pts exact · 1 pt correct result.
      </p>
      <p className="text-xs bg-nebula/10 border border-nebula/30 text-nebula rounded px-3 py-2 mb-3">
        Knockout-round predictions (R32 onward) will be collected separately after the group stage,
        once the draw is set.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-meteorite border border-charcoal rounded-lg px-3 py-2">
        <div className="text-xs text-cloud/70">
          <b className="text-cloud">{filledCount}</b> / {matches.length} matches filled
        </div>
        <button
          type="button"
          onClick={autofill}
          disabled={filledCount === matches.length}
          className="inline-flex items-center gap-2 bg-charcoal border border-gunmetal hover:border-nebula text-cloud text-sm font-display font-bold px-3 py-1.5 rounded disabled:opacity-40"
        >
          <DiceIcon />
          Auto-fill blank matches
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {groups.map((g) => (
          <div key={g} className="border border-charcoal rounded-lg p-3 bg-charcoal/40">
            <div className="font-display font-bold text-cloud mb-1">Group {g}</div>
            {byGroup[g].map((m) => (
              <MatchScoreRow key={m.id} match={m} state={state} dispatch={dispatch} odds={odds[m.id]} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchScoreRow({ match, state, dispatch, odds }) {
  const s = state.scores[match.id];
  return (
    <div className="border-b last:border-b-0 border-charcoal/60 py-1">
      <div className="text-[10px] text-steel flex items-center justify-between gap-2">
        <span>#{match.match_num} · {formatKickoff(match.kickoff_utc)}</span>
        <MatchOdds odds={odds} />
      </div>
      <ScoreInput
        homeTeam={match.home_team}
        awayTeam={match.away_team}
        homeValue={s?.pred_home}
        awayValue={s?.pred_away}
        onChange={({ home, away }) =>
          dispatch({
            type: 'setScore',
            matchId: match.id,
            pred_home: home === '' ? '' : Number(home),
            pred_away: away === '' ? '' : Number(away),
          })
        }
      />
    </div>
  );
}

function Review({ state, openMatches, confirmCheck, setConfirmCheck }) {
  return (
    <div>
      <h2 className="font-display font-bold text-cloud mb-3">Review your bracket</h2>
      <div className="grid sm:grid-cols-2 gap-3 mb-4 text-sm">
        <div className="bg-charcoal border border-gunmetal rounded p-3">
          <div className="font-semibold text-cloud mb-1">Your info</div>
          <div className="text-cloud/80">Discord: <b className="text-cloud">{state.info.discord}</b></div>
          <div className="text-cloud/80 break-all">Wallet: <b className="text-cloud font-mono text-xs">{state.info.wallet_address}</b></div>
        </div>
        <div className="bg-charcoal border border-gunmetal rounded p-3">
          <div className="font-semibold text-cloud mb-1">Awards</div>
          <div className="text-cloud/80">Golden Boot: <b className="text-cloud">{state.awards.golden_boot}</b></div>
          <div className="text-cloud/80">Best Young: <b className="text-cloud">{state.awards.best_young}</b></div>
          <div className="text-cloud/80">Player of Tournament: <b className="text-cloud">{state.awards.player_tournament}</b></div>
        </div>
      </div>

      <details className="border border-charcoal rounded p-3 mb-4 bg-charcoal/40">
        <summary className="cursor-pointer font-display font-bold text-cloud">
          All {Object.keys(state.scores).length} group-stage predictions
        </summary>
        <div className="mt-2 max-h-80 overflow-y-auto text-xs">
          {openMatches.map((m) => {
            const s = state.scores[m.id];
            return (
              <div key={m.id} className="flex justify-between gap-2 border-b border-charcoal/60 py-0.5">
                <span className="text-cloud/80 truncate flex items-center gap-1">
                  <span className="text-steel">#{m.match_num}</span>
                  <TeamName name={m.home_team} size={12} />
                  <span className="text-steel">vs</span>
                  <TeamName name={m.away_team} size={12} />
                </span>
                <span className="font-mono text-cloud shrink-0">{s?.pred_home ?? '?'}–{s?.pred_away ?? '?'}</span>
              </div>
            );
          })}
        </div>
      </details>

      <label className="flex items-start gap-2 text-sm text-cloud/80">
        <input
          type="checkbox"
          checked={confirmCheck}
          onChange={(e) => setConfirmCheck(e.target.checked)}
          className="mt-1 accent-nebula"
        />
        <span>
          I confirm this is my only entry, my wallet has interacted with Jupiter Prediction Markets, and I am
          eligible to participate.
        </span>
      </label>
    </div>
  );
}

const inputCls =
  'w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud placeholder:text-steel focus:border-nebula focus:outline-none';

function Field({ label, children, help }) {
  return (
    <label className="block text-sm">
      <div className="text-cloud/80 mb-1 flex items-center gap-1.5">
        {help ? (
          <span className="relative group inline-flex items-center gap-1.5 cursor-help">
            <span className="border-b border-dotted border-steel">{label}</span>
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] bg-charcoal text-steel border border-gunmetal"
            >
              ?
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 bottom-full mb-1.5 z-10 w-72 max-w-[calc(100vw-2rem)]
                         opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
                         transition-opacity duration-150
                         bg-meteorite border border-nebula/40 rounded-lg shadow-lg
                         px-3 py-2 text-[11px] leading-snug text-cloud/90 normal-case"
            >
              {help}
            </span>
          </span>
        ) : (
          <span>{label}</span>
        )}
      </div>
      {children}
    </label>
  );
}
