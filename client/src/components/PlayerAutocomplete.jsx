import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

// Strip HTML-injection characters (`<` `>`) so an XSS payload can't even be typed
// into the field. The server rejects them too; this is the first line of defense.
const stripUnsafe = (s) => (s || '').replace(/[<>]/g, '');

// Combobox for player names (award picks + match picks). Debounced search against
// /api/players. Free text is always allowed (in case of late call-ups / spelling
// variants) — the dropdown is an assist, not a hard constraint. Pass `teams`
// (array of team names) to narrow suggestions to a specific match.
export default function PlayerAutocomplete({
  value,
  onChange,
  teams,
  placeholder = 'Start typing a player…',
  disabled,
  className,
  inputId,
}) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  // Whether the current text corresponds to a known player. Starts true so
  // pre-filled values (copied brackets) and empty fields never warn; flips
  // false on edit, then back to true on an exact match or an explicit pick.
  const [verified, setVerified] = useState(true);
  const boxRef = useRef(null);
  const skipRef = useRef(false); // skip the fetch triggered by a programmatic select
  const teamParam = Array.isArray(teams) ? teams.filter(Boolean).join(',') : teams || '';

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    if (!open) return;
    const q = (value || '').trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.players(q, teamParam);
        if (!cancelled) {
          const players = r.players || [];
          setItems(players);
          setActive(-1);
          // If what they typed exactly matches a real player, treat it as valid.
          const ql = q.toLowerCase();
          if (players.some((p) => (p.name || '').trim().toLowerCase() === ql)) {
            setVerified(true);
          }
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, open, teamParam]);

  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function select(name) {
    skipRef.current = true;
    onChange(stripUnsafe(name));
    setItems([]);
    setOpen(false);
    setActive(-1);
    setVerified(true);
  }

  function onKeyDown(e) {
    if (!open || items.length === 0) {
      if (e.key === 'ArrowDown' && (value || '').trim().length >= 2) setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (active >= 0) {
        e.preventDefault();
        select(items[active].name);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        id={inputId}
        value={value}
        onChange={(e) => {
          onChange(stripUnsafe(e.target.value));
          setOpen(true);
          setVerified(false);
        }}
        onFocus={() => {
          if ((value || '').trim().length >= 2) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        maxLength={50}
        className={className}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && (items.length > 0 || loading) && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-60 overflow-auto bg-meteorite border border-charcoal rounded-lg shadow-2xl py-1">
          {loading && items.length === 0 && (
            <li className="px-3 py-2 text-xs text-steel">Searching…</li>
          )}
          {items.map((p, i) => (
            <li key={`${p.name}-${p.team}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(p.name);
                }}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 ${
                  i === active ? 'bg-charcoal' : ''
                } hover:bg-charcoal`}
              >
                <span className="text-cloud truncate">{p.name}</span>
                <span className="text-[11px] text-steel whitespace-nowrap shrink-0">
                  {p.position ? `${p.position} · ` : ''}
                  {p.team}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(value || '').trim().length >= 2 && !verified && !loading && items.length === 0 && (
        <p className="mt-1 text-[11px] text-amber-400/90">
          No player found by that name — double-check the spelling (you can still submit).
        </p>
      )}
    </div>
  );
}
