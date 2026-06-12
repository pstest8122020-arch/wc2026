// Promotes Jupiter Prediction's World Cup Contest (the action that also qualifies a
// participant). Shows the two prize pools and points to the freeroll. Optional `telegram`
// prop adds a "Join the World Cup Lounge" row. All external links open in a new tab —
// no fetch/embed, so no CSP impact.

const WC_MARKETS_URL = 'https://jup.ag/prediction/world-cup';

function TelegramIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.05-1.99 1.93c-.22.22-.4.4-.81.4z" />
    </svg>
  );
}

export default function PredictMarketsCTA({
  headline = 'The World Cup Contest',
  sub = 'Predict 5 World Cup group-stage matches and split the pool with everyone who gets them all right.',
  cta = 'Try the freeroll',
  telegram,
  className = '',
}) {
  return (
    <div className={`bg-jupiter-gradient rounded-2xl p-[1.5px] shadow-lg ${className}`}>
      <div className="bg-space rounded-[15px] px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-cosmic font-bold">
                Jupiter Prediction Markets
              </span>
              <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 border border-helix/45 text-helix bg-helix/10">
                $125,000 in prizes
              </span>
            </div>
            <div className="font-display text-lg sm:text-xl font-black text-cloud leading-tight">{headline}</div>
            <div className="text-cloud/70 text-sm mt-1">{sub}</div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-xs text-cloud/75">
              <span><b className="text-cosmic">Freeroll</b> $25,000 · free entry for all</span>
              <span className="text-gunmetal hidden sm:inline" aria-hidden="true">|</span>
              <span><b className="text-helix">Paid pool</b> $100,000 · $10 / entry, unlimited</span>
            </div>
          </div>
          <a
            href={WC_MARKETS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-2 bg-jupiter-gradient text-space font-display font-bold px-4 py-2.5 rounded-xl whitespace-nowrap hover:opacity-90 transition"
          >
            {cta} ↗
          </a>
        </div>

        {telegram && (
          <div className="mt-4 pt-4 border-t border-charcoal flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-cloud/70 min-w-0">
              Chat World Cup with other players in Jupiter's <b className="text-cloud">World Cup Lounge</b> on Telegram.
            </div>
            <a
              href={telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-2 bg-charcoal border border-gunmetal hover:border-nebula text-cloud font-display font-bold px-4 py-2.5 rounded-xl whitespace-nowrap transition"
            >
              <TelegramIcon />
              Join the World Cup Lounge ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
