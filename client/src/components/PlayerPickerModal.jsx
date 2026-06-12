import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { flagImgUrl } from '../lib/flags.js';

// Tap-to-pick player modal (community request): both squads side by side,
// grouped by position, scorer-first (FW → MF → DF → GK). Click a row to select —
// no typing. A manual-entry footer stays as the escape hatch for late call-ups
// the squad feed doesn't have yet. On phones the two columns become team tabs.

const GROUP_LABELS = { FW: 'Forwards', MF: 'Midfielders', DF: 'Defenders', GK: 'Goalkeepers' };
const GROUPS = ['FW', 'MF', 'DF', 'GK'];

// "Centre-Forward" → CF etc. The feed's positions are coarse ("Offence") for most
// national squads, granular for some — abbreviate whatever arrives.
const POS_ABBR = [
  ['goalkeeper', 'GK'],
  ['centre-back', 'CB'],
  ['center-back', 'CB'],
  ['left-back', 'LB'],
  ['right-back', 'RB'],
  ['defensive midfield', 'DM'],
  ['central midfield', 'CM'],
  ['attacking midfield', 'AM'],
  ['left winger', 'LW'],
  ['right winger', 'RW'],
  ['centre-forward', 'CF'],
  ['center-forward', 'CF'],
  ['striker', 'ST'],
  ['midfield', 'MF'],
  ['defence', 'DF'],
  ['defender', 'DF'],
  ['offence', 'FW'],
  ['forward', 'FW'],
];

function posAbbr(position) {
  const p = String(position || '').toLowerCase();
  for (const [k, v] of POS_ABBR) if (p.includes(k)) return v;
  return '';
}

// Same loose matching as the server: lowercase, strip diacritics, so "gime"
// finds "Giménez". Exported — PickerButton uses it to match saved free-text
// values against roster names.
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

const stripUnsafe = (s) => (s || '').replace(/[<>]/g, '');

function TeamColumn({ squad, query, value, onSelect }) {
  const nq = norm(query);
  const byGroup = useMemo(() => {
    const m = { FW: [], MF: [], DF: [], GK: [] };
    for (const p of squad.players || []) {
      if (nq && !norm(p.name).includes(nq)) continue;
      (m[p.group] || m.MF).push(p);
    }
    return m;
  }, [squad.players, nq]);
  const total = GROUPS.reduce((s, g) => s + byGroup[g].length, 0);

  return (
    <div className="min-w-0">
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-meteorite border-b border-charcoal">
        <img
          src={flagImgUrl(squad.team)}
          alt=""
          className="w-[26px] h-[18px] object-cover rounded-[3px] border border-white/25 shrink-0"
          draggable="false"
        />
        <span className="font-display font-bold text-cloud text-sm truncate">{squad.team}</span>
      </div>
      {total === 0 ? (
        <div className="px-3 py-4 text-xs text-steel">No players match.</div>
      ) : (
        GROUPS.map(
          (g) =>
            byGroup[g].length > 0 && (
              <div key={g}>
                <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cosmic">
                  {GROUP_LABELS[g]}
                </div>
                {byGroup[g].map((p) => {
                  const selected = value && norm(value) === norm(p.name);
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => onSelect(p.name)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 sm:py-2 text-left text-sm transition ${
                        selected ? 'bg-cosmic/10 text-cosmic' : 'text-cloud hover:bg-charcoal'
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {selected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        <span className="text-[10px] font-bold text-steel">{posAbbr(p.position)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ),
        )
      )}
    </div>
  );
}

export default function PlayerPickerModal({ title, squads, value, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(0); // mobile-only team tab
  const [manual, setManual] = useState('');
  const searchRef = useRef(null);
  // Latest-ref for onClose so the mount effect never re-runs: the parent passes a
  // fresh closure every render (and re-renders every 60s on the odds poll) — a
  // [onClose] dep would tear down/re-run this effect and yank focus back to the
  // search box while the user is typing in the manual-entry field.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') closeRef.current();
    }
    document.addEventListener('keydown', onKey);
    // Lock the page behind the modal (it has its own scroll area).
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Autofocus the search only with a mouse/trackpad — on phones it pops the
    // keyboard over the list, and the whole point here is tap-to-pick.
    if (window.matchMedia?.('(pointer: fine)')?.matches) searchRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const cols = (squads || []).filter((s) => (s.players || []).length > 0);

  // Mobile tabs + search: if the active tab has no hits but the other team does,
  // jump there — otherwise the user stares at "No players match." while the
  // result sits behind the inactive tab.
  const nq = norm(query);
  useEffect(() => {
    if (!nq || cols.length < 2) return;
    const counts = cols.map((s) => s.players.filter((p) => norm(p.name).includes(nq)).length);
    if (counts[tab] === 0) {
      const other = counts.findIndex((c) => c > 0);
      if (other !== -1) setTab(other);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nq]);

  // Portaled to <body>: the opener lives inside the pick form, and a modal child
  // would nest this footer's <form> inside it (invalid HTML, and Enter in the
  // search box would submit the pick form instead).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-space/80 backdrop-blur-sm p-0 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full sm:max-w-2xl bg-meteorite border border-charcoal sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85vh]">
        {/* header */}
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <div className="font-display font-bold text-cloud truncate">{title}</div>
            <div className="text-[11px] text-steel">Tap a player to select</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg border border-charcoal text-steel hover:text-cloud hover:border-gunmetal transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* search */}
        <div className="px-4 pb-3">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(stripUnsafe(e.target.value))}
            placeholder="Search both squads…"
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-charcoal border border-gunmetal rounded-lg px-3 py-2 text-sm text-cloud placeholder:text-steel focus:border-nebula focus:outline-none"
          />
        </div>
        {/* mobile team tabs */}
        {cols.length > 1 && (
          <div className="sm:hidden grid grid-cols-2 gap-2 px-4 pb-3">
            {cols.map((s, i) => (
              <button
                key={s.team}
                type="button"
                onClick={() => setTab(i)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-display font-bold transition ${
                  tab === i
                    ? 'border-cosmic/60 bg-cosmic/10 text-cosmic'
                    : 'border-charcoal text-steel'
                }`}
              >
                <img
                  src={flagImgUrl(s.team)}
                  alt=""
                  className="w-[20px] h-[14px] object-cover rounded-[2px] border border-white/25"
                  draggable="false"
                />
                <span className="truncate">{s.team}</span>
              </button>
            ))}
          </div>
        )}
        {/* squads */}
        <div className="flex-1 overflow-y-auto border-t border-charcoal">
          <div className={`grid grid-cols-1 ${cols.length > 1 ? 'sm:grid-cols-2 sm:divide-x sm:divide-charcoal' : ''}`}>
            {cols.map((s, i) => (
              <div key={s.team} className={`${cols.length > 1 && tab !== i ? 'hidden sm:block' : ''}`}>
                <TeamColumn squad={s} query={query} value={value} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </div>
        {/* manual entry — late call-ups / spelling variants the feed lacks */}
        <form
          className="flex items-center gap-2 px-4 py-3 border-t border-charcoal"
          onSubmit={(e) => {
            e.preventDefault();
            // The portal moves us out of the pick form's DOM, but React synthetic
            // events still bubble through the REACT tree — without this, "Use"
            // also fires the pick form's submit with stale state.
            e.stopPropagation();
            if (manual.trim()) onSelect(manual.trim());
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(stripUnsafe(e.target.value))}
            placeholder="Player missing? Type the name…"
            maxLength={50}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-charcoal border border-gunmetal rounded-lg px-3 py-2 text-sm text-cloud placeholder:text-steel focus:border-nebula focus:outline-none"
          />
          <button
            type="submit"
            disabled={!manual.trim()}
            className="shrink-0 bg-jupiter-gradient text-space font-display font-bold text-sm px-3.5 py-2 rounded-lg disabled:opacity-40"
          >
            Use
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
