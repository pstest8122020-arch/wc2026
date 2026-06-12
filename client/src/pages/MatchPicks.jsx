import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, jupGo } from '../lib/api.js';
import PlayerPickForm from '../components/PlayerPickForm.jsx';
import TeamName from '../components/TeamName.jsx';
import { formatKickoff } from '../lib/scoring.js';
import { getIdentity, setIdentity } from '../lib/identity.js';
import { useJupiterOdds } from '../hooks/useJupiterOdds.js';
import { useAuth, discordLoginUrl } from '../hooks/useAuth.js';
import MatchOdds from '../components/MatchOdds.jsx';
import { MatchBannerCard, MatchHero } from '../components/MatchBanner.jsx';
import ShareImageModal from '../components/ShareImageModal.jsx';
import ShareableMatchPick from '../components/ShareableMatchPick.jsx';

const LOCK_MS = 15 * 60 * 1000;

export default function MatchPicks() {
  const { matchId } = useParams();
  const [matches, setMatches] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [existingPick, setExistingPick] = useState(undefined); // undefined=loading, null=none, obj=saved
  const [myPicksMap, setMyPicksMap] = useState({}); // { [match_id]: pick } for the list view
  const [sharing, setSharing] = useState(false); // share-image modal for the saved match pick
  const [error, setError] = useState('');
  const auth = useAuth();
  const { data: oddsData } = useJupiterOdds();
  const oddsMatches = oddsData?.matches || {};

  useEffect(() => {
    api.matches().then(setMatches).catch((e) => setError(e.message));
  }, []);

  const match = useMemo(() => {
    if (!matches || !matchId) return null;
    return matches.find((m) => m.id === Number(matchId)) || null;
  }, [matches, matchId]);

  const upcoming = useMemo(() => {
    if (!matches) return [];
    // Every pickable match (both teams known). Was capped at 20, which hid most of
    // the 72 group-stage games. Sorted by kickoff; knockout games appear here once
    // their teams are decided (until then they're TBD and filtered out).
    return matches
      .filter((m) => m.status === 'SCHEDULED' && m.home_team !== 'TBD' && m.away_team !== 'TBD')
      .sort((a, b) => (a.kickoff_utc || '').localeCompare(b.kickoff_utc || ''));
  }, [matches]);

  // Switching matches must reset the transient "saved" view and scroll to the
  // form — otherwise the prior match's "Picks saved" state sticks (the team
  // changes but you can't fill it) and the page stays scrolled past the form.
  useEffect(() => {
    setSubmitted(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, [matchId]);

  // Prefill the form with any picks already saved for this match. THE bug was that
  // saved picks were never loaded back, so revisiting a match showed a blank form and
  // looked like the data had been erased (it wasn't — it's all in the DB). Session-based
  // fetch; legacy / logged-out users get no prefill (null).
  useEffect(() => {
    setExistingPick(undefined);
    if (!matchId || auth.loading) return undefined;
    if (!(auth.configured && auth.loggedIn)) {
      setExistingPick(null);
      return undefined;
    }
    let cancelled = false;
    api
      .myMatchPick(matchId)
      .then((p) => {
        if (!cancelled) setExistingPick(p || null);
      })
      .catch(() => {
        if (!cancelled) setExistingPick(null);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, auth.loading, auth.loggedIn, auth.configured]);

  // Load ALL the user's saved picks once, so the upcoming-matches list can show each
  // selection inline (see what you picked before clicking in). Kept fresh after a save
  // via setMyPicksMap in submit() below.
  useEffect(() => {
    if (auth.loading) return undefined;
    if (!(auth.configured && auth.loggedIn)) {
      setMyPicksMap({});
      return undefined;
    }
    let cancelled = false;
    api
      .myPlayerPicks()
      .then((rows) => {
        if (cancelled) return;
        const m = {};
        for (const r of rows || []) m[r.match_id] = r;
        setMyPicksMap(m);
      })
      .catch(() => {
        if (!cancelled) setMyPicksMap({});
      });
    return () => {
      cancelled = true;
    };
  }, [auth.loading, auth.loggedIn, auth.configured]);

  if (error) return <div className="max-w-2xl mx-auto p-6 text-trifid">{error}</div>;
  if (!matches) return <div className="max-w-2xl mx-auto p-6 text-steel">Loading…</div>;

  if (!matchId) {
    // Group the full list by kickoff day (UTC) so 72 cards stay navigable.
    const dayGroups = [];
    for (const m of upcoming) {
      const key = (m.kickoff_utc || '').slice(0, 10);
      const last = dayGroups[dayGroups.length - 1];
      if (!last || last.key !== key) {
        dayGroups.push({ key, label: dayHeader(m.kickoff_utc), matches: [m] });
      } else {
        last.matches.push(m);
      }
    }
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-cosmic/40 bg-cosmic/5 text-cosmic shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 11l3 3 8-8" />
              <path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11" />
            </svg>
          </span>
          <h1 className="font-black italic uppercase tracking-tight text-2xl sm:text-3xl leading-none">
            <span className="text-cloud">Per-match</span>{' '}
            <span className="bg-jupiter-gradient bg-clip-text text-transparent pr-[0.12em]">picks</span>
          </h1>
        </div>
        <p className="text-sm text-cloud/80 mb-6">
          Predict the final score, plus the first scorer, assist, and Man of the Match for each game.
          Picks lock <b className="text-helix">15 minutes</b> before kickoff.
        </p>
        {upcoming.length === 0 ? (
          <UpcomingList matches={[]} odds={oddsMatches} myPicks={myPicksMap} />
        ) : (
          dayGroups.map((g) => (
            <section key={g.key} className="mb-8">
              <h2 className="flex items-center gap-2.5 mb-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-charcoal bg-meteorite text-cosmic shrink-0">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </span>
                <span className="font-black italic uppercase tracking-wide text-cloud text-sm sm:text-base whitespace-nowrap">
                  {g.label}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-cosmic whitespace-nowrap">
                  · {g.matches.length} {g.matches.length === 1 ? 'match' : 'matches'}
                </span>
                <span className="flex-1 border-b border-charcoal/80" aria-hidden="true" />
              </h2>
              <UpcomingList matches={g.matches} odds={oddsMatches} myPicks={myPicksMap} />
            </section>
          ))
        )}
      </div>
    );
  }

  if (!match) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="text-trifid mb-2">Match not found.</div>
        <Link className="text-nebula underline" to="/picks">Back to upcoming matches</Link>
      </div>
    );
  }

  const kickoffMs = match.kickoff_utc ? new Date(match.kickoff_utc).getTime() : null;
  const closed = match.status !== 'SCHEDULED' ||
    (kickoffMs && kickoffMs - Date.now() <= LOCK_MS);

  async function submit(payload) {
    await api.submitPlayerPicks({
      ...payload,
      match_id: match.id,
    });
    // Legacy flow only: remember username+wallet so the next form auto-populates.
    // (Discord-session flow sends no identity in the body.)
    if (payload.discord) setIdentity({ discord: payload.discord, wallet: payload.wallet_address });
    // If this submit carried the one-time wallet, refresh the session so the wallet
    // field never appears again (wallet_on_file flips true).
    if (payload.wallet_address && !auth.wallet_on_file) auth.refresh();
    setSubmitted(payload);
    // The form collapses into the shorter "Picks saved." panel — scroll up so the
    // confirmation is actually visible.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    // Keep the loaded pick in sync so "Edit these picks" re-opens a prefilled form.
    const saved = {
      pred_home: payload.pred_home,
      pred_away: payload.pred_away,
      first_scorer: payload.first_scorer,
      assist_player: payload.assist_player,
      motm: payload.motm,
    };
    setExistingPick(saved);
    // ...and reflect it in the list-view map so it shows inline immediately.
    setMyPicksMap((prev) => ({ ...prev, [match.id]: { match_id: match.id, ...saved } }));
  }

  const remembered = getIdentity();
  // Logged in but no wallet yet → collect it here, once, with the entry disclaimer.
  const needsWallet = auth.configured && auth.loggedIn && !auth.wallet_on_file;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/picks" className="text-sm text-nebula hover:text-helix underline">← All upcoming matches</Link>
      <div className="mb-6 mt-2">
        <MatchHero match={match} odds={oddsMatches[match.id]}>
          {kickoffMs && !closed && <Countdown target={kickoffMs - LOCK_MS} />}
        </MatchHero>
      </div>

      {closed ? (
        <div className="bg-meteorite border border-trifid/40 text-cloud rounded-xl p-4">
          <div className="text-trifid font-semibold">Picks for this match are closed.</div>
          <div className="mt-2 text-sm">
            <Link className="underline text-nebula" to="/picks">See upcoming matches →</Link>
          </div>
        </div>
      ) : submitted ? (
        <div className="bg-meteorite border border-trifid rounded-xl p-4">
          <div className="font-display font-bold text-trifid mb-1">Picks saved.</div>
          <div className="text-sm text-cloud/80">
            Score: <b className="text-cloud">{submitted.pred_home}–{submitted.pred_away}</b>
            {submitted.first_scorer && (
              <> · First scorer: <b className="text-cloud">{submitted.first_scorer}</b></>
            )}
            {submitted.assist_player && (
              <> · Assist: <b className="text-cloud">{submitted.assist_player}</b></>
            )}
            {' '}· MOTM: <b className="text-cloud">{submitted.motm}</b>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setSharing(true)}
              className="inline-flex items-center gap-2 bg-jupiter-gradient text-space font-display font-bold text-sm px-4 py-2 rounded-lg hover:opacity-90 transition"
            >
              Share this pick ↗
            </button>
          </div>
          <div className="mt-3">
            <a
              href={jupGo('back_your_call', oddsMatches[match.id]?.event_url || undefined)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-display font-bold text-cosmic hover:text-helix"
            >
              Back your call → Trade this match on Jupiter ↗
            </a>
          </div>
          <div className="mt-3 text-sm">
            <button
              type="button"
              onClick={() => setSubmitted(null)}
              className="underline text-nebula mr-3"
            >
              Edit these picks
            </button>
            <Link className="underline text-nebula mr-3" to="/">View bracket</Link>
            <Link className="underline text-nebula" to="/picks">Pick another match</Link>
          </div>
        </div>
      ) : auth.loading ? (
        <div className="bg-meteorite border border-charcoal rounded-xl p-4 text-sm text-steel">
          Checking your session…
        </div>
      ) : auth.configured && !auth.loggedIn ? (
        <div className="bg-meteorite border border-charcoal rounded-xl p-6 text-center space-y-3">
          <div className="font-display font-bold text-cloud text-lg">Log in to make your picks</div>
          <div className="text-sm text-cloud/70">
            Match picks attach to your bracket — log in with Discord to predict this game.
          </div>
          <a
            href={discordLoginUrl(`/picks/${match.id}`)}
            className="inline-flex items-center gap-2 text-sm font-display font-bold text-white bg-[#5865F2] hover:bg-[#4752c4] rounded-lg px-4 py-2.5 transition"
          >
            Log in with Discord
          </a>
        </div>
      ) : (
        <div className="relative bg-meteorite border border-charcoal rounded-xl p-4 sm:p-5">
          {/* soccer-themed watermark, clipped to the card so the form's
              autocomplete dropdowns are NOT clipped (they can overflow freely) */}
          <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
            <img
              src="/logo.png"
              alt=""
              aria-hidden="true"
              className="select-none absolute -right-10 -bottom-12 w-48 h-48 opacity-[0.06] -rotate-12"
            />
          </div>
          <div className="relative">
            {auth.loggedIn && (
              <div className="flex items-center gap-2 text-sm text-steel mb-3">
                <span className="inline-block w-2 h-2 rounded-full bg-cosmic" />
                Picking as <b className="text-cloud">@{auth.handle}</b>
              </div>
            )}
            {needsWallet && (
              <div className="mb-4 rounded-lg border border-nebula/40 bg-nebula/5 px-3.5 py-3 text-sm">
                <div className="font-display font-bold text-cloud mb-0.5">One-time entry — add your wallet</div>
                <p className="text-cloud/70 leading-snug">
                  The challenge is open to Jupiter Prediction Markets users. Add your Solana
                  wallet below to make your picks count — it's checked for eligibility and
                  payouts, and you'll only enter it once (it saves to your account).
                </p>
              </div>
            )}
            {existingPick === undefined ? (
              <div className="py-4 text-sm text-steel">Loading your saved picks…</div>
            ) : (
              <>
                {existingPick && (
                  <div className="mb-4 rounded-lg border border-cosmic/40 bg-cosmic/5 px-3.5 py-2.5 text-sm text-cloud/80 flex items-center justify-between gap-3 flex-wrap">
                    <span>
                      <b className="text-cosmic">You&apos;ve already saved picks for this match.</b>{' '}
                      They&apos;re loaded below — change anything and re-save.
                    </span>
                    <button
                      type="button"
                      onClick={() => setSharing(true)}
                      className="shrink-0 inline-flex items-center gap-1.5 bg-charcoal border border-cosmic/50 text-cosmic font-display font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-cosmic/10 transition"
                    >
                      Share ↗
                    </button>
                  </div>
                )}
                <PlayerPickForm
                  key={match.id}
                  onSubmit={submit}
                  teams={[match.home_team, match.away_team]}
                  requireDiscord={!auth.configured}
                  requireWallet={needsWallet}
                  initial={{
                    ...(!auth.configured && remembered
                      ? { discord: remembered.discord, wallet: remembered.wallet }
                      : {}),
                    ...(existingPick || {}),
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-10">
        <h2 className="font-display font-bold text-cloud mb-2 text-sm">Upcoming matches</h2>
        <UpcomingList matches={upcoming.filter((m) => m.id !== match.id).slice(0, 12)} odds={oddsMatches} myPicks={myPicksMap} />
      </div>

      {sharing &&
        (submitted || existingPick) &&
        (() => {
          const sp = submitted || existingPick;
          const score = sp.pred_home != null ? `${sp.pred_home}–${sp.pred_away}` : '';
          return (
            <ShareImageModal
              title="Share your match pick"
              chips={[`${match.home_team} ${score} ${match.away_team}`.replace(/\s+/g, ' ').trim()]}
              filename={`wc2026-match-${match.id}.png`}
              shareTitle="My World Cup 2026 match call"
              shareText={`My call: ${match.home_team} ${score} ${match.away_team} — Jupiter Community Predictor Challenge. Make your picks at jup26wc.com`}
              previewAspect="1080 / 680"
              card={<ShareableMatchPick match={match} pick={sp} handle={auth.handle} />}
              onClose={() => setSharing(false)}
            />
          );
        })()}
    </div>
  );
}

// "Wednesday, June 11" (UTC) from an ISO kickoff string — matches the UTC times on
// the cards, so a 02:00-UTC game lands on its UTC day.
function dayHeader(kickoffUtc) {
  if (!kickoffUtc) return 'Date TBD';
  const d = new Date(kickoffUtc);
  if (Number.isNaN(d.getTime())) return 'Date TBD';
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function UpcomingList({ matches, odds = {}, myPicks = {} }) {
  if (!matches.length) {
    return <div className="text-steel text-sm">No upcoming matches with confirmed teams yet.</div>;
  }
  const odd = matches.length % 2 === 1;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {matches.map((m, i) => (
        <Link
          key={m.id}
          to={`/picks/${m.id}`}
          className={`block overflow-hidden rounded-xl border border-charcoal hover:border-nebula transition group ${
            odd && i === matches.length - 1 ? 'md:col-span-2' : ''
          }`}
        >
          <MatchBannerCard match={m} odds={odds[m.id]} pick={myPicks[m.id]} />
        </Link>
      ))}
    </div>
  );
}

function Countdown({ target }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const diff = target - now;
  if (diff <= 0) return <div className="text-xs text-trifid mt-1">Picks close now.</div>;
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (days || hrs) parts.push(`${hrs}h`);
  parts.push(`${mins}m`);
  return (
    <div className="text-xs text-cosmic mt-1">
      Picks close in <b>{parts.join(' ')}</b>
    </div>
  );
}
