import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

  res.json({
    defaultRepo: process.env.DEFAULT_REPO || null,
    defaultRepoPath: null, // Local paths not available in serverless
    hasOAuth: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
  });
}
