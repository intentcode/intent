// In production (Vercel), use relative paths. In dev, use localhost:3001
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
      credentials: 'include', // Include cookies for cross-origin requests
    });
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export function loginWithGitHub(redirect?: string) {
  const url = new URL(`${API_BASE}/api/auth/github`);
  if (redirect) {
    url.searchParams.set('redirect', redirect);
  }
  window.location.href = url.toString();
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  window.location.reload();
}
