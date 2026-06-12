import { flagImgUrl, isoForCountry } from '../lib/flags.js';

// Renders a flag + the team name.
//
// Flags are self-hosted SVGs (Untitled UI's rectangle set, normalized to 3:2).
// We render every flag inside a fixed-size box with object-fit:cover, so all
// flags occupy exactly the same width and height regardless of the source
// aspect ratio — never the old "wide Qatar vs square Switzerland" mismatch.
// We use images (not Unicode emoji) because Windows renders flag emoji as
// letters ("MX") instead of the flag.

export default function TeamName({ name, size = 16, compact = false, className = '' }) {
  if (!name || name === 'TBD') {
    return <span className={className}>{name || 'TBD'}</span>;
  }

  const iso = isoForCountry(name);
  const imgUrl = iso ? flagImgUrl(name) : null;
  const h = Math.round(size * 0.78);
  const w = Math.round(h * 1.5); // 3:2 — matches the flag aspect ratio

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {imgUrl && (
        <img
          src={imgUrl}
          alt=""
          aria-hidden="true"
          className="inline-block shrink-0 rounded-[2px] object-cover ring-1 ring-inset ring-white/10"
          style={{ width: `${w}px`, height: `${h}px` }}
        />
      )}
      <span className={compact ? 'truncate' : ''}>{name}</span>
    </span>
  );
}
