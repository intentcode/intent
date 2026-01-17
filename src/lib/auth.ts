export interface User {
  id: string;
  login: string;
  name: string | null;
  avatar: string;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export function loginWithGitHub(redirect?: string) {
  const url = new URL('/api/auth/github', window.location.origin);
  if (redirect) {
    url.searchParams.set('redirect', redirect);
  }
  window.location.href = url.toString();
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.reload();
}
