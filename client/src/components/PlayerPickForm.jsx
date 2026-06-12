import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import PlayerAutocomplete from './PlayerAutocomplete.jsx';
import PlayerPickerModal, { norm } from './PlayerPickerModal.jsx';
import ScoreInput from './ScoreInput.jsx';
import { flagImgUrl } from '../lib/flags.js';

// Full-roster cache per match (teams pair). The squad list is static for the
// session — no point re-fetching when the user flips between matches.
const squadsCache = new Map();

function useSquads(teams) {
  const key = (teams || []).filter(Boolean).join(',');
  const [squads, setSquads] = useState(() => squadsCache.get(key) || null);
  useEffect(() => {
    if (!key) return undefined;
    // Drop the previous pair's rosters immediately — never offer the wrong
    // match's players while the new fetch is in flight.
    setSquads(squadsCache.get(key) || null);
    if (squadsCache.has(key)) return undefined;
    let cancelled = false;
    api
      .squads(teams)
      .then((r) => {
        const t = r?.teams || [];
        // Cache only real rosters: a cold index / upstream hiccup returns 200 with
        // empty squads, and pinning that would lock the match into the type-ahead
        // fallback for the whole session.
        if (t.some((s) => (s.players || []).length > 0)) squadsCache.set(key, t);
        if (!cancelled) setSquads(t);
      })
      .catch(() => {
        if (!cancelled) setSquads([]); // empty → fields fall back to autocomplete
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return squads;
}

export default function PlayerPickForm({ onSubmit, initial = {}, requireDiscord = true, requireWallet = false, disabled, teams }) {
  const [discord, setDiscord] = useState(initial.discord || '');
  const [wallet, setWallet] = useState(initial.wallet || '');
  const [predHome, setPredHome] = useState(initial.pred_home ?? '');
  const [predAway, setPredAway] = useState(initial.pred_away ?? '');
  const [first_scorer, setFirstScorer] = useState(initial.first_scorer || '');
  const [assist_player, setAssistPlayer] = useState(initial.assist_player || '');
  const [motm, setMotm] = useState(initial.motm || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Which field the picker modal is open for: null | 'scorer' | 'assist' | 'motm'
  const [picking, setPicking] = useState(null);

  const squads = useSquads(teams);
  // Tap-to-pick needs at least one real roster; otherwise keep the type-ahead.
  const pickerReady = Array.isArray(squads) && squads.some((s) => (s.players || []).length > 0);

  // Score drives the 0–0 lock live: predict 0–0 and there's no scorer/assist.
  const scoreEntered = predHome !== '' && predAway !== '';
  const goalless = predHome === 0 && predAway === 0;

  const fields = {
    scorer: { label: 'First goalscorer', value: first_scorer, set: setFirstScorer },
    assist: { label: 'Assist', value: assist_player, set: setAssistPlayer },
    motm: { label: 'Man of the Match', value: motm, set: setMotm },
  };

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (requireDiscord && !discord.trim()) return setError('Username is required');
    if (requireDiscord || requireWallet) {
      if (!wallet.trim()) return setError('Enter your Solana wallet to make your picks count.');
      if (requireWallet && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet.trim())) {
        return setError('That does not look like a valid Solana wallet address.');
      }
    }
    if (!scoreEntered) return setError('Enter your predicted score for both teams');
    if (!motm.trim()) return setError('Man of the Match is required');
    if (!goalless && (!first_scorer.trim() || !assist_player.trim())) {
      return setError('First scorer and assist are required');
    }
    setBusy(true);
    try {
      await onSubmit({
        ...(requireDiscord ? { discord: discord.trim() } : {}),
        // Send the wallet whenever the form collected one. requireWallet (logged-in,
        // no wallet on file) used to validate the field and then DROP it from the
        // payload — the server 403'd asking for the wallet the user just typed.
        ...((requireDiscord || requireWallet) && wallet.trim()
          ? { wallet_address: wallet.trim() }
          : {}),
        pred_home: Number(predHome),
        pred_away: Number(predAway),
        first_scorer: goalless ? '' : first_scorer.trim(),
        assist_player: goalless ? '' : assist_player.trim(),
        motm: motm.trim(),
      });
    } catch (e) {
      setError(e.message || 'Submission failed');
    } finally {
      setBusy(false);
    }
  }

  // One input style per pathway: picker button when rosters loaded, type-ahead
  // fallback when not (feed down / unknown team names).
  function playerField(key) {
    const f = fields[key];
    if (pickerReady) {
      return (
        <PickerButton
          value={f.value}
          squads={squads}
          disabled={disabled}
          onOpen={() => setPicking(key)}
          onClear={() => f.set('')}
        />
      );
    }
    return (
      <PlayerAutocomplete
        value={f.value}
        onChange={f.set}
        teams={teams}
        disabled={disabled}
        className="w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud focus:border-nebula focus:outline-none"
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {requireDiscord && (
        <Field label="Username">
          <input
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            disabled={disabled}
            className="w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud focus:border-nebula focus:outline-none"
            placeholder="e.g. @ronaldo99"
          />
        </Field>
      )}
      {(requireDiscord || requireWallet) && (
        <Field
          label={
            requireWallet
              ? 'Solana wallet — entered once to enter the challenge'
              : 'Solana wallet (must match your bracket submission)'
          }
        >
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            placeholder={requireWallet ? 'Your Solana wallet address' : undefined}
            className="w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud font-mono text-sm focus:border-nebula focus:outline-none"
          />
        </Field>
      )}
      <Field label="Predicted final score (3 pts exact · 1 pt correct result)">
        <ScoreInput
          homeTeam={teams[0]}
          awayTeam={teams[1]}
          homeValue={predHome}
          awayValue={predAway}
          onChange={({ home, away }) => {
            setPredHome(home);
            setPredAway(away);
          }}
          disabled={disabled}
        />
      </Field>
      <Field plain={pickerReady} label="First goalscorer (6 pts exact · 2 pts any scorer)">
        {goalless ? (
          <LockedField text="Locked — you predicted 0–0 (no goals to score)." />
        ) : (
          playerField('scorer')
        )}
      </Field>
      <Field plain={pickerReady} label="Assist (4 pts)">
        {goalless ? (
          <LockedField text="Locked — you predicted 0–0 (no assists)." />
        ) : (
          playerField('assist')
        )}
      </Field>
      <Field plain={pickerReady} label="Man of the Match (4 pts)">{playerField('motm')}</Field>
      {error && <div className="text-sm text-trifid">{error}</div>}
      <button
        type="submit"
        disabled={disabled || busy}
        className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save picks'}
      </button>

      {picking && (
        <PlayerPickerModal
          title={fields[picking].label}
          squads={squads}
          value={fields[picking].value}
          onSelect={(name) => {
            fields[picking].set(name);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </form>
  );
}

// Input-shaped button that opens the picker. The clear (×) sits OUTSIDE the
// button element — nested interactive elements are invalid HTML.
function PickerButton({ value, squads, disabled, onOpen, onClear }) {
  // Diacritic-insensitive like the modal's selected-row check, so a pick saved
  // as free text ("Gimenez") still gets its flag next to "Giménez".
  const team = value
    ? (squads || []).find((s) =>
        (s.players || []).some((p) => norm(p.name) === norm(value)),
      )?.team
    : null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className={`w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-left flex items-center gap-2 focus:border-nebula focus:outline-none transition hover:border-nebula/60 disabled:opacity-50 ${
          value ? 'text-cloud' : 'text-steel'
        }`}
      >
        {team && (
          <img
            src={flagImgUrl(team)}
            alt=""
            className="w-[20px] h-[14px] object-cover rounded-[2px] border border-white/25 shrink-0"
            draggable="false"
          />
        )}
        <span className="flex-1 min-w-0 truncate">{value || 'Tap to choose a player'}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`shrink-0 text-steel ${value ? 'mr-6' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {value && !disabled && (
        <button
          type="button"
          aria-label="Clear selection"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded text-steel hover:text-cloud"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function LockedField({ text }) {
  return (
    <div className="w-full bg-charcoal/40 border border-gunmetal rounded px-3 py-2 text-sm text-steel">
      {text}
    </div>
  );
}

// `plain` renders a <div> instead of <label>: the picker fields put BUTTONS in
// the children, and a label wrapping labelable elements that aren't its control
// is invalid HTML (clicks on the caption would forward to the first button).
function Field({ label, children, plain = false }) {
  const Tag = plain ? 'div' : 'label';
  return (
    <Tag className="block text-sm">
      <div className="text-cloud/80 mb-1">{label}</div>
      {children}
    </Tag>
  );
}
