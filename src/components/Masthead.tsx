import type { Session } from '../api/auth';

export type View = 'plan' | 'orders';

interface Props {
  session: Session | null;
  view: View;
  onView: (view: View) => void;
  onSignOut: () => void;
}

export default function Masthead({ session, view, onView, onSignOut }: Props) {
  return (
    <header className="masthead">
      <a className="brand" href="/" aria-label="Tuckshop home">
        <img className="brand__mark" src="/favicon.svg" alt="" />
        <span className="brand__name">tuckshop</span>
      </a>
      {session && (
        <nav className="masthead__nav" aria-label="Sections">
          <button
            type="button"
            className="chip"
            aria-pressed={view === 'plan'}
            onClick={() => onView('plan')}
          >
            Plan lunches
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={view === 'orders'}
            onClick={() => onView('orders')}
          >
            Upcoming orders
          </button>
          <span className="masthead__user">{session.email}</span>
          <button type="button" className="link-button" onClick={onSignOut}>
            Sign out
          </button>
        </nav>
      )}
    </header>
  );
}
