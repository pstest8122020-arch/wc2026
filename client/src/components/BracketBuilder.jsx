import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { fifaCode, flagImgUrl } from '../lib/flags.js';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ShareImageModal from './ShareImageModal.jsx';
import ShareableChampion from './ShareableChampion.jsx';
import ShareableKnockoutBracket from './ShareableKnockoutBracket.jsx';
import NextStepModal from './NextStepModal.jsx';
import InfoTip from './InfoTip.jsx';
import PlayerAutocomplete from './PlayerAutocomplete.jsx';
import { useAuth, discordLoginUrl } from '../hooks/useAuth.js';

// Interactive WC2026 bracket. Left: set each group's finish order + pick the 8
// best thirds. Right: a centre-converging knockout tree — tap a winner in each
// tie to advance them toward the Final in the middle. Local state for now.

// Which Last-32 matches sit in each half of the draw (top→bottom order so each
// pair of feeders is adjacent and the flex columns line up).
const HALF = {
  L: { R32: [73, 75, 74, 77, 83, 84, 81, 82], R16: [89, 90, 93, 94], QF: [97, 98], SF: [101] },
  R: { R32: [76, 78, 79, 80, 86, 88, 85, 87], R16: [91, 92, 95, 96], QF: [99, 100], SF: [102] },
};

// Fisher–Yates shuffle (returns a new array).
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Official FIFA third-place allocation: the SET of 8 qualifying groups → a
// { matchNum: thirdTeam } map, via the lookup table the server sends (Annex C of
// the regulations). A pure lookup keyed on the sorted set, so it never depends on
// the order the thirds were picked — re-selecting the same eight always rebuilds
// the identical matchups. Only defined for a full set of 8; fewer picks leave the
// third-slots empty.
function allocateThirds(struct, pickedThirds, teamGroupMap, orderMap) {
  const table = struct?.thirdAllocation;
  const matchOrder = struct?.thirdMatchOrder;
  if (!table || !matchOrder || !Array.isArray(pickedThirds) || pickedThirds.length !== 8) return {};
  const groups = pickedThirds.map((t) => teamGroupMap[t]).filter(Boolean);
  if (groups.length !== 8) return {};
  const v = table[[...groups].sort().join('')];
  if (!v || v.length !== matchOrder.length) return {};
  const alloc = {};
  for (let i = 0; i < matchOrder.length; i++) alloc[matchOrder[i]] = orderMap[v[i]]?.[2] || null;
  return alloc; // { matchNum: thirdTeam }
}

// A complete bracket = all 8 third-place teams picked + a winner for every scored
// knockout match (Round of 32 → Final; the unscored 3rd-place playoff stays
// optional). Returns { complete, missing: string[] } — `missing` lists, in plain
// language, what's still needed so we can both gate the submit and show a checklist.
function bracketCompleteness(struct, thirds, winners) {
  const missing = [];
  const thirdsCount = Array.isArray(thirds) ? thirds.length : 0;
  if (thirdsCount !== 8) missing.push(`pick all 8 third-place teams (${thirdsCount}/8)`);
  const required = struct?.rounds ? [...struct.rounds.flatMap((r) => r.matches), 103] : [];
  const open = required.filter((mn) => !winners?.[mn]);
  if (open.length) {
    missing.push(
      open.length === 1 && open[0] === 104
        ? 'pick your champion — the Final is still open'
        : open.length === 1 && open[0] === 103
          ? 'pick your 3rd-place playoff winner'
          : `complete the knockout bracket — ${open.length} match${open.length > 1 ? 'es' : ''} still need a winner`,
    );
  }
  return { complete: missing.length === 0, missing, openMatches: open };
}

export default function BracketBuilder({ readOnly = false, initialBracket = null, exportCardOnly = false }) {
  const [struct, setStruct] = useState(null);
  const [error, setError] = useState('');
  const [order, setOrder] = useState({});
  const [thirds, setThirds] = useState([]);
  const [winners, setWinners] = useState({});
  const wrapRef = useRef(null);
  const bracketRef = useRef(null);
  const [zoom, setZoom] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const [showHow, setShowHow] = useState(false);
  const [shareWhat, setShareWhat] = useState(null); // null | 'champion' | 'bracket'
  const [saved, setSaved] = useState(false); // has a persisted bracket (loaded or just saved)
  const [submitting, setSubmitting] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [wallet, setWallet] = useState('');
  const [awards, setAwards] = useState({ golden_boot: '', best_young: '', player_tournament: '' });
  const [showNextStep, setShowNextStep] = useState(false);
  const nextStepShownRef = useRef(false); // show the "next step" popup once per visit
  const auth = useAuth();

  // Scale the (fixed-width) bracket down to fit the available width on small
  // screens; a Zoom toggle switches to full size + horizontal scroll. offsetWidth
  // is the pre-transform layout width, so it stays correct while scaled.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const recompute = () => {
      const inner = bracketRef.current;
      if (!inner) return;
      // Available width = the wrapper, but never wider than the real visual
      // viewport (guards against an iframe / ancestor that reports a wide box).
      const vp =
        window.visualViewport?.width || document.documentElement.clientWidth || window.innerWidth || 9999;
      const avail = Math.max(140, Math.min(wrap.clientWidth, vp) - 6);
      const natural = Math.max(inner.scrollWidth, inner.offsetWidth) || 880;
      setFitScale(Math.min(1, avail / natural));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    const onVp = () => recompute();
    window.visualViewport?.addEventListener('resize', onVp);
    return () => {
      ro.disconnect();
      window.visualViewport?.removeEventListener('resize', onVp);
    };
  }, [struct]);

  useEffect(() => {
    api
      .bracketStructure()
      .then((s) => {
        setStruct(s);
        const o = {};
        for (const g of Object.keys(s.groups)) o[g] = [...s.groups[g]];
        setOrder(o);
      })
      .catch((e) => setError(e.message || 'Failed to load bracket'));
  }, []);

  // Seed saved picks once the structure is loaded: from an explicitly-passed
  // bracket (My Bracket read-only view) or, when interactive + logged in, from
  // the server (so returning users see/continue their submitted bracket).
  function applyBracket(b) {
    if (b?.groups && typeof b.groups === 'object') setOrder({ ...b.groups });
    if (Array.isArray(b?.thirds)) setThirds([...b.thirds]);
    if (b?.knockout && typeof b.knockout === 'object') {
      const w = {};
      for (const [k, v] of Object.entries(b.knockout)) if (v) w[Number(k)] = v;
      setWinners(w);
    }
    if (b?.wallet_address) setWallet(b.wallet_address);
    if (b?.awards) {
      setAwards({
        golden_boot: b.awards.golden_boot || '',
        best_young: b.awards.best_young || '',
        player_tournament: b.awards.player_tournament || '',
      });
    }
  }
  useEffect(() => {
    if (!struct) return;
    if (initialBracket) {
      applyBracket(initialBracket);
      setSaved(true);
      return;
    }
    if (readOnly || !auth.loggedIn) return;
    api
      .getMyBracket()
      .then((b) => {
        applyBracket(b);
        setSaved(true);
      })
      .catch(() => {}); // 404 = no bracket yet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [struct, auth.loggedIn, initialBracket]);

  // Guard against losing unsaved edits on refresh / tab close. (Client-side route
  // changes don't trigger this; the inline "unsaved changes" notice covers those.)
  useEffect(() => {
    if (readOnly || saved) return undefined;
    const hasPicks = thirds.length > 0 || Object.keys(winners).length > 0;
    if (!hasPicks) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [readOnly, saved, thirds, winners]);

  const groupKeys = useMemo(() => Object.keys(order).sort(), [order]);
  const teamGroup = useMemo(() => {
    const m = {};
    for (const g of groupKeys) for (const t of order[g] || []) m[t] = g;
    return m;
  }, [order, groupKeys]);
  const thirdPlaceTeams = useMemo(
    () => groupKeys.map((g) => order[g]?.[2]).filter(Boolean),
    [order, groupKeys],
  );
  // Official allocation (FIFA Annex C lookup): deterministic in the SET of the 8
  // qualifying groups, so re-picking the same eight always rebuilds the identical
  // matchups. Empty until all 8 thirds are chosen.
  const thirdsAlloc = useMemo(
    () => allocateThirds(struct, thirds, teamGroup, order),
    [struct, thirds, teamGroup, order],
  );
  const childOf = useMemo(() => {
    if (!struct) return {};
    const c = {};
    for (const [k, feed] of Object.entries(struct.feeds)) {
      if (Number(k) === 103) continue;
      for (const m of feed) c[m] = Number(k);
    }
    return c;
  }, [struct]);

  function resolveCode(code, matchNum) {
    if (code === 'T') return thirdsAlloc[matchNum] || null;
    const pos = code[0] === '1' ? 0 : 1;
    return order[code.slice(1)]?.[pos] || null;
  }
  function matchTeams(matchNum) {
    if (!struct) return [null, null];
    const r32 = struct.roundOf32.find((m) => m.match === matchNum);
    if (r32) return [resolveCode(r32.home, matchNum), resolveCode(r32.away, matchNum)];
    const feed = struct.feeds[matchNum];
    if (!feed) return [null, null];
    if (matchNum === 103) return feed.map((m) => loserOf(m));
    return feed.map((m) => winners[m] || null);
  }
  function loserOf(matchNum) {
    const w = winners[matchNum];
    if (!w) return null;
    const [a, b] = matchTeams(matchNum);
    return w === a ? b : w === b ? a : null;
  }
  function pickWinner(matchNum, team) {
    if (readOnly) return;
    setSaved(false);
    setWinners((prev) => {
      const next = { ...prev };
      const removed = next[matchNum];
      next[matchNum] = team;
      let cur = matchNum;
      while (childOf[cur] != null) {
        const parent = childOf[cur];
        if (removed && next[parent] === removed) {
          delete next[parent];
          cur = parent;
        } else break;
      }
      return next;
    });
  }
  function reorderGroup(g, newArr) {
    if (readOnly) return;
    setSaved(false);
    const nextOrder = { ...order, [g]: newArr };
    setOrder(nextOrder);
    // keep only picks that are still their group's 3rd-place team
    setThirds((prev) => prev.filter((t) => Object.keys(nextOrder).some((gg) => nextOrder[gg]?.[2] === t)));
    setWinners({});
  }
  function toggleThird(team) {
    if (readOnly) return;
    setSaved(false);
    setThirds((prev) => {
      if (prev.includes(team)) return prev.filter((t) => t !== team);
      if (prev.length >= 8) return prev;
      return [...prev, team];
    });
    setWinners({});
  }
  function resetAll() {
    if (!struct) return;
    setSaved(false);
    const o = {};
    for (const g of Object.keys(struct.groups)) o[g] = [...struct.groups[g]];
    setOrder(o);
    setThirds([]);
    setWinners({});
  }

  // Persist the bracket to the logged-in Discord account (create or update).
  async function submitBracket() {
    if (submitting) return;
    if (!auth.loggedIn) {
      setSaveErr(
        'You appear to be logged out — your session may have expired. Refresh the page, log in with Discord, then click Update bracket again.',
      );
      return;
    }
    // Mandatory: a complete bracket — no half-filled entries.
    const { complete, missing } = bracketCompleteness(struct, thirds, winners);
    if (!complete) {
      setSaveErr(`Your bracket isn't complete yet — before submitting, ${missing.join('; ')}.`);
      return;
    }
    const w = wallet.trim();
    if (!w) {
      setSaveErr('Enter your Solana wallet address to enter.');
      return;
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)) {
      setSaveErr('That does not look like a valid Solana wallet address.');
      return;
    }
    setSubmitting(true);
    setSaveErr('');
    try {
      await api.submitMyBracket({
        groups: order,
        thirds,
        knockout: winners,
        champion: winners[104] || null,
        wallet_address: w,
        awards: {
          golden_boot: awards.golden_boot.trim(),
          best_young: awards.best_young.trim(),
          player_tournament: awards.player_tournament.trim(),
        },
      });
      setSaved(true);
      // Nudge the eligibility banner (mounted on the builder too) to re-check: the
      // wallet's background check resolves in a few seconds, so an ineligible wallet
      // gets flagged right here instead of only on a later page.
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('eligibility:refresh'));
      // Show the "next step" popup once per visit, after a submit.
      if (!nextStepShownRef.current) {
        nextStepShownRef.current = true;
        setShowNextStep(true);
      }
    } catch (e) {
      setSaveErr(e.message || 'Could not save your bracket. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Fill a complete, VALID random bracket in one tap: shuffle every group's
  // finish order, pick 8 random thirds (any 8-of-12 has a valid slot matching),
  // allocate them to their real Last-32 slots, then tap a random winner up every
  // tie to a champion. Computed in locals so it doesn't race React state.
  function shuffleAll() {
    if (!struct) return;
    const newOrder = {};
    for (const g of Object.keys(struct.groups)) newOrder[g] = shuffled(struct.groups[g]);

    const teamG = {};
    for (const g of Object.keys(newOrder)) for (const t of newOrder[g]) teamG[t] = g;

    const allThirds = Object.keys(newOrder)
      .map((g) => newOrder[g]?.[2])
      .filter(Boolean);
    const newThirds = shuffled(allThirds).slice(0, 8);

    // Allocate the 8 picked thirds to their official Last-32 slots (same lookup as
    // the live view, so a shuffled bracket is consistent with a hand-picked one).
    const alloc = allocateThirds(struct, newThirds, teamG, newOrder);

    const newWinners = {};
    const resolve = (code, mn) => {
      if (code === 'T') return alloc[mn] || null;
      const pos = code[0] === '1' ? 0 : 1;
      return newOrder[code.slice(1)]?.[pos] || null;
    };
    const teamsOf = (mn) => {
      const r32 = struct.roundOf32.find((m) => m.match === mn);
      if (r32) return [resolve(r32.home, mn), resolve(r32.away, mn)];
      const feed = struct.feeds[mn];
      if (!feed) return [null, null];
      if (mn === 103) return feed.map((m) => loserOfLocal(m));
      return feed.map((m) => newWinners[m] || null);
    };
    const loserOfLocal = (mn) => {
      const w = newWinners[mn];
      if (!w) return null;
      const [a, b] = teamsOf(mn);
      return w === a ? b : w === b ? a : null;
    };
    const pickRand = (mn) => {
      const opts = teamsOf(mn).filter(Boolean);
      if (opts.length) newWinners[mn] = opts[Math.floor(Math.random() * opts.length)];
    };
    for (const r of struct.rounds) for (const mn of r.matches) pickRand(mn);
    pickRand(103); // 3rd-place: losers of the semis

    setOrder(newOrder);
    setThirds(newThirds);
    setWinners(newWinners);
  }

  if (error) return <div className="text-trifid bg-trifid/10 border border-trifid/30 rounded px-3 py-2">{error}</div>;
  if (!struct) return <div className="text-steel">Loading bracket…</div>;

  const ready = thirds.length === 8;
  const champion = winners[104] || null;
  const { complete: bracketComplete, missing: missingBits, openMatches } = bracketCompleteness(struct, thirds, winners);
  const scale = zoom ? 1 : fitScale;
  // Sharing is only allowed once a logged-in user has submitted their bracket.
  const canShare = auth.loggedIn && saved;
  const shareHint = !auth.loggedIn
    ? 'Log in and submit your bracket to share'
    : !saved
      ? 'Submit your bracket to share'
      : '';

  // Flatten the resolved teams per match for the shareable bracket card.
  const teamsByMatch = {};
  for (const r of struct.rounds) for (const mn of r.matches) teamsByMatch[mn] = matchTeams(mn);
  teamsByMatch[103] = matchTeams(103);

  // Local-only export harness: render just the shareable knockout card (no handle)
  // for headless screenshotting. `saved` flips true once initialBracket is applied.
  if (exportCardOnly) {
    if (!saved) return <div data-export-loading="1" style={{ width: 1360, height: 8 }} />;
    return (
      <div data-export-card="1" style={{ display: 'inline-block' }}>
        <ShareableKnockoutBracket
          teamsByMatch={teamsByMatch}
          winners={winners}
          champion={champion}
          handle=""
          awards={awards}
        />
      </div>
    );
  }

  const col = (side, matches, isParent) => (
    <div className={`bkt-col bkt-${side}`} style={{ minWidth: 80 }}>
      {matches.map((mn) => (
        <div key={mn} className={`bkt-cell bkt-fwd ${isParent ? 'bkt-parent' : ''} justify-center`}>
          {isParent && <span className="bkt-vline" />}
          <Tie
            teams={matchTeams(mn)}
            winner={winners[mn]}
            onPick={(t) => pickWinner(mn, t)}
            needsPick={!readOnly && openMatches?.includes(mn)}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="overflow-x-hidden">
      {!readOnly && (
      <div className="mb-5">
        <h1 className="font-display text-2xl sm:text-3xl font-black text-cloud">Build your bracket</h1>
        <p className="text-sm text-cloud/70 mt-0.5">Set the groups, pick 8 third-place teams, then tap your route to the champion.</p>
        <div className="flex items-center gap-2.5 mt-3 flex-wrap">
          <button
            type="button"
            onClick={shuffleAll}
            className="inline-flex items-center gap-2 rounded-full bg-cloud text-space font-bold text-sm px-4 py-2 hover:brightness-105 active:scale-[0.98] transition shrink-0"
          >
            <ShuffleIcon /> Shuffle
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-2 rounded-full border border-nebula/60 text-nebula font-bold text-sm px-4 py-2 hover:bg-nebula/10 hover:border-nebula active:scale-[0.98] transition shrink-0"
          >
            <ResetIcon /> Reset
          </button>
          <button
            type="button"
            onClick={() => setShowHow((s) => !s)}
            aria-expanded={showHow}
            className="inline-flex items-center gap-1.5 rounded-full border border-nebula/40 text-nebula hover:text-helix hover:border-nebula hover:bg-nebula/10 font-bold text-sm px-4 py-2 transition shrink-0"
          >
            How it works
            <span className={`text-xs transition-transform ${showHow ? 'rotate-180' : ''}`} aria-hidden="true">↓</span>
          </button>
          <span className="hidden sm:block w-px h-5 bg-charcoal mx-0.5" aria-hidden="true" />
          <button
            type="button"
            onClick={() => canShare && setShareWhat('bracket')}
            disabled={!canShare}
            title={shareHint}
            className={`inline-flex items-center gap-2 rounded-full font-extrabold text-sm px-5 py-2.5 transition shrink-0 ${
              canShare
                ? 'bg-jupiter-gradient text-space shadow-lg shadow-nebula/30 hover:shadow-xl hover:shadow-nebula/50 hover:scale-[1.03] active:scale-95'
                : 'bg-charcoal/50 text-steel border border-charcoal cursor-not-allowed'
            }`}
          >
            <ShareGlyph /> Share bracket
          </button>
          <button
            type="button"
            onClick={() => canShare && champion && setShareWhat('champion')}
            disabled={!canShare || !champion}
            title={!canShare ? shareHint : !champion ? 'Pick your champion first' : ''}
            className={`inline-flex items-center gap-2 rounded-full font-extrabold text-sm px-5 py-2.5 transition shrink-0 ${
              canShare && champion
                ? 'bg-jupiter-gradient text-space shadow-lg shadow-cosmic/30 hover:shadow-xl hover:shadow-cosmic/50 hover:scale-[1.03] active:scale-95'
                : 'bg-charcoal/50 text-steel border border-charcoal cursor-not-allowed'
            }`}
          >
            <ShareGlyph /> Share champion
          </button>
        </div>
        {showHow && <HowItWorks />}
      </div>
      )}

      <div className="flex flex-col xl:flex-row gap-6">
        {/* LEFT: groups + thirds */}
        <aside className="xl:w-[384px] shrink-0 space-y-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-cloud/70 font-bold mb-2">
              Groups{' '}
              {!readOnly && (
                <span className="text-cloud/70 normal-case tracking-normal">· drag to set finish order</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {groupKeys.map((g) => (
                <GroupMini key={g} g={g} teams={order[g]} onReorder={reorderGroup} readOnly={readOnly} />
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-cloud/70 font-bold mb-2 flex items-center gap-2">
              Third-place teams
              <span className={`normal-case tracking-normal text-xs ${ready ? 'text-cosmic' : 'text-cloud/80'}`}>{thirds.length}/8</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {thirdPlaceTeams.map((t) => {
                const sel = thirds.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleThird(t)}
                    disabled={readOnly}
                    className={`rounded border px-1.5 py-1 text-[11px] font-bold flex items-center gap-1 transition disabled:cursor-default ${
                      sel ? 'border-nebula bg-nebula/15 text-cloud' : 'border-charcoal bg-meteorite text-cloud/70 enabled:hover:border-steel'
                    }`}
                  >
                    <img src={flagImgUrl(t)} alt="" className="w-4 h-3 object-cover rounded-[1px] shrink-0" />
                    <span className="truncate">{fifaCode(t)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* RIGHT: knockout bracket */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-cloud/70 font-bold">
              Knockouts{' '}
              {!readOnly && <span className="text-cloud/70 normal-case tracking-normal">· tap a winner</span>}
            </div>
            {fitScale < 0.9 && (
              <button
                type="button"
                onClick={() => setZoom((z) => !z)}
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-steel hover:text-cloud border border-charcoal hover:border-nebula rounded-full px-3 py-1 transition"
              >
                {zoom ? 'Fit to screen' : 'Zoom in'}
              </button>
            )}
          </div>
          {!readOnly && !ready && (
            <div className="text-xs text-cloud/70 mb-2">
              Pick <b className="text-cloud">{8 - thirds.length}</b> more third-place team{8 - thirds.length === 1 ? '' : 's'} — all eight drop into their official Last-32 slots.
            </div>
          )}
          <div
            ref={wrapRef}
            className={`pb-3 ${zoom ? 'overflow-x-auto bracket-scroll' : 'overflow-hidden'}`}
            style={{ height: zoom ? undefined : 520 * scale + 14 }}
          >
              <div
                ref={bracketRef}
                className="flex items-stretch gap-4 min-w-max"
                style={{ height: 520, transform: `scale(${scale})`, transformOrigin: 'top left' }}
              >
                {col('L', HALF.L.R32, false)}
                {col('L', HALF.L.R16, true)}
                {col('L', HALF.L.QF, true)}
                {col('L', HALF.L.SF, true)}

                {/* centre: Final + 3rd place */}
                <div className="bkt-col items-center" style={{ minWidth: 104 }}>
                  <div className="bkt-cell flex-col gap-4 justify-center">
                    <div className="text-center">
                      <div className="text-[8px] uppercase tracking-[0.15em] text-steel mb-1">3rd place</div>
                      <Tie teams={matchTeams(103)} winner={winners[103]} onPick={(t) => pickWinner(103, t)} />
                      <div className="text-[7px] uppercase tracking-[0.1em] text-steel/70 mt-1">8 pts</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-cosmic font-bold mb-1">Final</div>
                      <Tie teams={matchTeams(104)} winner={winners[104]} onPick={(t) => pickWinner(104, t)} needsPick={!readOnly && openMatches?.includes(104)} big />
                    </div>
                  </div>
                </div>

                {col('R', HALF.R.SF, true)}
                {col('R', HALF.R.QF, true)}
                {col('R', HALF.R.R16, true)}
                {col('R', HALF.R.R32, false)}
              </div>
            </div>

          {champion && (
            <div className="mt-5 bg-jupiter-gradient rounded-xl p-[1.5px] inline-block">
              <div className="bg-space rounded-[10px] px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">🏆</span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-cosmic font-bold">Your champion</div>
                  <div className="font-display font-black text-lg text-cloud flex items-center gap-2">
                    <img src={flagImgUrl(champion)} alt="" className="w-7 h-5 object-cover rounded-[2px]" />
                    {champion}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tournament awards — predicted with the bracket, locked at kickoff */}
      <div className="mt-6 rounded-2xl border border-charcoal bg-meteorite/60 p-5 sm:p-6">
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <h3 className="font-display font-bold text-cloud text-lg">Tournament awards</h3>
          <span className="text-xs text-cloud/50">{readOnly ? '' : 'optional · '}locked with your bracket</span>
        </div>
        {!readOnly && (
          <p className="text-sm text-cloud/60 mb-4">Call the standout players of the tournament.</p>
        )}
        <div className="grid sm:grid-cols-3 gap-3 mt-3">
          <AwardField
            label="Golden Ball"
            pts="25"
            info="Best overall player of the tournament (the tournament MVP)."
            value={awards.player_tournament}
            onChange={(v) => setAwards((a) => ({ ...a, player_tournament: v }))}
            readOnly={readOnly}
          />
          <AwardField
            label="Golden Boot"
            pts="20"
            info="Top goalscorer of the tournament."
            value={awards.golden_boot}
            onChange={(v) => setAwards((a) => ({ ...a, golden_boot: v }))}
            readOnly={readOnly}
          />
          <AwardField
            label="FIFA Young Player Award"
            pts="15"
            info="Best player aged 21 or under."
            value={awards.best_young}
            onChange={(v) => setAwards((a) => ({ ...a, best_young: v }))}
            readOnly={readOnly}
          />
        </div>
      </div>

      {/* Submit / login gate — play freely, log in with Discord to save + lock */}
      {!readOnly && (
      <div className="mt-6 rounded-2xl border border-charcoal bg-meteorite/60 p-5 sm:p-6">
        {auth.loading ? (
          <div className="text-sm text-steel">Checking your session…</div>
        ) : auth.configured && auth.loggedIn ? (
          <div>
            <div className="font-display font-bold text-cloud text-lg">
              {saved ? 'Your bracket is saved' : 'Lock in your bracket'}
            </div>
            <div className="text-sm text-cloud/70 mt-0.5">
              Signed in as <b className="text-cloud">@{auth.handle}</b>
              {champion ? (
                <> · champion <b className="text-cloud">{champion}</b></>
              ) : (
                <> · pick your champion to finish</>
              )}{' '}
              · <span className={ready ? 'text-cosmic' : 'text-cloud/70'}>{thirds.length}/8 thirds</span>
            </div>

            <label className="block mt-4">
              <div className="text-sm text-cloud/80 mb-1.5 font-medium">
                Solana wallet address <span className="text-trifid">*</span>
              </div>
              <input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="Paste your Solana wallet…"
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-charcoal border border-gunmetal rounded-lg px-3 py-2.5 text-cloud font-mono text-sm focus:border-nebula focus:outline-none"
              />
            </label>
            <p className="text-xs text-steel mt-2 leading-snug max-w-2xl">
              The challenge is open to <b className="text-cloud/80">Jupiter Prediction Markets</b> users only.
              We check this wallet for activity to confirm eligibility, and pay prizes out to it if you win.{' '}
              <a
                href="https://jup.ag/prediction/world-cup"
                target="_blank"
                rel="noopener noreferrer"
                data-track-event="get_eligible"
                className="text-nebula hover:text-helix underline"
              >
                Get eligible ↗
              </a>
            </p>

            {!bracketComplete && (
              <div className="mt-4 rounded-lg border border-cosmic/40 bg-cosmic/10 px-3.5 py-3 text-sm">
                <div className="font-display font-bold text-cloud mb-1">Finish your bracket before submitting</div>
                <ul className="text-cloud/75 list-disc pl-5 space-y-0.5">
                  {missingBits.map((b, i) => (
                    <li key={i}>{b.charAt(0).toUpperCase() + b.slice(1)}</li>
                  ))}
                </ul>
                {openMatches?.length > 0 && openMatches.length <= 4 && (
                  <div className="mt-2 pt-2 border-t border-cosmic/20">
                    <div className="text-xs uppercase tracking-wide text-cloud/55 mb-1">
                      Still need a winner — ringed green in the bracket above:
                    </div>
                    <ul className="space-y-0.5">
                      {openMatches.map((mn) => {
                        const [h, a] = matchTeams(mn);
                        return (
                          <li key={mn} className="flex items-center gap-1.5 text-cloud/80">
                            <span className="text-helix" aria-hidden="true">●</span>
                            {mn === 104 && <b className="text-cloud">Champion —</b>}
                            <span>{h || 'TBD'} vs {a || 'TBD'}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={submitBracket}
              disabled={submitting}
              title={bracketComplete ? '' : 'Complete your bracket to submit'}
              className="mt-4 inline-flex items-center justify-center bg-jupiter-gradient text-space font-display font-bold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.01] transition disabled:opacity-60"
            >
              {submitting ? 'Saving…' : saved ? 'Update bracket' : 'Submit bracket →'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="font-display font-bold text-cloud text-lg">Ready to enter?</div>
              <div className="text-sm text-cloud/70 mt-0.5">
                Play with the bracket as much as you like — log in with Discord to submit and lock it in for the contest.
              </div>
            </div>
            {auth.configured ? (
              <a
                href={discordLoginUrl('/')}
                className="inline-flex items-center justify-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] text-white font-display font-bold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition shrink-0"
              >
                <DiscordIcon /> Log in to submit
              </a>
            ) : (
              <span className="text-sm text-steel shrink-0">Submitting opens soon.</span>
            )}
          </div>
        )}
        {saveErr && (
          <div className="mt-3 text-sm text-trifid bg-trifid/10 border border-trifid/30 rounded-lg px-3 py-2">{saveErr}</div>
        )}
        {saved && !saveErr && auth.loggedIn && (
          <div className="mt-3 text-sm text-cosmic bg-cosmic/10 border border-cosmic/30 rounded-lg px-3 py-2">
            Saved to <b>@{auth.handle}</b> — find it under <b>My Picks</b>. You can update it until the first kickoff.
          </div>
        )}
        {!saved && !saveErr && auth.loggedIn && (thirds.length > 0 || Object.keys(winners).length > 0) && (
          <div className="mt-3 text-sm text-helix bg-helix/10 border border-helix/30 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-helix shrink-0" aria-hidden="true" />
            <span>
              You have <b>unsaved changes</b>.{' '}
              {bracketComplete
                ? 'Click the button above to save them — nothing counts until you do.'
                : 'Finish the highlighted picks, then click the button above to save.'}
            </span>
          </div>
        )}
      </div>
      )}

      {shareWhat === 'bracket' && (
        <ShareImageModal
          title="Share your World Cup 2026 bracket"
          chips={[champion ? `Champion: ${champion}` : 'Bracket in progress']}
          filename="wc2026-my-bracket.png"
          shareTitle="My World Cup 2026 bracket"
          shareText="My World Cup 2026 knockout bracket — built in the Jupiter Community Predictor Challenge. Make yours and win a share of the prize pool."
          previewAspect="1360 / 980"
          card={<ShareableKnockoutBracket teamsByMatch={teamsByMatch} winners={winners} champion={champion} handle={auth.handle} awards={awards} />}
          onClose={() => setShareWhat(null)}
        />
      )}
      {shareWhat === 'champion' && (
        <ShareImageModal
          title="Share your World Cup 2026 Champion pick"
          chips={champion ? [champion] : []}
          filename="wc2026-champion.png"
          shareTitle="My World Cup 2026 Champion"
          shareText={`My pick to win the World Cup 2026: ${champion}. Build your bracket in the Jupiter Community Predictor Challenge.`}
          previewAspect="1080 / 720"
          card={<ShareableChampion champion={champion} handle={auth.handle} awards={awards} />}
          onClose={() => setShareWhat(null)}
        />
      )}
      {showNextStep && <NextStepModal onClose={() => setShowNextStep(false)} />}
    </div>
  );
}

function Chip({ team, variant = 'plain', big }) {
  const h = big ? 'h-8' : 'h-7';
  if (!team) return <div className={`${h} w-full rounded bg-charcoal/50 border border-charcoal/50`} />;
  const styles = {
    win: 'bg-nebula/25 border-nebula text-cloud',
    dim: 'bg-meteorite border-charcoal text-cloud/35',
    plain: 'bg-meteorite border-charcoal text-cloud',
  }[variant];
  return (
    <div className={`${h} w-full rounded flex items-center gap-1.5 px-1.5 ${big ? 'text-sm' : 'text-[11px]'} font-bold border ${styles}`}>
      <img src={flagImgUrl(team)} alt="" className="w-4 h-3 object-cover rounded-[1px] shrink-0" />
      <span className="truncate">{fifaCode(team)}</span>
    </div>
  );
}

function Tie({ teams, winner, onPick, big, needsPick }) {
  return (
    <div
      className={`${big ? 'w-[96px]' : 'w-[80px]'} flex flex-col gap-1 ${
        needsPick ? 'rounded-md ring-2 ring-helix ring-offset-2 ring-offset-space' : ''
      }`}
    >
      {[teams[0], teams[1]].map((t, i) => {
        const v = !t ? 'empty' : winner ? (winner === t ? 'win' : 'dim') : 'plain';
        return (
          <button
            key={i}
            type="button"
            disabled={!t}
            onClick={() => t && onPick(t)}
            className="block w-full text-left enabled:hover:brightness-125 transition disabled:cursor-default"
          >
            <Chip team={t} variant={v} big={big} />
          </button>
        );
      })}
    </div>
  );
}

function GroupMini({ g, teams, onReorder, readOnly }) {
  // MouseSensor (desktop, small move) + TouchSensor (mobile, short hold so the
  // page still scrolls on a swipe) + KeyboardSensor (a11y).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function handleDragEnd(e) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = (teams || []).indexOf(active.id);
    const to = (teams || []).indexOf(over.id);
    if (from < 0 || to < 0) return;
    onReorder(g, arrayMove(teams, from, to));
  }
  const list = teams || [];
  return (
    <div className="rounded-md border border-charcoal bg-meteorite p-1">
      <div className="text-[9px] font-display font-bold text-steel mb-0.5 px-0.5">{g}</div>
      {readOnly ? (
        <div className="space-y-0.5">
          {list.map((t, i) => (
            <StaticTeam key={t} id={t} pos={i + 1} />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={list} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5">
              {list.map((t, i) => (
                <SortableTeam key={t} id={t} pos={i + 1} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function StaticTeam({ id, pos }) {
  const posCls = ['text-cosmic', 'text-cosmic', 'text-amber-400', 'text-steel'][pos - 1];
  return (
    <div className="flex items-center gap-0.5 rounded select-none">
      <span className={`w-1.5 text-[8px] font-bold text-center shrink-0 ${posCls}`}>{pos}</span>
      <div className="flex-1 min-w-0 h-5 rounded flex items-center gap-1 px-1 text-[10px] font-bold border border-charcoal bg-charcoal/40 text-cloud">
        <img src={flagImgUrl(id)} alt="" className="w-3.5 h-2.5 object-cover rounded-[1px] shrink-0" />
        <span className="truncate">{fifaCode(id)}</span>
      </div>
    </div>
  );
}

function SortableTeam({ id, pos }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const posCls = ['text-cosmic', 'text-cosmic', 'text-amber-400', 'text-steel'][pos - 1];
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-0.5 rounded cursor-grab active:cursor-grabbing select-none ${
        isDragging ? 'opacity-95 ring-1 ring-nebula relative z-20 shadow-lg shadow-black/40' : ''
      }`}
    >
      <span className={`w-1.5 text-[8px] font-bold text-center shrink-0 ${posCls}`}>{pos}</span>
      <div className="flex-1 min-w-0 h-5 rounded flex items-center gap-1 px-1 text-[10px] font-bold border border-charcoal bg-charcoal/40 text-cloud">
        <img src={flagImgUrl(id)} alt="" className="w-3.5 h-2.5 object-cover rounded-[1px] shrink-0" />
        <span className="truncate">{fifaCode(id)}</span>
      </div>
      <span className="text-steel/50 text-[9px] leading-none shrink-0" aria-hidden="true">⠿</span>
    </div>
  );
}

function AwardField({ label, pts, value, onChange, readOnly, info }) {
  return (
    <label className="block">
      <div className="text-xs text-cloud/70 mb-1.5">
        {label}{' '}
        {info ? <><InfoTip text={info} label={`What is the ${label}?`} />{' '}</> : null}
        <span className="text-cloud/40">· {pts} pts</span>
      </div>
      {readOnly ? (
        <div className="w-full bg-charcoal border border-gunmetal rounded-lg px-3 py-2 text-sm text-cloud min-h-[38px] flex items-center">
          {value || <span className="text-steel">—</span>}
        </div>
      ) : (
        <PlayerAutocomplete
          value={value}
          onChange={onChange}
          placeholder="Start typing a player…"
          className="w-full bg-charcoal border border-gunmetal rounded-lg px-3 py-2 text-cloud text-sm placeholder:text-steel focus:border-nebula focus:outline-none"
        />
      )}
    </label>
  );
}

const HOW_STEPS = [
  ['Groups', 'Drag teams to set the 1st–4th finish in each group.'],
  ['Thirds', 'Pick the 8 best third-placed teams — they drop into their real Last-32 slots.'],
  ['Knockouts', 'Tap a winner in each tie to advance them toward your final.'],
  ['Scoring', 'Points for every correct knockout pick, plus a bonus for correct group finishes. Locks at the first kickoff.'],
];

function HowItWorks() {
  return (
    <div className="mt-3 rounded-xl border border-charcoal bg-meteorite/60 p-4">
      <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {HOW_STEPS.map(([title, desc], i) => (
          <li key={title} className="flex gap-2.5">
            <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-nebula/15 text-nebula text-[11px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <p className="text-sm text-cloud/75 leading-snug">
              <b className="text-cloud font-semibold">{title}.</b> {desc}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ShuffleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-[18px] h-[18px]"
      aria-hidden="true"
    >
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="m15 15 6 6" />
      <path d="m4 4 5 5" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-[18px] h-[18px]"
      aria-hidden="true"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v13" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]" aria-hidden="true">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.074.074 0 0 0-.079.037c-.34.6-.717 1.385-.98 2.003a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.997-2.003.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.369a.07.07 0 0 0-.032.027C1.07 8.41.36 12.342.703 16.225a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.245.198.372.292a.077.077 0 0 1-.006.127c-.598.349-1.22.645-1.873.892a.076.076 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-4.91-.838-8.81-3.549-12.42a.06.06 0 0 0-.031-.028ZM8.02 13.86c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}
