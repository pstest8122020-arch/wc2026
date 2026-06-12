import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Slim right-to-left news ticker (marquee) that sits at the very top of the home
// page. Items are fetched from our own /api/news (Guardian proxy) and rendered
// twice inside .news-track so the loop is seamless (see index.css). Plain text
// only — React escapes it — and the whole bar hides if the feed is unavailable.
export default function NewsFeed() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .news()
      .then((r) => alive && setItems(Array.isArray(r.items) ? r.items : []))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!items || items.length === 0) return null;

  // Duplicate so the -50% marquee loops with no gap.
  const loop = [...items, ...items];

  return (
    <div className="news-ticker relative overflow-hidden bg-charcoal border-b border-gunmetal">
      {/* Fixed brand label on the left; scrolling items pass behind it. */}
      <div className="absolute left-0 inset-y-0 z-20 flex items-center px-3 bg-charcoal border-r border-gunmetal">
        <span className="text-[10px] font-display font-extrabold uppercase tracking-[0.18em] bg-jupiter-gradient bg-clip-text text-transparent">
          News
        </span>
      </div>
      {/* Edge fade on the right where headlines enter. */}
      <div className="pointer-events-none absolute right-0 inset-y-0 w-12 z-10 bg-gradient-to-l from-charcoal to-transparent" />

      <div className="news-track py-2">
        {loop.map((n, i) => (
          <a
            key={i}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 text-sm whitespace-nowrap shrink-0 text-cloud/85 hover:text-helix transition-colors"
          >
            <span className="text-cosmic text-[8px]" aria-hidden="true">●</span>
            <span>{n.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
