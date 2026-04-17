import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = {
  user: null as { id: string } | null,
  ready: true,
};

const importBookMock = vi.fn();

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    ready: authState.ready,
  }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {
      getAppService: () => Promise.resolve({ importBook: importBookMock }),
    },
  }),
}));

vi.mock('@/services/environment', () => ({
  isWebAppPlatform: () => true,
}));

vi.mock('@/utils/misc', () => ({
  getUserLang: () => 'en',
}));

vi.mock('@/data/demo/library.en.json', () => ({
  default: { library: ['https://example.com/demo-1.epub'] },
}));

vi.mock('@/data/demo/library.zh.json', () => ({
  default: { library: ['https://example.com/demo-zh.epub'] },
}));

import { useDemoBooks } from '@/app/library/hooks/useDemoBooks';

const Harness = () => {
  useDemoBooks();
  return null;
};

describe('useDemoBooks', () => {
  beforeEach(() => {
    localStorage.clear();
    importBookMock.mockReset();
    importBookMock.mockResolvedValue(null);
    authState.user = null;
    authState.ready = true;
  });

  afterEach(() => {
    cleanup();
  });

  it('does not fetch demo books when user is not logged in', async () => {
    render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(importBookMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('demoBooksFetched')).toBeNull();
  });

  it('fetches demo books when user is logged in', async () => {
    authState.user = { id: 'user-1' };
    render(<Harness />);
    await waitFor(() => {
      expect(importBookMock).toHaveBeenCalled();
    });
    expect(localStorage.getItem('demoBooksFetched')).toBe('true');
  });

  it('does not fetch demo books until auth is ready', async () => {
    authState.user = { id: 'user-1' };
    authState.ready = false;
    render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(importBookMock).not.toHaveBeenCalled();
  });
});
