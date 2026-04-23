export interface ReaderCodeTokens {
  access_token: string;
  refresh_token: string;
}

const isDev = () => process.env['NODE_ENV'] === 'development';

function exchangeUrl(): string {
  if (isDev()) return '/pdf2epub-api/auth/reader-code/exchange';
  const base = process.env['NEXT_PUBLIC_PDF2EPUB_API_URL'] || '';
  return `${base}/api/auth/reader-code/exchange`;
}

export async function exchangeReaderCode(code: string): Promise<ReaderCodeTokens | null> {
  try {
    const res = await fetch(exchangeUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<ReaderCodeTokens>;
    if (!data?.access_token || !data?.refresh_token) return null;
    return { access_token: data.access_token, refresh_token: data.refresh_token };
  } catch {
    return null;
  }
}
