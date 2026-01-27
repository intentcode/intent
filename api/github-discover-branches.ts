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
    // Get repo info (includes default branch)
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: getGitHubHeaders(githubToken) }
    );

    if (!repoResponse.ok) {
      throw new Error(`GitHub API error: ${repoResponse.status}`);
    }

    const repoInfo = await repoResponse.json();
    const defaultBranch = repoInfo.default_branch;

    // Get all branches
    const branchesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
      { headers: getGitHubHeaders(githubToken) }
    );

    if (!branchesResponse.ok) {
      throw new Error(`GitHub API error: ${branchesResponse.status}`);
    }

    const branchesData = await branchesResponse.json();

    interface BranchInfo {
      name: string;
      lastCommit: string;
      lastCommitMessage: string;
      hasIntents: boolean;
      intentCount: number;
      aheadBehind: { ahead: number; behind: number } | null;
      isDefault: boolean;
      isCurrent: boolean;
    }

    const branches: BranchInfo[] = [];

    // Process each branch (limit to avoid rate limiting)
    for (const branch of branchesData.slice(0, 20)) {
      let hasIntents = false;
      let intentCount = 0;

      // Check if branch has intent manifest
      try {
        const manifestResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/.intent/manifest.yaml?ref=${branch.name}`,
          { headers: getGitHubHeaders(githubToken) }
        );
        if (manifestResponse.ok) {
          hasIntents = true;
          const manifestData = await manifestResponse.json();
          if (manifestData.content) {
            const content = Buffer.from(manifestData.content, 'base64').toString('utf-8');
            const matches = content.match(/- id:/g);
            intentCount = matches ? matches.length : 0;
          }
        }
      } catch {
        // No manifest
      }

      // Get ahead/behind compared to default branch
      let aheadBehind: { ahead: number; behind: number } | null = null;
      if (branch.name !== defaultBranch) {
        try {
          const compareResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/compare/${defaultBranch}...${branch.name}`,
            { headers: getGitHubHeaders(githubToken) }
          );
          if (compareResponse.ok) {
            const compareData = await compareResponse.json();
            aheadBehind = {
              ahead: compareData.ahead_by,
              behind: compareData.behind_by,
            };
          }
        } catch {
          // Can't compute
        }
      }

      branches.push({
        name: branch.name,
        lastCommit: '',
        lastCommitMessage: '',
        hasIntents,
        intentCount,
        aheadBehind,
        isDefault: branch.name === defaultBranch,
        isCurrent: false,
      });
    }

    // Sort: default first
    branches.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return 0;
    });

    const defaultBranchInfo = branches.find((b) => b.isDefault);

    res.json({
      currentBranch: defaultBranch,
      defaultBranch,
      hasLocalIntents: defaultBranchInfo?.hasIntents || false,
      branches,
      suggestions: branches
        .filter((b) => !b.isDefault && b.aheadBehind && b.aheadBehind.ahead > 0)
        .slice(0, 5)
        .map((b) => ({
          base: defaultBranch,
          head: b.name,
          label: `${b.name} (${b.aheadBehind!.ahead} commits)`,
          hasIntents: b.hasIntents,
          intentCount: b.intentCount,
        })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
