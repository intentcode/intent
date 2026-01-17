import type { VercelRequest } from '@vercel/node';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface AuthUser {
  id: string;
  login: string;
  name: string | null;
  avatar: string;
}

export async function getAuthFromRequest(req: VercelRequest): Promise<{ user: AuthUser; githubToken: string } | null> {
  const cookies = req.headers.cookie;
  if (!cookies) return null;

  const tokenMatch = cookies.match(/intent_token=([^;]+)/);
  if (!tokenMatch) return null;

  const token = tokenMatch[1];

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    return {
      user: {
        id: payload.sub as string,
        login: payload.login as string,
        name: payload.name as string | null,
        avatar: payload.avatar as string,
      },
      githubToken: payload.github_token as string,
    };
  } catch {
    return null;
  }
}

export function getGitHubHeaders(token?: string, accept: string = "application/vnd.github.v3+json"): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": "Intent-App",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}
