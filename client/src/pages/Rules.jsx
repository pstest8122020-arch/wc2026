import { Link } from 'react-router-dom';

// Rules & prizes. Prizes lead (top), then the two ways to play, then a clearly
// grouped scoring breakdown so it's obvious which points come from the bracket,
// from match picks, and from awards.
export default function Rules() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10 space-y-6">
      {/* Hero — title only */}
      <section
        className="relative overflow-hidden rounded-2xl border border-charcoal"
        style={{ background: 'linear-gradient(135deg, #0C0C0C 0%, #0E1413 55%, #0C0C0C 100%)' }}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-12 w-80 h-80 rounded-full hidden sm:block"
          style={{ background: 'radial-gradient(circle, rgba(0,182,231,0.16) 0%, rgba(164,215,86,0.09) 45%, rgba(0,0,0,0) 70%)' }}
        />
        <div className="relative p-5 sm:p-7">
          <div className="text-[10px] sm:text-xs uppercase tracking-[0.2em] font-bold text-cosmic mb-2.5">
            Jupiter Community Predictor Challenge
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-black leading-[1.04] mb-2">
            <span className="bg-jupiter-gradient bg-clip-text text-transparent">Rules</span>{' '}
            <span className="text-cloud">&amp; prizes</span>
          </h1>
          <p className="text-cloud/75 text-sm sm:text-base max-w-2xl">
            Build one World Cup 2026 bracket and predict matches all tournament. Free to enter — log
            in with Discord to submit.
          </p>
        </div>
      </section>

      {/* PRIZES — top */}
      <section className="bg-meteorite border border-charcoal rounded-2xl p-5 sm:p-6">
        <h2 className="font-display font-bold text-cloud text-lg mb-4">Prize pool</h2>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div className="rounded-xl border border-cosmic/40 bg-cosmic/5 px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-cosmic">Base pool</div>
              <div className="text-cloud/60 text-xs mt-1">Top 50 on the final leaderboard</div>
            </div>
            <div className="font-display font-black text-3xl sm:text-4xl text-cloud leading-none">$2,000</div>
          </div>
          <div className="rounded-xl border border-nebula/40 bg-nebula/5 px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-nebula">Perfect bracket</div>
              <div className="text-cloud/60 text-xs mt-1">Call it all — split between winners</div>
            </div>
            <div className="font-display font-black text-3xl sm:text-4xl bg-jupiter-gradient bg-clip-text text-transparent leading-none">
              $10,000
            </div>
          </div>
        </div>

        <div className="text-xs text-cloud/65 mb-5">
          <b className="text-cloud">Perfect bracket</b> = predict every group&apos;s final 1st–4th rank
          <span className="text-cloud/65"> and</span> every knockout result correctly, Round of 32 through the Final.
        </div>

        <div className="text-[10px] uppercase tracking-[0.18em] text-steel font-bold mb-2">By final leaderboard rank</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <Tier rank="1st" amount="$500" top />
          <Tier rank="2nd" amount="$250" top />
          <Tier rank="3rd" amount="$150" top />
          <Tier rank="4–10" amount="$50" />
          <Tier rank="11–25" amount="$25" />
          <Tier rank="26–50" amount="$15" />
        </div>
        <div className="text-xs text-cloud/60 mt-3">
          Prize eligibility is verified against{' '}
          <a className="text-nebula hover:text-helix underline" href="https://jup.ag/prediction/world-cup" target="_blank" rel="noreferrer" data-track-event="rules">
            Jupiter Prediction Markets
          </a>{' '}
          activity.
        </div>
      </section>

      {/* Two ways to play */}
      <div className="grid md:grid-cols-2 gap-4">
        <Track n="1" title="Build your bracket" accent="cosmic">
          <li>Set every group&apos;s <b className="text-cloud">1st–4th finish</b> and pick the 8 best third-placed teams.</li>
          <li>Tap through the knockouts — <b className="text-cloud">Round of 32 to the Final</b>.</li>
          <li>One bracket per account. <span className="text-cosmic">Locks at the first kickoff.</span></li>
        </Track>
        <Track n="2" title="Match picks" accent="nebula">
          <li>Predict the <b className="text-cloud">final score</b> of any match, plus the first scorer, assist &amp; MOTM.</li>
          <li>Play all tournament — miss the bracket and you can <b className="text-cloud">still climb the board</b>.</li>
          <li><span className="text-nebula">Each match locks 15 minutes before kickoff.</span></li>
        </Track>
      </div>

      {/* Scoring — grouped so it's obvious where points come from */}
      <section className="bg-meteorite border border-charcoal rounded-2xl p-5 sm:p-6">
        <h2 className="font-display font-bold text-cloud text-lg mb-1">Scoring</h2>
        <p className="text-sm text-cloud/60 mb-5">Everything adds to one combined leaderboard.</p>

        <ScoreGroup title="Match picks · per game" accent="nebula">
          <Row label="Correct scoreline (exact)" pts="3" note="×2 in knockout rounds (R16+)" />
          <Row label="Correct result — win / draw / loss" pts="1" note="×2 in knockout rounds (R16+)" />
          <Row label="First goalscorer — exact" pts="6" />
          <Row label="First goalscorer — any scorer in the game" pts="2" />
          <Row label="Assist" pts="4" />
          <Row label="Man of the Match" pts="4" />
        </ScoreGroup>

        <ScoreGroup title="Your bracket · scored after the tournament" accent="cosmic">
          <Row label="Correct group finish — each position (1st / 2nd / 3rd / 4th)" pts="2" note="Up to 8 per group" />
          <Row label="Each of the 8 best third-placed teams you call right" pts="1" />
          <Row label="Knockout winner — Round of 32" pts="1" note="Knockout points double each round →" />
          <Row label="Knockout winner — Round of 16" pts="2" />
          <Row label="Knockout winner — Quarter-final" pts="4" />
          <Row label="Knockout winner — Semi-final" pts="8" />
          <Row label="Champion — wins the Final" pts="16" />
          <Row label="3rd-place playoff winner" pts="8" />
        </ScoreGroup>

        <ScoreGroup title="Tournament awards" accent="helix" last>
          <Row label="Golden Ball" pts="25" />
          <Row label="Golden Boot" pts="20" />
          <Row label="FIFA Young Player Award" pts="15" />
        </ScoreGroup>
      </section>

    </div>
  );
}

function Track({ n, title, accent, children }) {
  const ring = accent === 'nebula' ? 'border-nebula/30' : 'border-cosmic/30';
  const badge = accent === 'nebula' ? 'bg-nebula/15 text-nebula' : 'bg-cosmic/15 text-cosmic';
  return (
    <section className={`bg-meteorite border ${ring} rounded-2xl p-5 sm:p-6`}>
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`shrink-0 w-7 h-7 rounded-lg ${badge} font-display font-black flex items-center justify-center`}>{n}</span>
        <h2 className="font-display font-bold text-cloud text-lg">{title}</h2>
      </div>
      <ul className="text-sm text-cloud/75 space-y-2 list-disc pl-5 marker:text-steel">{children}</ul>
    </section>
  );
}

const ACCENT_TEXT = { nebula: 'text-nebula', cosmic: 'text-cosmic', helix: 'text-helix' };

function ScoreGroup({ title, accent, last, children }) {
  return (
    <div className={last ? '' : 'mb-5'}>
      <div className={`text-[10px] uppercase tracking-[0.18em] font-bold mb-2.5 ${ACCENT_TEXT[accent]}`}>{title}</div>
      <div className="rounded-xl border border-charcoal divide-y divide-charcoal overflow-hidden">{children}</div>
    </div>
  );
}

function Row({ label, pts, note }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 bg-charcoal/30">
      <span className="shrink-0 w-9 text-center font-display font-black text-lg text-helix leading-none">{pts}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-cloud leading-snug">{label}</div>
        {note && <div className="text-xs text-cloud/45 mt-0.5">{note}</div>}
      </div>
    </div>
  );
}

function Tier({ rank, amount, top }) {
  return (
    <div className={`rounded-lg p-2.5 text-center border ${top ? 'border-cosmic/40 bg-cosmic/5' : 'border-gunmetal bg-charcoal'}`}>
      <div className="font-medium text-steel text-xs">{rank}</div>
      <div className={`font-display font-black ${top ? 'text-cosmic' : 'text-helix'}`}>{amount}</div>
    </div>
  );
}
