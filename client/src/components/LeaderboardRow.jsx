export default function LeaderboardRow({ row, highlight }) {
  const rowBg =
    row.rank === 1
      ? 'bg-cosmic/10'
      : row.rank === 2
        ? 'bg-cloud/5'
        : row.rank === 3
          ? 'bg-venus/10'
          : '';

  return (
    <tr className={`${rowBg} ${highlight ? 'ring-2 ring-nebula' : ''} hover:bg-charcoal/50`}>
      <td className="px-3 py-2 font-display font-bold text-cloud">{row.rank}</td>
      <td className="px-3 py-2 font-medium text-cloud">{row.discord}</td>
      <td className="px-3 py-2 text-right tabular-nums text-cloud/80">{row.score_pts}</td>
      <td className="px-3 py-2 text-right tabular-nums text-cloud/80">{row.player_pts}</td>
      <td className="px-3 py-2 text-right tabular-nums text-cloud/80">{row.award_pts}</td>
      <td className="px-3 py-2 text-right tabular-nums font-display font-bold text-helix">{row.total}</td>
      <td className="px-3 py-2 text-right tabular-nums text-cosmic">
        {row.prize > 0 ? `$${row.prize}` : <span className="text-steel">—</span>}
      </td>
    </tr>
  );
}
