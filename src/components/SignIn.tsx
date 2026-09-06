import { useState, type FormEvent } from 'react';
import { describeAuthError, signIn, type Session } from '../api/auth';

interface Props {
  onSignedIn: (session: Session) => void;
}

export default function SignIn({ onSignedIn }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await signIn(email, password));
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="signin">
      <div className="signin__intro">
        <h1 className="title">The same lunch, every Thursday, for the whole term.</h1>
        <ul className="signin__points">
          <li>Pick the days of the week and the term dates.</li>
          <li>Pick anything from the canteen menu, options and all.</li>
          <li>
            Every date is checked for closures, cut-offs, sold-out items and lunches you already
            ordered.
          </li>
          <li>
            One tap places every order through your Flexischools account. Cancel any of them here
            too.
          </li>
        </ul>
      </div>
      <form className="signin__form" onSubmit={submit} aria-labelledby="signin-title">
        <h2 id="signin-title" className="step-heading__title" style={{ marginBottom: '1rem' }}>
          Sign in with Flexischools
        </h2>
        <div className="field">
          <label className="field__label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="notice notice--bad" role="alert">
            {error}
          </p>
        )}
        <button className="button button--go" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="hint" style={{ marginTop: '1rem' }}>
          Your email and password go straight from this browser to Flexischools’ own login service
          and nowhere else. Nothing is stored once you close the tab.
        </p>
      </form>
    </section>
  );
}
