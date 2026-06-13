import { cloneElement, useEffect, useRef, useState } from 'react';

// Generic "share an image" popup — the exact mechanics of Jupiter Prediction's
// "Share the slip": render an off-screen card to a PNG with html-to-image, then
// offer Post to X / Share / Copy / Save. Callers pass the off-screen card as
// `card` (a forwardRef element); everything else is parameterised.

const SITE = 'https://jup26wc.com';

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.65l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.16 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v13" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
function SaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function Chip({ children }) {
  return (
    <span className="inline-block text-[10px] font-bold uppercase tracking-[0.14em] text-cosmic border border-cosmic/40 bg-cosmic/10 rounded-full px-2.5 py-1">
      {children}
    </span>
  );
}

export default function ShareImageModal({
  title = 'Share',
  chips = [],
  filename = 'wc2026.png',
  shareTitle = 'WC 2026',
  shareText = '',
  previewAspect = '16 / 10',
  note,
  card,
  onClose,
}) {
  const captureRef = useRef(null);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [status, setStatus] = useState('rendering'); // rendering | ready | error
  const [toast, setToast] = useState('');

  useEffect(() => {
    let alive = true;
    let objUrl;
    (async () => {
      try {
        await new Promise((r) => setTimeout(r, 180)); // let layout settle
        const { toBlob } = await import('html-to-image');
        const b = await toBlob(captureRef.current, { pixelRatio: 2, cacheBust: true, skipFonts: true });
        if (!alive || !b) {
          if (alive) setStatus('error');
          return;
        }
        objUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objUrl);
        setStatus('ready');
      } catch (e) {
        console.error('Share image render failed:', e);
        if (alive) setStatus('error');
      }
    })();
    return () => {
      alive = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1900);
  }

  function save() {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    flash('Saved');
  }

  async function copy() {
    try {
      if (blob && navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        flash('Image copied');
        return;
      }
      throw new Error('clipboard image unsupported');
    } catch {
      try {
        await navigator.clipboard.writeText(SITE);
        flash('Link copied');
      } catch {
        flash('Copy not supported');
      }
    }
  }

  async function share() {
    try {
      const file = blob ? new File([blob], filename, { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: shareTitle, text: `${shareText} ${SITE}` });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url: SITE });
        return;
      }
      await navigator.clipboard.writeText(`${shareText} ${SITE}`);
      flash('Copied to clipboard');
    } catch {
      /* user cancelled — no-op */
    }
  }

  function postToX() {
    // X's tweet intent can't auto-attach media, so copy the image first (best effort,
    // within the click gesture) — the user pastes it into the draft. Then open the composer.
    try {
      if (blob && navigator.clipboard && window.ClipboardItem) {
        navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]).then(
          () => flash('Image copied — paste it into your post'),
          () => {},
        );
      }
    } catch {
      /* best effort */
    }
    const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${shareText} ${SITE}`)}`;
    window.open(u, '_blank', 'noopener,noreferrer');
  }

  const busy = status !== 'ready';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-space border border-charcoal rounded-2xl w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-charcoal shrink-0">
          <div className="font-display font-bold text-cloud text-lg">{title}</div>
          <button onClick={onClose} className="text-steel hover:text-cloud transition p-1 -mr-1" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* chips */}
        {chips.length > 0 && (
          <div className="flex items-center gap-2 px-5 pt-4 flex-wrap shrink-0">
            {chips.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}

        {/* preview */}
        <div className="flex-1 overflow-auto px-5 py-4 min-h-0">
          <div className="rounded-xl overflow-hidden border border-charcoal bg-meteorite">
            {status === 'ready' && url ? (
              <img src={url} alt={title} className="w-full block" />
            ) : status === 'error' ? (
              <div className="flex items-center justify-center text-trifid text-sm px-6 text-center" style={{ aspectRatio: previewAspect }}>
                Could not render the image. Try again, or use a different browser.
              </div>
            ) : (
              <div className="flex items-center justify-center text-steel text-sm" style={{ aspectRatio: previewAspect }}>
                <span className="animate-pulse">Rendering…</span>
              </div>
            )}
          </div>
        </div>

        {/* actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-4 border-t border-charcoal shrink-0">
          <button
            onClick={postToX}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 bg-black border border-gunmetal text-cloud font-display font-bold px-3 py-2.5 rounded-xl hover:border-steel transition disabled:opacity-40"
          >
            <XIcon /> Post to X
          </button>
          <button
            onClick={share}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 bg-charcoal border border-gunmetal text-cloud font-display font-bold px-3 py-2.5 rounded-xl hover:border-nebula transition disabled:opacity-40"
          >
            <ShareIcon /> Share
          </button>
          <button
            onClick={copy}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 bg-charcoal border border-gunmetal text-cloud font-display font-bold px-3 py-2.5 rounded-xl hover:border-nebula transition disabled:opacity-40"
          >
            <CopyIcon /> Copy
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 bg-jupiter-gradient text-space font-display font-bold px-3 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-40"
          >
            <SaveIcon /> Save
          </button>
        </div>

        {note && (
          <p className="px-5 pb-4 -mt-2 text-[11px] leading-snug text-steel text-center shrink-0">{note}</p>
        )}

        {toast && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-24 bg-cloud text-space text-sm font-display font-bold px-4 py-2 rounded-full shadow-lg">
            {toast}
          </div>
        )}
      </div>

      {/* Off-screen full-size card for rasterisation. Uses position:absolute, NOT
          fixed: iOS Safari clamps fixed elements to the visual viewport, so on a
          phone the 1080px card laid out at ~screen width and long player names
          wrapped/overlapped in the export. Absolute positioning lets it lay out
          at its true 1080px regardless of device width. */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: -10000, width: 1080, pointerEvents: 'none', zIndex: -1 }}>
        {card && cloneElement(card, { ref: captureRef })}
      </div>
    </div>
  );
}
