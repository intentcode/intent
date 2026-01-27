import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthFromRequest, getGitHubHeaders } from './_lib/github.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { owner, repo } = req.body as { owner: string; repo: string };

  if (!owner || !repo) {
    return res.status(400).json({ error: 'Missing owner or repo' });
  }

  const auth = await getAuthFromRequest(req);
  const githubToken = auth?.githubToken;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=10`,
      { headers: getGitHubHeaders(githubToken) }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const prs = await response.json();

    res.json({
      prs: prs.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login,
        authorAvatar: pr.user?.avatar_url,
        head: pr.head?.ref,
        base: pr.base?.ref,
        updatedAt: pr.updated_at,
        draft: pr.draft,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
