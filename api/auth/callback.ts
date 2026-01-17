import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT } from 'jose';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state } = req.query;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(500).json({ error: 'GitHub OAuth not configured' });
  }

  // Extract nonce from cookie for CSRF verification
  const cookies = req.headers.cookie || '';
  const nonceMatch = cookies.match(/intent_oauth_nonce=([^;]+)/);
  const cookieNonce = nonceMatch ? nonceMatch[1] : null;

  // Parse state and verify nonce
  let redirectUrl = '/';
  if (state && typeof state === 'string') {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());

      // Verify CSRF nonce matches
      if (!cookieNonce || cookieNonce !== stateData.nonce) {
        return res.status(403).json({ error: 'Invalid state - possible CSRF attack' });
      }

      // Validate redirect is same-origin
      if (stateData.redirect && stateData.redirect.startsWith('/') && !stateData.redirect.startsWith('//')) {
        redirectUrl = stateData.redirect;
      }
    } catch {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
  } else {
    return res.status(400).json({ error: 'Missing state parameter' });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error_description || tokenData.error });
    }

    const accessToken = tokenData.access_token;

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const userData = await userResponse.json();

    // Create JWT with user info and GitHub token
    const secret = new TextEncoder().encode(JWT_SECRET);
    const jwt = await new SignJWT({
      sub: userData.id.toString(),
      login: userData.login,
      name: userData.name,
      avatar: userData.avatar_url,
      github_token: accessToken,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    // Set JWT as httpOnly cookie and clear the nonce cookie
    res.setHeader('Set-Cookie', [
      `intent_token=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${isProduction ? '; Secure' : ''}`,
      `intent_oauth_nonce=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`,
    ]);

    // Redirect to app
    res.redirect(302, redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
