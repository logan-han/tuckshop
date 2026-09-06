import {
  AuthError,
  clearSession,
  decodeClaims,
  describeAuthError,
  getIdToken,
  loadSession,
  refreshSession,
  saveSession,
  signIn,
  type Session,
} from './auth';

function jwt(claims: Record<string, unknown>): string {
  // Cognito base64url-encodes the UTF-8 bytes of the JSON, so the helper must too.
  const encode = (value: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.sig`;
}

const fetchMock = vi.fn();

beforeEach(() => {
  clearSession();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function cognitoOk(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('signIn', () => {
  it('runs USER_PASSWORD_AUTH and stores the session', async () => {
    const idToken = jwt({
      exp: 1_800_000_000,
      email: 'p@example.com',
      given_name: 'Pat',
      'custom:toca_user_key': 'user-key',
    });
    fetchMock.mockResolvedValueOnce(
      cognitoOk({
        AuthenticationResult: {
          IdToken: idToken,
          AccessToken: 'access',
          RefreshToken: 'refresh',
          ExpiresIn: 3600,
        },
      }),
    );

    const session = await signIn(' p@example.com ', 'secret');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cognito-idp.ap-southeast-2.amazonaws.com/');
    expect(init.headers['x-amz-target']).toBe('AWSCognitoIdentityProviderService.InitiateAuth');
    expect(JSON.parse(init.body)).toEqual({
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: 'p@example.com', PASSWORD: 'secret' },
      ClientId: '1g1a80gfo3ovuq75c8fqjrg3ma',
    });
    expect(session).toMatchObject({
      email: 'p@example.com',
      givenName: 'Pat',
      userKey: 'user-key',
      expiresAt: 1_800_000_000_000,
    });
    expect(loadSession()).toEqual(session);
  });

  it('turns Cognito errors into friendly messages', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          __type: 'NotAuthorizedException',
          message: 'Incorrect username or password.',
        }),
        { status: 400 },
      ),
    );
    const error = await signIn('p@example.com', 'wrong').catch((e) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe('NotAuthorizedException');
    expect(describeAuthError(error)).toMatch(/do not match/);
    expect(loadSession()).toBeNull();
  });

  it('refuses challenge flows it cannot complete', async () => {
    fetchMock.mockResolvedValueOnce(
      cognitoOk({ ChallengeName: 'SMS_MFA', ChallengeParameters: {} }),
    );
    await expect(signIn('p@example.com', 'secret')).rejects.toMatchObject({ code: 'challenge' });
    expect(describeAuthError(new TypeError('Failed to fetch'))).toMatch(/Could not reach/);
    expect(describeAuthError(new Error('odd'))).toBe('odd');
  });
});

describe('getIdToken', () => {
  const session: Session = {
    idToken: jwt({ exp: 2_000_000 }),
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: 2_000_000_000,
    email: 'p@example.com',
    givenName: 'Pat',
    userKey: 'k',
  };

  it('returns the stored token while it is fresh', async () => {
    saveSession(session);
    await expect(getIdToken(1_000_000_000)).resolves.toBe(session.idToken);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes once when the token is about to expire, even under concurrent calls', async () => {
    saveSession(session);
    const newId = jwt({ exp: 3_000_000, email: 'p@example.com' });
    fetchMock.mockResolvedValueOnce(
      cognitoOk({ AuthenticationResult: { IdToken: newId, AccessToken: 'a2', ExpiresIn: 3600 } }),
    );

    const [first, second] = await Promise.all([
      getIdToken(1_999_990_000),
      getIdToken(1_999_990_000),
    ]);

    expect(first).toBe(newId);
    expect(second).toBe(newId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: 'r' },
    });
    expect(loadSession()).toMatchObject({
      idToken: newId,
      refreshToken: 'r',
      expiresAt: 3_000_000_000,
    });
  });

  it('throws signed_out with no session or a dead refresh token', async () => {
    await expect(getIdToken()).rejects.toMatchObject({ code: 'signed_out' });
    saveSession(session);
    fetchMock.mockResolvedValueOnce(cognitoOk({ ChallengeName: 'NEW_PASSWORD_REQUIRED' }));
    await expect(refreshSession(session)).rejects.toMatchObject({ code: 'signed_out' });
  });
});

describe('decodeClaims', () => {
  it('decodes base64url payloads with non-ASCII text', () => {
    const token = jwt({ exp: 1, given_name: 'Zoë' });
    expect(decodeClaims(token)).toEqual({ exp: 1, given_name: 'Zoë' });
  });
});
