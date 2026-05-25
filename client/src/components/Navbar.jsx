import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/bracket', label: 'Bracket' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/submit', label: 'Submit' },
  { to: '/my-picks', label: 'My Picks' },
  { to: '/picks', label: 'Match Picks' },
];

export default function Navbar() {
  return (
    <header className="bg-meteorite border-b border-charcoal">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
        <NavLink to="/" className="font-display font-extrabold tracking-tight text-cloud leading-tight">
          <span className="block text-base">
            <span className="bg-jupiter-gradient bg-clip-text text-transparent">Jupiter</span>{' '}
            Community Predictor Challenge
          </span>
          <span className="block text-[10px] text-steel font-sans font-medium uppercase tracking-widest">
            WC 2026 Edition
          </span>
        </NavLink>
        <nav className="flex flex-wrap gap-1 text-sm ml-auto">
          {links.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded transition font-medium ${
                  isActive
                    ? 'bg-nebula text-space'
                    : 'text-cloud hover:bg-charcoal'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
