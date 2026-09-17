import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '../api/auth';
import Masthead from './Masthead';

const session: Session = {
  idToken: 'id',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 3_600_000,
  email: 'parent@example.com',
  givenName: 'Alex',
  userKey: 'user-1',
};

describe('Masthead', () => {
  it('shows nothing but the brand until someone is signed in', () => {
    render(<Masthead session={null} view="plan" onView={() => {}} onSignOut={() => {}} />);
    expect(screen.getByRole('link', { name: 'Tuckshop home' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument();
  });

  it('marks the current section and switches between them', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const onSignOut = vi.fn();
    render(<Masthead session={session} view="orders" onView={onView} onSignOut={onSignOut} />);

    expect(screen.getByText('parent@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upcoming orders' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Plan lunches' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Plan lunches' }));
    expect(onView).toHaveBeenCalledWith('plan');
    await user.click(screen.getByRole('button', { name: 'Upcoming orders' }));
    expect(onView).toHaveBeenCalledWith('orders');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
