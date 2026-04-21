import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_REF = 'soxnbzhtdwmejzrjhcxc';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

type CookieSpy = ReturnType<typeof vi.fn>;

const stubCookies = (existing: string): CookieSpy => {
  const spy = vi.fn();
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => existing,
    set: (v: string) => spy(v),
  });
  return spy;
};

const loadMigrate = async () => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  const mod = await import('@/utils/supabase');
  return mod.migrateLocalStorageSessionToCookie;
};

describe('migrateLocalStorageSessionToCookie', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { hostname: 'reader.pdf2epub.ai', href: 'https://reader.pdf2epub.ai/' },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('moves the auth token from localStorage to the shared cookie', async () => {
    const token = JSON.stringify({ access_token: 'abc', refresh_token: 'xyz' });
    localStorage.setItem(STORAGE_KEY, token);
    const setCookieSpy = stubCookies('');

    const migrate = await loadMigrate();
    migrate(SUPABASE_URL);

    expect(setCookieSpy).toHaveBeenCalledTimes(1);
    const written = String(setCookieSpy.mock.calls[0]?.[0]);
    expect(written).toContain(`${STORAGE_KEY}=${encodeURIComponent(token)}`);
    expect(written).toContain('domain=.pdf2epub.ai');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('skips writing when the cookie is already set, but still clears localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: 'abc' }));
    const setCookieSpy = stubCookies(`${STORAGE_KEY}=${encodeURIComponent('existing')}`);

    const migrate = await loadMigrate();
    migrate(SUPABASE_URL);

    expect(setCookieSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does nothing when localStorage has no token', async () => {
    const setCookieSpy = stubCookies('');

    const migrate = await loadMigrate();
    migrate(SUPABASE_URL);

    expect(setCookieSpy).not.toHaveBeenCalled();
  });

  it('does not write cookies on non-pdf2epub domains', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { hostname: 'localhost', href: 'http://localhost:3000/' },
    });
    const setCookieSpy = stubCookies('');

    const migrate = await loadMigrate();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: 'abc' }));
    migrate(SUPABASE_URL);

    expect(setCookieSpy).not.toHaveBeenCalled();
    // localStorage is owned by supabase-js on non-pdf2epub domains; assert migration
    // left our cookie untouched and that's the user-observable effect we care about.
  });
});
