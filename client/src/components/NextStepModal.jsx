import { useEffect } from 'react';

// Shown once, right after a user submits their bracket for the first time.
// A plain confirmation — no promos, chips, or outbound links.
export default function NextStepModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-space border border-charcoal rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-charcoal">
          <div className="font-display font-bold text-cloud text-lg">Your bracket is in 🎉</div>
          <button onClick={onClose} className="text-steel hover:text-cloud transition p-1 -mr-1" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5">
          <p className="text-cloud/75 text-sm leading-snug">
            Your picks are saved and locked to your bracket. You can edit them anytime before the
            tournament kicks off.
          </p>
          <button
            onClick={onClose}
            className="mt-5 w-full bg-jupiter-gradient text-space font-display font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
