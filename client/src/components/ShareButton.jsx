import { useState } from 'react';
import { api } from '../lib/api.js';

// Image-first share control. Clicking opens a popover that PREVIEWS the card and
// lets you Download the PNG, Copy the image to the clipboard (paste straight into
// a post), or Share it via the native sheet (attaches the PNG on mobile). The
// goal is "grab a nice image to post" — not "copy a link". Nothing here rewards
// sharing; analytics logging is best-effort only.
function appendRef(url, slug) {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('ref', slug);
    return u.toString();
  } catch {
    return url + (url.includes('?') ? '&' : '?') + 'ref=' + encodeURIComponent(slug);
  }
}

export default function ShareButton({
  url,
  title,
  text,
  artifact,
  handle,
  imageUrl,
  downloadName = 'wc2026.png',
  label = 'Get shareable image',
  variant = 'button',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const canCopy =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof window !== 'undefined' &&
    'ClipboardItem' in window;

  function logQuietly() {
    try {
      api.logShare({ artifact, handle });
    } catch {
      /* analytics is best-effort */
    }
  }

  async function getBlob() {
    const res = await fetch(imageUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('image fetch failed');
    return res.blob();
  }

  async function onDownload() {
    setBusy('download');
    setNote('');
    try {
      const blob = await getBlob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 3000);
      logQuietly();
      setNote('Saved. Attach it to your post.');
    } catch {
      setNote('Could not generate the image — try again.');
    } finally {
      setBusy('');
    }
  }

  async function onCopy() {
    setBusy('copy');
    setNote('');
    try {
      // Pass the blob promise to ClipboardItem (Safari-friendly, keeps the gesture).
      const item = new window.ClipboardItem({ 'image/png': getBlob() });
      await navigator.clipboard.write([item]);
      logQuietly();
      setNote('Image copied — paste it into your post.');
    } catch {
      setNote('Copy not supported here — use Download instead.');
    } finally {
      setBusy('');
    }
  }

  async function onShare() {
    setBusy('share');
    setNote('');
    try {
      let shareUrl = url;
      try {
        const r = await api.logShare({ artifact, handle });
        if (r && r.slug) shareUrl = appendRef(url, r.slug);
      } catch {
        /* ignore */
      }
      const blob = await getBlob();
      const file = new File([blob], downloadName, { type: blob.type || 'image/png' });
      const payload = { files: [file], title, text };
      if (navigator.canShare && navigator.canShare(payload)) await navigator.share(payload);
      else await navigator.share({ title, text, url: shareUrl });
    } catch (e) {
      if (e && e.name !== 'AbortError') setNote('Share failed — use Download or Copy.');
    } finally {
      setBusy('');
    }
  }

  const trigger =
    variant === 'icon' ? (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Get shareable image"
        className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-charcoal text-steel hover:border-nebula hover:text-nebula transition"
      >
        <ShareIcon />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded inline-flex items-center gap-2"
      >
        <ShareIcon />
        {label}
      </button>
    );

  return (
    <div className={`relative inline-block ${className}`}>
      {trigger}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-2 right-0 w-[300px] bg-meteorite border border-charcoal rounded-xl shadow-2xl p-3">
            <img
              src={imageUrl}
              alt="Shareable card"
              width={1200}
              height={630}
              className="w-full rounded-lg border border-charcoal mb-3"
            />
            <button
              type="button"
              onClick={onDownload}
              disabled={busy === 'download'}
              className="w-full bg-jupiter-gradient text-space font-display font-bold px-3 py-2 rounded text-sm disabled:opacity-50"
            >
              {busy === 'download' ? 'Preparing…' : 'Download PNG'}
            </button>
            <div className="flex gap-2 mt-2">
              {canCopy && (
                <button
                  type="button"
                  onClick={onCopy}
                  disabled={busy === 'copy'}
                  className="flex-1 bg-charcoal border border-gunmetal text-cloud px-3 py-2 rounded text-sm hover:border-nebula disabled:opacity-50"
                >
                  {busy === 'copy' ? '…' : 'Copy image'}
                </button>
              )}
              {canNativeShare && (
                <button
                  type="button"
                  onClick={onShare}
                  disabled={busy === 'share'}
                  className="flex-1 bg-charcoal border border-gunmetal text-cloud px-3 py-2 rounded text-sm hover:border-nebula disabled:opacity-50"
                >
                  {busy === 'share' ? '…' : 'Share'}
                </button>
              )}
            </div>
            <div className="text-[11px] text-steel mt-2 leading-snug">
              {note || 'Download or copy the image, then attach it to your X / Telegram / Discord post.'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <polyline points="8 8 12 4 16 8" />
      <line x1="12" y1="4" x2="12" y2="16" />
    </svg>
  );
}
