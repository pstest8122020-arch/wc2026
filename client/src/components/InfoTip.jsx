import { useState, useRef, useEffect } from 'react';

// Small "(i)" affordance that reveals a short description.
// Desktop: shows on hover. Touch: tap toggles it. Closes on outside-tap / Esc.
// Sits inline next to a label (inline-flex), grows rightward so it never clips
// off the left edge on a phone.
export default function InfoTip({ text, label = 'What is this?' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          // Inside a <label>, stop the click from focusing the field.
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-steel/60 text-[10px] font-bold leading-none text-steel transition hover:border-nebula hover:text-nebula focus:outline-none focus:ring-2 focus:ring-helix/40"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-50 mb-2 w-48 max-w-[70vw] rounded-lg border border-steel/30 bg-gunmetal px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-cloud shadow-xl"
        >
          {text}
          <span className="absolute left-2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-steel/30 bg-gunmetal" />
        </span>
      )}
    </span>
  );
}
