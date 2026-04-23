import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('exchangeReaderCode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const load = async () => {
    const mod = await import('@/services/readerCodeExchange');
    return mod.exchangeReaderCode;
  };

  it('POSTs { code } to the production API and returns tokens on 200', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_PDF2EPUB_API_URL', 'https://api.pdf2epub.ai');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'AAA', refresh_token: 'RRR' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const exchangeReaderCode = await load();
    const result = await exchangeReaderCode('one-time-code');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.pdf2epub.ai/api/auth/reader-code/exchange');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ code: 'one-time-code' });
    expect(result).toEqual({ access_token: 'AAA', refresh_token: 'RRR' });
  });

  it('uses the Next.js dev-proxy path in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'a', refresh_token: 'r' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const exchangeReaderCode = await load();
    await exchangeReaderCode('x');

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/pdf2epub-api/auth/reader-code/exchange');
  });

  it('returns null on non-2xx responses', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_PDF2EPUB_API_URL', 'https://api.pdf2epub.ai');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );

    const exchangeReaderCode = await load();
    expect(await exchangeReaderCode('bad')).toBeNull();
  });

  it('returns null when fetch rejects', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_PDF2EPUB_API_URL', 'https://api.pdf2epub.ai');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const exchangeReaderCode = await load();
    expect(await exchangeReaderCode('x')).toBeNull();
  });

  it('returns null when response body is missing tokens', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_PDF2EPUB_API_URL', 'https://api.pdf2epub.ai');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'only-access' }),
      }),
    );

    const exchangeReaderCode = await load();
    expect(await exchangeReaderCode('x')).toBeNull();
  });
});
