import { api } from '../lib/api.js';

function appendRef(url, slug) {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('ref', slug);
    return u.toString();
  } catch {
    return url + (url.includes('?') ? '&' : '?') + 'ref=' + encodeURIComponent(slug);
  }
}

async function fetchImageFile(imageUrl, name) {
  const res = await fetch(imageUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const blob = await res.blob();
  return new File([blob], name || 'wc2026-card.png', { type: blob.type || 'image/png' });
}

// share() logs an analytics-only ShareEvent and appends ?ref=<slug> to the URL
// (this grants NOTHING — reach/status only), then shares via the Web Share API.
//
// Preference order:
//   1. Web Share *with the card image attached* (Level 2 `files`) — the share
//      sheet shows the actual card and recipients get the PNG. The link is
//      embedded in the text so it still drives traffic + unfurls.
//   2. Link-only Web Share (the link unfurls into the card on the recipient's
//      platform anyway).
//   3. { method:'fallback' } so the caller can show X-intent / copy / download.
export function useShare() {
  async function share({ url, title, text, artifact, handle, imageUrl, downloadName }) {
    const canNativeFiles =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function';
    const wantFile = !!imageUrl && canNativeFiles;

    // Prep analytics + image in parallel to stay inside the click's
    // user-activation window before calling navigator.share().
    const [logRes, fileRes] = await Promise.allSettled([
      api.logShare({ artifact, handle }),
      wantFile ? fetchImageFile(imageUrl, downloadName) : Promise.resolve(null),
    ]);

    let shareUrl = url;
    if (logRes.status === 'fulfilled' && logRes.value && logRes.value.slug) {
      shareUrl = appendRef(url, logRes.value.slug);
    }
    const file = fileRes.status === 'fulfilled' ? fileRes.value : null;

    // 1) Share the card image + link.
    if (file && canNativeFiles) {
      const payload = { files: [file], title, text: text ? `${text} ${shareUrl}` : shareUrl };
      try {
        if (navigator.canShare(payload)) {
          await navigator.share(payload);
          return { ok: true, method: 'native', url: shareUrl };
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, method: 'cancelled', url: shareUrl };
        // otherwise fall through to a link-only share
      }
    }

    // 2) Link-only Web Share.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return { ok: true, method: 'native', url: shareUrl };
      } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, method: 'cancelled', url: shareUrl };
      }
    }

    // 3) Desktop fallback menu.
    return { ok: true, method: 'fallback', url: shareUrl };
  }

  return { share };
}
