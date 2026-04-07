'use client';

import { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';

interface AuthContextType {
  token: string | null;
  user: User | null;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  });
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      const userJson = localStorage.getItem('user');
      return userJson ? JSON.parse(userJson) : null;
    }
    return null;
  });

  useEffect(() => {
    const syncSession = (
      session: { access_token: string; refresh_token: string; user: User } | null,
    ) => {
      if (session) {
        console.log('Syncing session');
        const { access_token, refresh_token, user } = session;
        localStorage.setItem('token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        localStorage.setItem('user', JSON.stringify(user));
        setToken(access_token);
        setUser(user);
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
      }
    };

    const initFromUrl = async () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        try {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error('Failed to set session from URL:', error);
          } else {
            // Clean up URL params after successful session setup
            const url = new URL(window.location.href);
            url.searchParams.delete('access_token');
            url.searchParams.delete('refresh_token');
            window.history.replaceState({}, '', url.toString());
          }
        } catch (err) {
          console.error('Error setting session from URL:', err);
        }
      } else {
        // No URL tokens, try refreshing existing session
        try {
          await supabase.auth.refreshSession();
        } catch {
          syncSession(null);
        }
      }
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((_, session) => {
      syncSession(session);
    });

    initFromUrl();
    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    console.log('Logging out');
    try {
      await supabase.auth.refreshSession();
    } catch {
    } finally {
      await supabase.auth.signOut();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    }
  };

  const refresh = async () => {
    try {
      await supabase.auth.refreshSession();
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ token, user, logout, refresh }}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
