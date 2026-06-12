import { useParams, Link } from 'react-router-dom';
import ShareButton from '../components/ShareButton.jsx';

// A shared "moment" — lead with the card image and make grabbing the PNG the
// primary action (download / copy / share), not a link.
export default function Moment() {
  const { id } = useParams();
  const imageUrl = `/api/og/moment/${encodeURIComponent(id)}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://jup26wc.com';
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-center">
      <div className="text-[10px] uppercase tracking-[0.2em] text-steel font-medium mb-3">
        World Cup 2026 · Shareable moment
      </div>
      <div className="bg-meteorite border border-charcoal rounded-xl p-4 mb-4">
        <img
          src={imageUrl}
          alt="World Cup 2026 prediction moment"
          width={1200}
          height={630}
          className="w-full rounded-lg border border-charcoal"
        />
      </div>
      <div className="flex gap-3 justify-center flex-wrap items-center">
        <ShareButton
          url={`${origin}/m/${id}`}
          title="I called it — WC 2026"
          text="Called it on the World Cup 2026 Predictor."
          artifact="moment"
          imageUrl={imageUrl}
          downloadName={`wc2026-moment-${id}.png`}
          label="Get this image"
        />
        <Link
          to="/submit"
          className="bg-meteorite border border-charcoal text-cloud font-display font-bold px-4 py-2 rounded"
        >
          Make your own predictions →
        </Link>
      </div>
      <div className="text-xs text-steel mt-3">
        Download or copy the image above, then post it on X / Telegram / Discord.
      </div>
    </div>
  );
}
