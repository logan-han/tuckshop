import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthError, rememberedEmail, signIn, type Session } from '../api/auth';
import SignIn from './SignIn';

vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  signIn: vi.fn(),
  rememberedEmail: vi.fn(),
}));

const attempt = vi.mocked(signIn);
const remembered = vi.mocked(rememberedEmail);

const session: Session = {
  idToken: 'id',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 3_600_000,
  email: 'parent@example.com',
  givenName: 'Alex',
  userKey: 'user-1',
};

beforeEach(() => {
  attempt.mockReset();
  remembered.mockReset();
  remembered.mockReturnValue('');
  attempt.mockResolvedValue(session);
});

describe('SignIn', () => {
  it('signs in with the email, password and the stay-signed-in choice', async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    render(<SignIn onSignedIn={onSignedIn} />);

    const stay = screen.getByRole('checkbox', { name: 'Keep me signed in on this device' });
    expect(stay).toBeChecked();
    await user.click(stay);

    await user.type(screen.getByLabelText('Email'), 'parent@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(attempt).toHaveBeenCalledWith('parent@example.com', 'secret', false);
    expect(onSignedIn).toHaveBeenCalledWith(session);
  });

  it('starts from the email that was used last time', () => {
    remembered.mockReturnValue('parent@example.com');
    render(<SignIn onSignedIn={() => {}} />);
    expect(screen.getByLabelText('Email')).toHaveValue('parent@example.com');
  });

  it('keeps the form usable when Flexischools turns the sign-in down', async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    attempt.mockRejectedValue(new AuthError('NotAuthorizedException', 'no'));
    render(<SignIn onSignedIn={onSignedIn} />);

    await user.type(screen.getByLabelText('Email'), 'parent@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password do not match a Flexischools account.',
    );
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});
