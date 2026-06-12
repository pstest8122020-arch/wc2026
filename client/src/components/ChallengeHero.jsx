// Homepage banner: the challenge name leads big, with the two prize numbers as
// full-width blocks beneath it. Kept clean (no status pill) so the interactive
// bracket below is the focus.
export default function ChallengeHero() {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-charcoal mb-6"
      style={{ background: 'linear-gradient(135deg, #0C0C0C 0%, #0E1413 55%, #0C0C0C 100%)' }}
    >
      {/* soft brand glow */}
      <div
        className="pointer-events-none absolute -right-20 -top-16 w-96 h-96 rounded-full hidden sm:block"
        style={{ background: 'radial-gradient(circle, rgba(0,182,231,0.14) 0%, rgba(164,215,86,0.08) 45%, rgba(0,0,0,0) 70%)' }}
      />

      <div className="relative p-5 sm:p-7">
        <div className="text-[10px] sm:text-xs uppercase tracking-[0.2em] font-bold text-cosmic mb-2.5">
          Jupiter Community Predictor Challenge
        </div>

        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.03] mb-5 sm:mb-6 text-balance">
          <span className="bg-jupiter-gradient bg-clip-text text-transparent whitespace-nowrap">WC 2026</span>{' '}
          <span className="text-cloud whitespace-nowrap">bracket pool</span>
        </h1>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-cosmic/40 bg-cosmic/5 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="font-display font-black text-2xl sm:text-3xl leading-none text-cloud">$2,000</div>
            <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] font-bold text-cosmic mt-1.5">
              Prize pool
            </div>
            <div className="text-xs text-cloud/55 mt-1.5 leading-snug">$500 for 1st place, paid down to the top 50.</div>
          </div>
          <div className="rounded-xl border border-nebula/40 bg-nebula/5 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="font-display font-black text-2xl sm:text-3xl leading-none bg-jupiter-gradient bg-clip-text text-transparent">
              $10,000
            </div>
            <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] font-bold text-nebula mt-1.5">
              Perfect bracket
            </div>
            <div className="text-xs text-cloud/55 mt-1.5 leading-snug">Call every pick right — bonus split between the winners.</div>
          </div>
        </div>
      </div>
    </section>
  );
}
