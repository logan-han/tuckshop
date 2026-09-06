// Sign-in against the Cognito user pool the Flexischools portals use. The portal's own
// client id is public (it ships in their JS bundle) and the pool allows the plain
// USER_PASSWORD_AUTH flow, so no SRP dance is needed. Tokens live in sessionStorage, or in
// localStorage when the person asks to stay signed in; the password itself is never kept.

const COGNITO_URL = 'https://cognito-idp.ap-southeast-2.amazonaws.com/';
export const COGNITO_CLIENT_ID = '1g1a80gfo3ovuq75c8fqjrg3ma';
const STORAGE_KEY = 'tuckshop.session';
const EMAIL_KEY = 'tuckshop.email';
const REFRESH_MARGIN_MS = 60_000;

export interface Session {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the id token stops being accepted. */
  expiresAt: number;
  email: string;
  givenName: string;
  /** Flexischools' own user key (custom:toca_user_key), used by the GraphQL BFF. */
  userKey: string;
  /** Survive closing the tab (localStorage) rather than ending with it (sessionStorage). */
  remember?: boolean;
}

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const FRIENDLY: Record<string, string> = {
  NotAuthorizedException: 'That email and password do not match a Flexischools account.',
  UserNotFoundException: 'That email and password do not match a Flexischools account.',
  PasswordResetRequiredException:
    'Flexischools needs you to reset this password first. Use "I forgot my password" on their login page.',
  UserNotConfirmedException: 'This Flexischools account has not been verified yet.',
  TooManyRequestsException: 'Too many attempts. Wait a minute and try again.',
  LimitExceededException: 'Too many attempts. Wait a minute and try again.',
  InvalidParameterException: 'Enter the email and password you use for Flexischools.',
  signed_out: 'You are signed out.',
  challenge: 'This account needs an extra sign-in step that only the Flexischools app supports.',
  network: 'Could not reach Flexischools. Check your connection and try again.',
};

export function describeAuthError(error: unknown): string {
  if (error instanceof AuthError) return FRIENDLY[error.code] ?? error.message;
  if (error instanceof TypeError) return FRIENDLY.network;
  return error instanceof Error ? error.message : String(error);
}

interface CognitoAuthResult {
  IdToken?: string;
  AccessToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
}

interface CognitoResponse {
  AuthenticationResult?: CognitoAuthResult;
  ChallengeName?: string;
  __type?: string;
  message?: string;
}

async function cognito(target: string, body: Record<string, unknown>): Promise<CognitoResponse> {
  const response = await fetch(COGNITO_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as CognitoResponse;
  if (!response.ok) {
    const type = (data.__type ?? 'UnknownError').split('#').pop() ?? 'UnknownError';
    throw new AuthError(type, data.message ?? `Cognito ${target} failed (${response.status})`);
  }
  return data;
}

interface IdTokenClaims {
  exp: number;
  email?: string;
  given_name?: string;
  'custom:toca_user_key'?: string;
}

export function decodeClaims(jwt: string): IdTokenClaims {
  const payload = jwt.split('.')[1] ?? '';
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as IdTokenClaims;
}

function toSession(result: CognitoAuthResult, refreshToken: string, remember: boolean): Session {
  if (!result.IdToken || !result.AccessToken) {
    throw new AuthError('UnknownError', 'Flexischools did not return a session.');
  }
  const claims = decodeClaims(result.IdToken);
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken,
    expiresAt: claims.exp * 1000,
    email: claims.email ?? '',
    givenName: claims.given_name ?? '',
    userKey: claims['custom:toca_user_key'] ?? '',
    remember,
  };
}

export async function signIn(email: string, password: string, remember = false): Promise<Session> {
  const data = await cognito('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: email.trim(), PASSWORD: password },
    ClientId: COGNITO_CLIENT_ID,
  });
  if (data.ChallengeName || !data.AuthenticationResult?.RefreshToken) {
    throw new AuthError(
      'challenge',
      `Unsupported sign-in challenge: ${data.ChallengeName ?? 'unknown'}`,
    );
  }
  const session = toSession(
    data.AuthenticationResult,
    data.AuthenticationResult.RefreshToken,
    remember,
  );
  saveSession(session);
  rememberEmail(remember ? session.email : null);
  return session;
}

export async function refreshSession(current: Session): Promise<Session> {
  const data = await cognito('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    AuthParameters: { REFRESH_TOKEN: current.refreshToken },
    ClientId: COGNITO_CLIENT_ID,
  });
  if (!data.AuthenticationResult) {
    throw new AuthError('signed_out', 'Your Flexischools session has expired. Sign in again.');
  }
  const session = toSession(data.AuthenticationResult, current.refreshToken, !!current.remember);
  saveSession(session);
  return session;
}

function stores(): Storage[] {
  const found: Storage[] = [];
  for (const name of ['sessionStorage', 'localStorage'] as const) {
    try {
      const store = window[name];
      if (store) found.push(store);
    } catch {
      // blocked storage is simply skipped
    }
  }
  return found;
}

function storeFor(remember: boolean): Storage | undefined {
  try {
    return remember ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function loadSession(): Session | null {
  for (const store of stores()) {
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Session;
    } catch {
      // unreadable entry; try the next store
    }
  }
  return null;
}

export function saveSession(session: Session): void {
  clearSession();
  try {
    storeFor(!!session.remember)?.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode or storage disabled: the session simply lives for this page load.
  }
}

export function clearSession(): void {
  for (const store of stores()) {
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clear
    }
  }
}

/** The email to prefill on the sign-in form, kept only when "keep me signed in" was ticked. */
export function rememberedEmail(): string {
  try {
    return window.localStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberEmail(email: string | null): void {
  try {
    if (email) window.localStorage.setItem(EMAIL_KEY, email);
    else window.localStorage.removeItem(EMAIL_KEY);
  } catch {
    // not remembered, nothing lost
  }
}

let refreshing: Promise<Session> | null = null;

/** The id token to send to Flexischools, refreshed first if it is about to expire. */
export async function getIdToken(now: number = Date.now()): Promise<string> {
  const session = loadSession();
  if (!session) throw new AuthError('signed_out', 'You are signed out.');
  if (session.expiresAt - REFRESH_MARGIN_MS > now) return session.idToken;
  refreshing ??= refreshSession(session).finally(() => {
    refreshing = null;
  });
  const refreshed = await refreshing;
  return refreshed.idToken;
}
