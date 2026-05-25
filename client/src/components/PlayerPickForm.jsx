import { useState } from 'react';

export default function PlayerPickForm({ onSubmit, initial = {}, requireDiscord = true, disabled }) {
  const [discord, setDiscord] = useState(initial.discord || '');
  const [first_scorer, setFirstScorer] = useState(initial.first_scorer || '');
  const [assist_player, setAssistPlayer] = useState(initial.assist_player || '');
  const [motm, setMotm] = useState(initial.motm || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (requireDiscord && !discord.trim()) return setError('Discord required');
    if (!first_scorer.trim() || !assist_player.trim() || !motm.trim()) {
      return setError('All three picks are required');
    }
    setBusy(true);
    try {
      await onSubmit({
        discord: discord.trim(),
        first_scorer: first_scorer.trim(),
        assist_player: assist_player.trim(),
        motm: motm.trim(),
      });
    } catch (e) {
      setError(e.message || 'Submission failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {requireDiscord && (
        <Field label="Discord username">
          <input
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            disabled={disabled}
            className="w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud focus:border-nebula focus:outline-none"
            placeholder="Ronaldo99#1234"
          />
        </Field>
      )}
      <Field label="First goalscorer (6 pts exact · 2 pts any scorer)">
        <input
          value={first_scorer}
          onChange={(e) => setFirstScorer(e.target.value)}
          disabled={disabled}
          className="w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud focus:border-nebula focus:outline-none"
        />
      </Field>
      <Field label="Assist (4 pts)">
        <input
          value={assist_player}
          onChange={(e) => setAssistPlayer(e.target.value)}
          disabled={disabled}
          className="w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud focus:border-nebula focus:outline-none"
        />
      </Field>
      <Field label="Man of the Match (4 pts)">
        <input
          value={motm}
          onChange={(e) => setMotm(e.target.value)}
          disabled={disabled}
          className="w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud focus:border-nebula focus:outline-none"
        />
      </Field>
      {error && <div className="text-sm text-trifid">{error}</div>}
      <button
        type="submit"
        disabled={disabled || busy}
        className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save picks'}
      </button>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-sm">
      <div className="text-cloud/80 mb-1">{label}</div>
      {children}
    </label>
  );
}
