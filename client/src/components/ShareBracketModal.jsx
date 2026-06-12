import ShareableBracket from './ShareableBracket.jsx';
import ShareImageModal from './ShareImageModal.jsx';

// "Share your bracket" modal (My Picks) — thin wrapper over the shared ShareImageModal,
// rendering the group-stage bracket card. Same popup mechanics as everywhere else.
export default function ShareBracketModal({ data, onClose }) {
  const safeName = (data?.discord || 'bracket').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const preds = (data?.score_predictions || []).length;
  return (
    <ShareImageModal
      title="Share your bracket"
      chips={['Group Stage', `${preds} predictions`]}
      filename={`wc2026-bracket-${safeName}.png`}
      shareTitle="WC 2026 bracket"
      shareText="My WC 2026 bracket is locked in for the Jupiter Community Predictor Challenge. Predict every match and win a share of the prize pool."
      previewAspect="12 / 13"
      note="X won't auto-attach the image. Post to X copies your bracket, so just paste it (⌘/Ctrl+V) into the draft."
      card={<ShareableBracket data={data} />}
      onClose={onClose}
    />
  );
}
