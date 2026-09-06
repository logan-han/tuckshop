import { AuthError, describeAuthError } from './auth';
import { ApiError } from './flexischools';

/** True when the only fix is signing in again. */
export function needsSignIn(error: unknown): boolean {
  if (error instanceof AuthError) return error.code === 'signed_out';
  return error instanceof ApiError && error.status === 401;
}

export function describeError(error: unknown): string {
  if (needsSignIn(error)) return 'Your Flexischools session has expired. Sign in again.';
  if (error instanceof AuthError) return describeAuthError(error);
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Flexischools refused that request for this account.';
    if (error.status >= 500)
      return 'Flexischools is having trouble right now. Try again in a minute.';
    return `Flexischools returned an unexpected ${error.status} response.`;
  }
  if (error instanceof TypeError)
    return 'Could not reach Flexischools. Check your connection and try again.';
  return error instanceof Error ? error.message : String(error);
}
