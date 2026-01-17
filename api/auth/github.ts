import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: 'GitHub OAuth not configured' });
  }

  // Get the redirect URL from query params (where to go after auth)
  const redirectUrl = req.query.redirect as string || '/';

  // Store redirect URL in state parameter (will be returned by GitHub)
  const state = Buffer.from(JSON.stringify({ redirect: redirectUrl })).toString('base64');

  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('scope', 'repo read:user');
  githubAuthUrl.searchParams.set('state', state);

  res.redirect(302, githubAuthUrl.toString());
}
