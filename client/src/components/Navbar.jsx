import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, discordLoginUrl } from '../hooks/useAuth.js';

// Header in the community.jup.ag hub language: h-14 sticky bar with backdrop blur,
// "Jupiter | World Cup" brand block, pill-highlighted nav, lime primary auth CTA.

const links = [
  { to: '/', label: 'Bracket', end: true },
  { to: '/picks', label: 'Match picks' },
  { to: '/my-picks', label: 'My Picks' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/rules', label: 'Rules' },
];

function AuthControl({ auth, onAction }) {
  if (!auth.configured || auth.loading) return null;
  if (auth.loggedIn) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-cloud/70 max-w-[9rem] truncate">@{auth.handle}</span>
        <button
          type="button"
          onClick={() => {
            auth.logout();
            onAction?.();
          }}
          className="text-xs font-semibold text-cloud/80 hover:text-cloud border border-charcoal bg-meteorite/60 hover:bg-meteorite rounded-xl px-3 py-2 transition whitespace-nowrap"
        >
          Log out
        </button>
      </div>
    );
  }
  return (
    <a
      href={discordLoginUrl()}
      className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold bg-venus text-space hover:bg-venus/90 rounded-xl px-3.5 py-2 transition whitespace-nowrap"
    >
      Log in with Discord
    </a>
  );
}

export default function Navbar() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  const linkCls = ({ isActive }) =>
    `whitespace-nowrap px-3 sm:px-3.5 py-2 rounded-lg transition font-medium text-xs sm:text-sm ${
      isActive ? 'bg-white/5 text-cloud' : 'text-cloud/70 hover:bg-white/5 hover:text-cloud'
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-charcoal/70 bg-space/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 h-14 flex items-center justify-between gap-3 sm:gap-4">
        <NavLink to="/" className="flex items-center shrink-0 min-w-0">
          <img
            src="/header-logo.png"
            alt=""
            width={28}
            height={28}
            className="w-7 h-7 object-contain"
          />
          <span className="ml-2 font-bold text-cloud text-base tracking-tight">Jupiter</span>
          <span className="ml-3 hidden sm:inline border-l border-gunmetal pl-3 text-sm font-medium text-cloud/70 whitespace-nowrap">
            World Cup
          </span>
        </NavLink>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={linkCls}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden md:block shrink-0">
          <AuthControl auth={auth} />
        </div>

        {/* Mobile burger */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="md:hidden shrink-0 p-2 -mr-1.5 text-cloud hover:text-venus transition"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-charcoal/70 bg-space/95 backdrop-blur-md px-4 py-3 space-y-1">
          {links.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block rounded-xl px-4 py-3 text-base font-medium ${
                  isActive ? 'bg-white/5 text-cloud' : 'text-cloud/80 hover:bg-white/5'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
          {auth.configured && !auth.loading && (
            <div className="pt-3 mt-2 border-t border-charcoal/70">
              <AuthControl auth={auth} onAction={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}
    </header>
  );
}
