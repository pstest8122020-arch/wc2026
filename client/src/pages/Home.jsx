import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-[0.2em] text-steel font-medium mb-3">
          Jupiter Community Predictor Challenge
        </div>
        <h1 className="font-display text-5xl font-extrabold mb-4 leading-tight">
          <span className="bg-jupiter-gradient bg-clip-text text-transparent">WC 2026</span>
          <span className="text-cloud"> bracket pool</span>
        </h1>
        <p className="text-cloud/80 text-lg max-w-2xl">
          Predict every result of the tournament, lock in your award picks, and call
          first scorers + MOTM before each match. 50 winners. $2,000 prize pool.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-10">
        <Link
          to="/submit"
          className="block bg-jupiter-gradient text-space font-display font-bold px-5 py-4 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.01] transition"
        >
          Submit your bracket →
        </Link>
        <Link
          to="/bracket"
          className="block bg-meteorite border border-charcoal hover:border-nebula text-cloud font-display font-bold px-5 py-4 rounded-xl transition"
        >
          View live bracket →
        </Link>
      </div>

      <section className="bg-meteorite border border-charcoal rounded-xl p-5 mb-4">
        <h2 className="font-display font-bold text-cloud mb-3">How scoring works</h2>
        <ul className="text-sm text-cloud/80 space-y-1.5">
          <li>· <b className="text-helix">3 pts</b> exact score · <b className="text-helix">1 pt</b> correct result (W/D/L)</li>
          <li>· <b className="text-cosmic">Double points</b> from Round of 16 onward</li>
          <li>· <b className="text-helix">6 pts</b> first goalscorer · <b className="text-helix">2 pts</b> any scorer · <b className="text-helix">4 pts</b> assist · <b className="text-helix">4 pts</b> MOTM</li>
          <li>· Awards: Golden Boot (25), Top Assister (20), Golden Glove (15), Best Young (15), Player of Tournament (20)</li>
        </ul>
      </section>

      <section className="bg-meteorite border border-charcoal rounded-xl p-5 mb-4">
        <h2 className="font-display font-bold text-cloud mb-3">Eligibility</h2>
        <p className="text-sm text-cloud/80">
          Open to wallets that have interacted with{' '}
          <a className="text-nebula hover:text-helix underline" href="https://jup.ag/predict" target="_blank" rel="noreferrer">
            Jupiter Predict
          </a>
          . Your Solana wallet address is required at submission for verification and payout.
        </p>
      </section>

      <section className="bg-meteorite border border-charcoal rounded-xl p-5">
        <h2 className="font-display font-bold text-cloud mb-3">Prize pool</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-sm">
          <Prize rank="1st" amount="$500" />
          <Prize rank="2nd" amount="$250" />
          <Prize rank="3rd" amount="$150" />
          <Prize rank="4–10" amount="$50" />
          <Prize rank="11–25" amount="$25" />
          <Prize rank="26–50" amount="$15" />
        </div>
      </section>
    </div>
  );
}

function Prize({ rank, amount }) {
  return (
    <div className="bg-charcoal border border-gunmetal rounded-lg p-2 text-center">
      <div className="font-medium text-steel text-xs">{rank}</div>
      <div className="text-helix font-display font-bold">{amount}</div>
    </div>
  );
}
