import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

// Nudge for logged-in users whose SUBMITTED bracket is still incomplete (and not
// yet locked) — driven by bracket_incomplete / bracket_missing on /discord/me.
// Tells them exactly what's left and routes them to the builder to finish.
// Auto-clears once the bracket is complete; dismissible per session so it nudges
// without nagging. Renders nothing for complete / not-submitted / logged-out users.
export default function BracketIncompletePrompt() {
  const auth = useAuth();
  const [dismissed, setDismissed] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('bracketIncompleteDismissed') === '1',
  );
  if (auth.loading || !auth.loggedIn || !auth.bracket_incomplete || dismissed) return null;

  const missing = Array.isArray(auth.bracket_missing) ? auth.bracket_missing : [];
  const left = missing.length ? missing.join(' and ') : 'a few picks';
  const dismiss = () => {
    try {
      sessionStorage.setItem('bracketIncompleteDismissed', '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4">
      <div className="rounded-xl border border-helix/50 bg-helix/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-helix shrink-0 mt-0.5"
            aria-hidden="true"
          >
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <div className="min-w-0">
            <div className="font-display font-bold text-cloud">Your bracket isn&apos;t finished</div>
            <p className="text-sm text-cloud/75 leading-snug mt-0.5">
              You still need to pick <b className="text-cloud">{left}</b>. Brackets lock at the first
              kickoff — an incomplete bracket misses knockout &amp; champion points.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 bg-jupiter-gradient text-space font-display font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition whitespace-nowrap"
          >
            Finish your bracket →
          </Link>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-steel hover:text-cloud transition p-1.5 -mr-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
