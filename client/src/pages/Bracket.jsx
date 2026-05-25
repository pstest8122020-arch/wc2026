import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import MatchCard from '../components/MatchCard.jsx';
import { useSocket } from '../hooks/useSocket.js';

const TABS = [
  { key: 'group', label: 'Groups' },
  { key: 'r32', label: 'R32' },
  { key: 'r16', label: 'R16' },
  { key: 'qf', label: 'QF' },
  { key: 'sf', label: 'SF' },
  { key: 'final', label: 'Final' },
];

// Returns true once every Group Stage match is FINISHED.
// Until then, knockout rounds remain hidden because they show TBD vs TBD.
function groupStageComplete(groupStage) {
  let total = 0;
  let finished = 0;
  for (const g of Object.keys(groupStage)) {
    for (const m of groupStage[g]) {
      total++;
      if (m.status === 'FINISHED') finished++;
    }
  }
  return total > 0 && finished === total;
}

// Returns true once at least one match in the round has real team names (not TBD).
function roundHasRealTeams(matches) {
  return matches.some((m) => m.home_team !== 'TBD' && m.away_team !== 'TBD');
}

export default function Bracket() {
  const [bracket, setBracket] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('group');

  useEffect(() => {
    api.bracket().then(setBracket).catch((e) => setError(e.message));
  }, []);

  useSocket({
    'match:updated': (m) => {
      setBracket((prev) => {
        if (!prev) return prev;
        const next = JSON.parse(JSON.stringify(prev));
        applyMatchUpdate(next, m);
        return next;
      });
    },
  });

  if (error) return <div className="max-w-2xl mx-auto p-6 text-trifid">{error}</div>;
  if (!bracket) return <div className="max-w-2xl mx-auto p-6 text-steel">Loading bracket…</div>;

  const groupLetters = Object.keys(bracket.groupStage).sort();
  const groupsDone = groupStageComplete(bracket.groupStage);

  const visibleRounds = {
    roundOf32: groupsDone || roundHasRealTeams(bracket.roundOf32),
    roundOf16: roundHasRealTeams(bracket.roundOf16),
    quarterfinals: roundHasRealTeams(bracket.quarterfinals),
    semifinals: roundHasRealTeams(bracket.semifinals),
    thirdPlace: roundHasRealTeams(bracket.thirdPlace),
    final: roundHasRealTeams(bracket.final),
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-extrabold text-cloud">Live Bracket</h1>
        <div className="text-xs text-steel">Times in UTC · {countMatches(bracket)} matches</div>
      </div>

      {!groupsDone && (
        <div className="mb-4 bg-meteorite border border-nebula/40 rounded-lg px-4 py-2 text-sm text-cloud/80">
          <span className="text-nebula font-semibold">Group stage in progress.</span>{' '}
          Knockout matchups will appear here as soon as the group stage is complete.
        </div>
      )}

      {/* Mobile tabs */}
      <div className="md:hidden mb-3 -mx-4 px-4 overflow-x-auto bracket-scroll">
        <div className="flex gap-1 min-w-max">
          {TABS.map((t) => {
            const enabled =
              t.key === 'group' ||
              (t.key === 'r32' && visibleRounds.roundOf32) ||
              (t.key === 'r16' && visibleRounds.roundOf16) ||
              (t.key === 'qf' && visibleRounds.quarterfinals) ||
              (t.key === 'sf' && visibleRounds.semifinals) ||
              (t.key === 'final' && (visibleRounds.thirdPlace || visibleRounds.final));
            return (
              <button
                key={t.key}
                onClick={() => enabled && setActiveTab(t.key)}
                disabled={!enabled}
                className={`px-3 py-1.5 text-sm rounded whitespace-nowrap font-medium ${
                  activeTab === t.key && enabled
                    ? 'bg-nebula text-space'
                    : enabled
                      ? 'bg-meteorite border border-charcoal text-cloud'
                      : 'bg-meteorite border border-charcoal text-steel opacity-40 cursor-not-allowed'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile: single column */}
      <div className="md:hidden">
        {activeTab === 'group' && <GroupGrid groupStage={bracket.groupStage} letters={groupLetters} />}
        {activeTab === 'r32' && visibleRounds.roundOf32 && (
          <RoundColumn title="Round of 32" matches={bracket.roundOf32} />
        )}
        {activeTab === 'r16' && visibleRounds.roundOf16 && (
          <RoundColumn title="Round of 16" matches={bracket.roundOf16} double />
        )}
        {activeTab === 'qf' && visibleRounds.quarterfinals && (
          <RoundColumn title="Quarterfinals" matches={bracket.quarterfinals} double />
        )}
        {activeTab === 'sf' && visibleRounds.semifinals && (
          <RoundColumn title="Semifinals" matches={bracket.semifinals} double />
        )}
        {activeTab === 'final' && (visibleRounds.thirdPlace || visibleRounds.final) && (
          <>
            {visibleRounds.thirdPlace && (
              <RoundColumn title="3rd Place" matches={bracket.thirdPlace} double />
            )}
            {visibleRounds.final && (
              <RoundColumn title="Final" matches={bracket.final} double />
            )}
          </>
        )}
      </div>

      {/* Desktop: full horizontal bracket */}
      <div className="hidden md:block overflow-x-auto bracket-scroll">
        <div className="flex gap-4 min-w-max pb-4">
          <div className="w-[640px] shrink-0">
            <h2 className="font-display font-bold text-cloud mb-2">Group Stage</h2>
            <GroupGrid groupStage={bracket.groupStage} letters={groupLetters} compact />
          </div>
          {visibleRounds.roundOf32 && <RoundColumn title="Round of 32" matches={bracket.roundOf32} />}
          {visibleRounds.roundOf16 && <RoundColumn title="Round of 16" matches={bracket.roundOf16} double />}
          {visibleRounds.quarterfinals && <RoundColumn title="Quarterfinals" matches={bracket.quarterfinals} double />}
          {visibleRounds.semifinals && <RoundColumn title="Semifinals" matches={bracket.semifinals} double />}
          {(visibleRounds.thirdPlace || visibleRounds.final) && (
            <div className="w-72 shrink-0 space-y-6">
              {visibleRounds.thirdPlace && (
                <RoundColumn title="3rd Place" matches={bracket.thirdPlace} double inline />
              )}
              {visibleRounds.final && (
                <RoundColumn title="Final" matches={bracket.final} double inline />
              )}
            </div>
          )}
        </div>
      </div>

      <Legend />
    </div>
  );
}

function GroupGrid({ groupStage, letters, compact }) {
  return (
    <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'} gap-3`}>
      {letters.map((g) => (
        <div key={g} className="border border-charcoal rounded-lg p-2 bg-meteorite">
          <div className="font-display font-bold text-cloud mb-1 text-sm">Group {g}</div>
          <div className="flex flex-col gap-1.5">
            {groupStage[g].map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoundColumn({ title, matches, double, inline }) {
  return (
    <section className={inline ? '' : 'w-72 shrink-0'}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-display font-bold text-cloud">{title}</h2>
        {double && <span className="text-[10px] text-cosmic font-bold">2x</span>}
      </div>
      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div className="mt-8 bg-meteorite border border-charcoal rounded-xl p-3 text-xs text-cloud/70 flex flex-wrap gap-4 items-center">
      <span><span className="inline-block w-3 h-3 bg-meteorite border border-charcoal mr-1 align-middle" />Scheduled</span>
      <span><span className="inline-block w-3 h-3 bg-meteorite border border-nebula mr-1 align-middle" />Live</span>
      <span><span className="inline-block w-3 h-3 bg-trifid/10 border border-trifid mr-1 align-middle" />Exact (your pick)</span>
      <span><span className="inline-block w-3 h-3 bg-helix/10 border border-helix mr-1 align-middle" />Result correct</span>
      <span><span className="inline-block w-3 h-3 bg-charcoal border border-gunmetal mr-1 align-middle" />Wrong</span>
    </div>
  );
}

function countMatches(bracket) {
  let n = 0;
  for (const g of Object.keys(bracket.groupStage)) n += bracket.groupStage[g].length;
  n += bracket.roundOf32.length + bracket.roundOf16.length + bracket.quarterfinals.length;
  n += bracket.semifinals.length + bracket.thirdPlace.length + bracket.final.length;
  return n;
}

function applyMatchUpdate(bracket, updated) {
  const buckets = [
    'roundOf32',
    'roundOf16',
    'quarterfinals',
    'semifinals',
    'thirdPlace',
    'final',
  ];
  for (const b of buckets) {
    const idx = bracket[b].findIndex((m) => m.id === updated.id);
    if (idx >= 0) {
      bracket[b][idx] = { ...bracket[b][idx], ...updated };
      return;
    }
  }
  for (const g of Object.keys(bracket.groupStage)) {
    const idx = bracket.groupStage[g].findIndex((m) => m.id === updated.id);
    if (idx >= 0) {
      bracket.groupStage[g][idx] = { ...bracket.groupStage[g][idx], ...updated };
      return;
    }
  }
}
