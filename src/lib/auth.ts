// In dev, frontend (5173) and backend (3001) are on different ports
const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";

export interface User {
  id: string;
  login: string;
  name: string | null;
  avatar: string;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: 'include',
    });
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export function loginWithGitHub(redirect?: string) {
  const params = new URLSearchParams();
  if (redirect) {
    params.set('redirect', redirect);
  }
  const query = params.toString();
  window.location.href = `${API_BASE}/api/auth/github${query ? '?' + query : ''}`;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  window.location.reload();
}
