'use client';

import { createContext, useState, useContext, ReactNode, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';

interface AuthContextType {
  token: string | null;
  user: User | null;
  /** Whether auth initialization (URL token handling / session restore) is complete */
  ready: boolean;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Clean up stale auth data from localStorage.
 * Removes tokens from previous Supabase projects (e.g., old Readest project)
 * that cause "Invalid JWT structure" errors with the current pdf2epub project.
 */
function cleanupStaleAuthData() {
  if (typeof window === 'undefined') return;
  try {
    // Remove any Supabase session keys from OTHER projects
    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || '';
    const currentRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const keyRef = key.replace('sb-', '').replace('-auth-token', '');
        if (currentRef && keyRef !== currentRef) {
          console.log('Removing stale Supabase session for project:', keyRef);
          localStorage.removeItem(key);
        }
      }
    }
  } catch {
    // Ignore localStorage errors
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    cleanupStaleAuthData();

    const syncSession = (
      session: { access_token: string; refresh_token: string; user: User } | null,
    ) => {
      if (session) {
        console.log('Syncing session');
        setToken(session.access_token);
        setUser(session.user);
      } else {
        setToken(null);
        setUser(null);
      }
    };

    const cleanUrlParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('access_token');
      url.searchParams.delete('refresh_token');
      window.history.replaceState({}, '', url.toString());
    };

    const initSession = async () => {
      if (typeof window === 'undefined') {
        setReady(true);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        // URL contains tokens from pdf2epub.ai redirect
        // Only validate access_token format (JWT); refresh_token is an opaque string
        const isJwt = (t: string) => t.split('.').length === 3;
        if (!isJwt(accessToken)) {
          console.warn('URL contains invalid access_token format, ignoring');
          cleanUrlParams();
          setReady(true);
          return;
        }
        try {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.warn('Failed to set session from URL:', error.message);
          }
        } catch (err) {
          console.warn('Error setting session from URL:', err);
        }
        cleanUrlParams();
      } else {
        // No URL tokens — try restoring existing session
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session) {
            syncSession(data.session);
          }
        } catch {
          // No valid session
        }
      }
      setReady(true);
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((_, session) => {
      syncSession(session);
    });

    initSession();
    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    console.log('Logging out');
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signOut errors
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  const refresh = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        await supabase.auth.refreshSession();
      }
    } catch {
      // Ignore refresh errors
    }
  };

  return (
    <AuthContext.Provider value={{ token, user, ready, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
