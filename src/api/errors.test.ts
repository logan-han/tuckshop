import { AuthError } from './auth';
import { describeError, needsSignIn } from './errors';
import { ApiError } from './flexischools';

describe('needsSignIn', () => {
  it('is true only when the session itself is the problem', () => {
    expect(needsSignIn(new AuthError('signed_out', 'You are signed out.'))).toBe(true);
    expect(needsSignIn(new ApiError(401, '', '/api/v1.0/orders'))).toBe(true);

    expect(needsSignIn(new AuthError('NotAuthorizedException', 'wrong password'))).toBe(false);
    expect(needsSignIn(new ApiError(403, '', '/api/v1.0/orders'))).toBe(false);
    expect(needsSignIn(new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('describeError', () => {
  it('asks for a fresh sign-in when the session has gone', () => {
    expect(describeError(new AuthError('signed_out', 'You are signed out.'))).toBe(
      'Your Flexischools session has expired. Sign in again.',
    );
    expect(describeError(new ApiError(401, '', '/api'))).toMatch(/Sign in again/);
  });

  it('hands other auth failures to the Cognito wording', () => {
    expect(describeError(new AuthError('TooManyRequestsException', 'slow down'))).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
  });

  it('separates a refusal, an outage and anything else the API returns', () => {
    expect(describeError(new ApiError(403, '', '/api'))).toBe(
      'Flexischools refused that request for this account.',
    );
    expect(describeError(new ApiError(503, '', '/api'))).toBe(
      'Flexischools is having trouble right now. Try again in a minute.',
    );
    expect(describeError(new ApiError(422, '', '/api'))).toBe(
      'Flexischools returned an unexpected 422 response.',
    );
  });

  it('reads a failed fetch as a connection problem', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe(
      'Could not reach Flexischools. Check your connection and try again.',
    );
  });

  it('falls back to the message, or the value itself', () => {
    expect(describeError(new Error('something odd'))).toBe('something odd');
    expect(describeError('plain string')).toBe('plain string');
  });
});
