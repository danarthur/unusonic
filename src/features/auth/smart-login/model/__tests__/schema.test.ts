import { describe, it, expect } from 'vitest';
import { loginSchema, signupSchema, signupForPasskeySchema } from '../schema';

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: 'secret123' });
    expect(result.success).toBe(true);
  });

  it('rejects empty email', () => {
    const result = loginSchema.safeParse({ email: '', password: 'secret123' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'secret123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 6 chars', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '12345' });
    expect(result.success).toBe(false);
  });

  it('accepts password of exactly 6 chars', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '123456' });
    expect(result.success).toBe(true);
  });
});

describe('signupSchema', () => {
  const valid = { email: 'user@example.com', password: 'Secure1x', fullName: 'Jane Doe' };

  it('accepts valid signup data', () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects password without uppercase', () => {
    const result = signupSchema.safeParse({ ...valid, password: 'secure1x' });
    expect(result.success).toBe(false);
  });

  it('rejects password without number', () => {
    const result = signupSchema.safeParse({ ...valid, password: 'Securexxx' });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 chars', () => {
    const result = signupSchema.safeParse({ ...valid, password: 'Sec1' });
    expect(result.success).toBe(false);
  });

  it('accepts password of exactly 8 chars with uppercase and number', () => {
    const result = signupSchema.safeParse({ ...valid, password: 'Abcdefg1' });
    expect(result.success).toBe(true);
  });

  it('rejects empty fullName', () => {
    const result = signupSchema.safeParse({ ...valid, fullName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects single-char fullName', () => {
    const result = signupSchema.safeParse({ ...valid, fullName: 'J' });
    expect(result.success).toBe(false);
  });

  it('rejects missing email', () => {
    const result = signupSchema.safeParse({ password: 'Secure1x', fullName: 'Jane Doe' });
    expect(result.success).toBe(false);
  });
});

describe('signupForPasskeySchema', () => {
  it('accepts valid passkey signup (no password needed)', () => {
    const result = signupForPasskeySchema.safeParse({
      email: 'user@example.com',
      fullName: 'Jane Doe',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = signupForPasskeySchema.safeParse({
      email: 'bad',
      fullName: 'Jane Doe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short fullName', () => {
    const result = signupForPasskeySchema.safeParse({
      email: 'user@example.com',
      fullName: 'J',
    });
    expect(result.success).toBe(false);
  });

  it('ignores extra password field', () => {
    const result = signupForPasskeySchema.safeParse({
      email: 'user@example.com',
      fullName: 'Jane Doe',
      password: 'ShouldBeIgnored1',
    });
    expect(result.success).toBe(true);
  });
});
