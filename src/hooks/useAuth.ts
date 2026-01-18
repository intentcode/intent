import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser, loginWithGitHub, logout as logoutApi, type User } from '../lib/auth';

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (redirect?: string) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing authentication state
 * Fetches current user on mount and provides login/logout methods
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback((redirect?: string) => {
    loginWithGitHub(redirect);
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
  }, []);

  return {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    logout,
    refresh,
  };
}
