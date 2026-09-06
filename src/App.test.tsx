import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { clearSession } from './api/auth';

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.sig`;
}

const student = {
  studentKey: 'student-1',
  studentId: 1,
  isClassValid: true,
  studentFirstName: 'Sam',
  studentLastName: 'Example',
  schoolKey: 'school-1',
  schoolName: 'Example Grammar',
  schoolSiteKey: 'site-1',
  services: [
    {
      supplierServiceKey: 'lunch',
      supplierServiceName: 'Lunch',
      supplierKey: 'canteen',
      supplierSiteKey: 'canteen-site',
      supplierSiteTimeRegionKey: 'melbourne',
    },
  ],
};

const fetchMock = vi.fn();

function respond(url: string): Response {
  if (url.startsWith('https://cognito-idp')) {
    return new Response(
      JSON.stringify({
        AuthenticationResult: {
          IdToken: jwt({ exp: Math.floor(Date.now() / 1000) + 3600, email: 'parent@example.com' }),
          AccessToken: 'a',
          RefreshToken: 'r',
          ExpiresIn: 3600,
        },
      }),
    );
  }
  if (url.endsWith('/service-categories/1/students'))
    return new Response(JSON.stringify([student]));
  if (url.endsWith('/payments/user-account')) {
    return new Response(
      JSON.stringify({ accountKey: 'a', availableBalance: 12.44, topUpAmountOptions: [] }),
    );
  }
  if (url.endsWith('/available-services')) {
    return new Response(
      JSON.stringify([
        {
          supplierServiceKey: 'lunch',
          serviceName: 'Lunch',
          cutOffTime: '2036-10-06T08:30:00',
          nextOrderFulfillmentDate: '2036-10-06T12:40:00',
          description: 'Order by 8.30am',
          supplierKey: 'canteen',
          schoolKey: 'school-1',
          supplierDistributionTimeKey: 'dist',
        },
      ]),
    );
  }
  if (url.endsWith('/orderfee')) return new Response(JSON.stringify({ fee: 0.33, feeTax: 0.03 }));
  return new Response('not mocked', { status: 500 });
}

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: RequestInfo | URL) =>
    Promise.resolve(respond(input.toString())),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('starts on the sign-in screen', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /every Thursday/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument();
  });

  it('signs in and skips straight to choosing days for a single student', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Email'), 'parent@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Which days?' })).toBeInTheDocument();
    const bag = screen.getByRole('complementary', { name: 'Your lunch order so far' });
    expect(bag).toHaveTextContent('Sam');
    expect(bag).toHaveTextContent('Lunch');
    expect(screen.getByRole('button', { name: 'Thursday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Choose the food' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
    expect(window.sessionStorage.getItem('tuckshop.session')).toBeNull();
  });
});
