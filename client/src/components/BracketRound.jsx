import MatchCard from './MatchCard.jsx';

export default function BracketRound({ title, matches, predictionsByMatchId, multiplierNote }) {
  return (
    <section className="min-w-[260px] w-72 shrink-0">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-bold text-pitch-900">{title}</h2>
        {multiplierNote && <span className="text-[10px] text-pitch-700 font-semibold">2x</span>}
      </div>
      <div className="flex flex-col gap-2">
        {matches.map((m) => {
          const pred = predictionsByMatchId?.[m.id];
          return <MatchCard key={m.id} match={m} prediction={pred} points={pred?.points_earned} />;
        })}
      </div>
    </section>
  );
}
