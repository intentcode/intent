import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface AuthUser {
  id: string;
  login: string;
  name: string | null;
  avatar: string;
}

export async function getAuthUser(req: VercelRequest): Promise<{ user: AuthUser; githubToken: string } | null> {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await getAuthUser(req);

  if (!auth) {
    return res.status(401).json({ error: 'Not authenticated', user: null });
  }

  res.json({ user: auth.user });
}
