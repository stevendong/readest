import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || '';
const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '';

// Use a placeholder URL when env vars are not set (e.g., in tests)
const PLACEHOLDER_URL = 'http://localhost:0';
const effectiveUrl = supabaseUrl || PLACEHOLDER_URL;
const effectiveKey = supabaseAnonKey || 'placeholder-key';

// --- Cookie-based storage for *.pdf2epub.ai domains ---
// Allows session sharing between reader.pdf2epub.ai and pdf2epub.ai

function isPdf2EpubDomain(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('pdf2epub.ai');
}

function setCookie(name: string, value: string, days = 30) {
  const domain = '.pdf2epub.ai';
  document.cookie = `${name}=${encodeURIComponent(value)};domain=${domain};path=/;max-age=${days * 86400};SameSite=Lax;Secure`;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function removeCookie(name: string) {
  const domain = '.pdf2epub.ai';
  document.cookie = `${name}=;domain=${domain};path=/;max-age=0;SameSite=Lax;Secure`;
}

const cookieStorage = {
  getItem: (key: string) => getCookie(key),
  setItem: (key: string, value: string) => setCookie(key, value),
  removeItem: (key: string) => removeCookie(key),
};

export const supabase: SupabaseClient = createClient(effectiveUrl, effectiveKey, {
  auth: {
    ...(isPdf2EpubDomain() ? { storage: cookieStorage } : {}),
  },
});

export const createSupabaseClient = (accessToken?: string) => {
  return createClient(effectiveUrl, effectiveKey, {
    global: {
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  });
};

export const createSupabaseAdminClient = () => {
  const supabaseAdminKey = process.env['SUPABASE_ADMIN_KEY'] || '';
  return createClient(effectiveUrl, supabaseAdminKey || effectiveKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};
