import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'crypto';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: 'GitHub OAuth not configured' });
  }

  // Get the redirect URL from query params (where to go after auth)
  const redirectParam = req.query.redirect as string || '/';

  // Validate redirect URL is same-origin (prevent open redirect)
  let redirectUrl = '/';
  if (redirectParam.startsWith('/') && !redirectParam.startsWith('//')) {
    redirectUrl = redirectParam;
  }

  // Generate CSRF nonce
  const nonce = randomBytes(16).toString('hex');

  // Store redirect URL and nonce in state parameter (will be returned by GitHub)
  const state = Buffer.from(JSON.stringify({ redirect: redirectUrl, nonce })).toString('base64');

  // Set nonce in cookie for verification in callback
  const isProduction = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', [
    `intent_oauth_nonce=${nonce}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isProduction ? '; Secure' : ''}`,
  ]);

  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('scope', 'repo read:user');
  githubAuthUrl.searchParams.set('state', state);

  res.redirect(302, githubAuthUrl.toString());
}
