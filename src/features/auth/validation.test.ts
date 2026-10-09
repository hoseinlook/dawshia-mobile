import { NetworkError, ServerError } from '../../services/remote/nakamaApi';
import { authErrorFrom, validateSignIn, validateSignUp } from './validation';

describe('validation', () => {
  it('checks sign-in fields', () => {
    expect(validateSignIn('a@b.co', '12345678')).toBeNull();
    expect(validateSignIn('not-an-email', '12345678')).toBe('invalidEmail');
    expect(validateSignIn('a@b.co', 'short')).toBe('passwordTooShort');
  });

  it('checks sign-up fields', () => {
    expect(validateSignUp('hossein_99', 'a@b.co', '12345678')).toBeNull();
    expect(validateSignUp('ab', 'a@b.co', '12345678')).toBe('invalidUsername');
    expect(validateSignUp('has space', 'a@b.co', '12345678')).toBe('invalidUsername');
  });
});

describe('authErrorFrom', () => {
  it.each([
    [new NetworkError('Cannot reach', 'unreachable'), 'signIn', 'network'],
    [new ServerError('Invalid credentials.', 401), 'signIn', 'wrongCredentials'],
    [new ServerError('User account not found.', 404), 'signIn', 'wrongCredentials'],
    [new ServerError('Username is already in use.', 409), 'signUp', 'usernameTaken'],
    [new ServerError('Email already in use.', 409), 'signUp', 'emailTaken'],
    [new ServerError('Password must be at least 8 characters long.', 400), 'signUp', 'passwordTooShort'],
    [new Error('boom'), 'signIn', 'unknown'],
  ] as const)('%p → %p', (error, mode, code) => {
    expect(authErrorFrom(error, mode).code).toBe(code);
  });
});
