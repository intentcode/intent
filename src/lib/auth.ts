// In production (Vercel), use current origin. In dev, use localhost:3001
function getApiBase(): string {
  if (import.meta.env.DEV) {
    return "http://localhost:3001";
  }
  return window.location.origin;
}

export interface User {
  id: string;
  login: string;
  name: string | null;
  avatar: string;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/auth/me`, {
      credentials: 'include', // Include cookies for cross-origin requests
    });
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export function loginWithGitHub(redirect?: string) {
  const url = new URL(`${getApiBase()}/api/auth/github`);
  if (redirect) {
    url.searchParams.set('redirect', redirect);
  }
  window.location.href = url.toString();
}

export async function logout(): Promise<void> {
  await fetch(`${getApiBase()}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  window.location.reload();
}
