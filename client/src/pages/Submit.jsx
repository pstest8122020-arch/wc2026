import { useEffect, useMemo, useReducer, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import ScoreInput from '../components/ScoreInput.jsx';
import { formatKickoff } from '../lib/scoring.js';

const STEPS = [
  'Your Info',
  'Award Picks',
  'Group Stage',
  'Review',
];

const initial = {
  step: 0,
  info: { discord: '', wallet_address: '' },
  awards: {
    golden_boot: '',
    top_assister: '',
    golden_glove: '',
    best_young: '',
    player_tournament: '',
  },
  scores: {}, // { [matchId]: { pred_home, pred_away } }
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
    default:
      return state;
  }
}

export default function Submit() {
  const [matches, setMatches] = useState(null);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [state, dispatch] = useReducer(reducer, initial);
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
        <Link to="/bracket" className="text-nebula hover:text-helix underline">
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
        <p className="text-cloud/70 text-sm mb-6">
          We'll open knockout-round predictions once the group stage is complete and the draw is set.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            to="/leaderboard"
            className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded"
          >
            View leaderboard
          </Link>
          <Link
            to="/bracket"
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
      if (!discord.trim()) return setError('Discord username is required');
      if (discord.length > 50) return setError('Discord must be 50 chars or fewer');
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
      for (const [k, v] of Object.entries(state.awards)) {
        if (!v.trim()) return setError(`Please fill in: ${k.replace(/_/g, ' ')}`);
      }
    }
    if (step === 2) {
      for (const m of openMatches) {
        const s = state.scores[m.id];
        if (!s || s.pred_home === '' || s.pred_away === '' || s.pred_home == null || s.pred_away == null) {
          return setError(`Fill in the score for match #${m.match_num}: ${m.home_team} vs ${m.away_team}`);
        }
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
      });
      setSuccess(true);
    } catch (e) {
      setError(e.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-xs uppercase tracking-[0.2em] text-steel font-medium mb-2">
        Jupiter Community Predictor Challenge
      </div>
      <h1 className="font-display text-3xl font-extrabold text-cloud mb-1">Submit your bracket</h1>
      <div className="text-sm text-steel mb-5">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </div>

      <div className="w-full bg-charcoal rounded-full h-2 mb-6 overflow-hidden">
        <div
          className="h-2 bg-jupiter-gradient rounded-full transition-all"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="bg-meteorite border border-charcoal rounded-xl p-5 mb-4">
        {step === 0 && <YourInfo state={state} dispatch={dispatch} />}
        {step === 1 && <Awards state={state} dispatch={dispatch} />}
        {step === 2 && <GroupStageStep matches={openMatches} state={state} dispatch={dispatch} />}
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
        <button
          onClick={back}
          disabled={step === 0}
          className="px-4 py-2 rounded bg-meteorite border border-charcoal text-cloud disabled:opacity-40 font-medium"
        >
          ← Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={next}
            className="px-4 py-2 rounded bg-jupiter-gradient text-space font-display font-bold"
          >
            Next →
          </button>
        ) : (
          <button
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
      <Field label="Discord username">
        <input
          value={state.info.discord}
          maxLength={50}
          onChange={(e) => dispatch({ type: 'setInfo', patch: { discord: e.target.value } })}
          placeholder="Ronaldo99#1234"
          className={inputCls}
        />
      </Field>
      <Field label="Solana wallet address">
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
          <a className="text-nebula hover:text-helix underline" href="https://jup.ag/predict" target="_blank" rel="noreferrer">
            Jupiter Predict
          </a>
          . We'll verify on submit.
        </div>
      </Field>
    </div>
  );
}

function Awards({ state, dispatch }) {
  const fields = [
    { key: 'golden_boot', label: 'Golden Boot', pts: 25 },
    { key: 'top_assister', label: 'Top Assister', pts: 20 },
    { key: 'golden_glove', label: 'Golden Glove', pts: 15 },
    { key: 'best_young', label: 'Best Young Player', pts: 15 },
    { key: 'player_tournament', label: 'Player of the Tournament', pts: 20 },
  ];
  return (
    <div className="space-y-3">
      <h2 className="font-display font-bold text-cloud">Player award picks</h2>
      <p className="text-xs bg-cosmic/10 border border-cosmic/30 text-cosmic rounded px-3 py-2">
        These picks are <b>locked for the full tournament</b>. You cannot change them after submitting.
      </p>
      {fields.map((f) => (
        <Field key={f.key} label={`${f.label} (${f.pts} pts)`}>
          <input
            value={state.awards[f.key]}
            onChange={(e) => dispatch({ type: 'setAward', key: f.key, value: e.target.value })}
            className={inputCls}
          />
        </Field>
      ))}
    </div>
  );
}

function GroupStageStep({ matches, state, dispatch }) {
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

  return (
    <div>
      <h2 className="font-display font-bold text-cloud mb-1">Group Stage predictions</h2>
      <p className="text-xs text-cloud/70 mb-3">
        {matches.length} matches across {groups.length} groups · 3 pts exact · 1 pt correct result.
      </p>
      <p className="text-xs bg-nebula/10 border border-nebula/30 text-nebula rounded px-3 py-2 mb-3">
        Knockout-round predictions (R32 onward) will be collected separately after the group stage,
        once the draw is set. No "TBD vs TBD" guessing.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {groups.map((g) => (
          <div key={g} className="border border-charcoal rounded-lg p-3 bg-charcoal/40">
            <div className="font-display font-bold text-cloud mb-1">Group {g}</div>
            {byGroup[g].map((m) => (
              <MatchScoreRow key={m.id} match={m} state={state} dispatch={dispatch} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchScoreRow({ match, state, dispatch }) {
  const s = state.scores[match.id];
  return (
    <div className="border-b last:border-b-0 border-charcoal/60 py-1">
      <div className="text-[10px] text-steel">
        #{match.match_num} · {formatKickoff(match.kickoff_utc)}
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
          <div className="text-cloud/80">Top Assister: <b className="text-cloud">{state.awards.top_assister}</b></div>
          <div className="text-cloud/80">Golden Glove: <b className="text-cloud">{state.awards.golden_glove}</b></div>
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
              <div key={m.id} className="flex justify-between border-b border-charcoal/60 py-0.5">
                <span className="text-cloud/80">#{m.match_num} {m.home_team} vs {m.away_team}</span>
                <span className="font-mono text-cloud">{s?.pred_home ?? '?'}–{s?.pred_away ?? '?'}</span>
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
          I confirm this is my only entry, my wallet has interacted with Jupiter Predict, and I am
          eligible to participate.
        </span>
      </label>
    </div>
  );
}

const inputCls =
  'w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud placeholder:text-steel focus:border-nebula focus:outline-none';

function Field({ label, children }) {
  return (
    <label className="block text-sm">
      <div className="text-cloud/80 mb-1">{label}</div>
      {children}
    </label>
  );
}
