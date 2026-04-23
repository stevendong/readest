import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || '';
const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '';

// Use a placeholder URL when env vars are not set (e.g., in tests)
const PLACEHOLDER_URL = 'http://localhost:0';
const effectiveUrl = supabaseUrl || PLACEHOLDER_URL;
const effectiveKey = supabaseAnonKey || 'placeholder-key';

export const supabase: SupabaseClient = createClient(effectiveUrl, effectiveKey);

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
