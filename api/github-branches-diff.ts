import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthFromRequest, getGitHubHeaders } from './_lib/github.js';
import { parseIntentV2, parseManifest, resolveAnchor, detectOverlaps } from './_lib/intents.js';
import type { IntentV2, Manifest } from './_lib/intents.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { owner, repo, base, head, lang = 'en' } = req.body as {
    owner: string;
    repo: string;
    base: string;
    head: string;
    lang?: string;
  };

  if (!owner || !repo || !base || !head) {
    return res.status(400).json({ error: 'Missing owner, repo, base, or head' });
  }

  const auth = await getAuthFromRequest(req);
  const githubToken = auth?.githubToken;

  try {
    // Get diff between branches
    const diffResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      { headers: getGitHubHeaders(githubToken, 'application/vnd.github.v3.diff') }
    );

    if (!diffResponse.ok) {
      throw new Error(`GitHub API error: ${diffResponse.status}`);
    }

    const diff = await diffResponse.text();

    // Get compare info for changed files
    const compareResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      { headers: getGitHubHeaders(githubToken) }
    );

    const compareData = await compareResponse.json();
    const changedFiles = compareData.files?.map((f: { filename: string }) => f.filename) || [];

    // Load intents from the head branch
    const intentsV2: IntentV2[] = [];
    let manifest: Manifest | null = null;

    try {
      const manifestResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/.intent/manifest.yaml?ref=${head}`,
        { headers: getGitHubHeaders(githubToken) }
      );

      if (manifestResponse.ok) {
        const manifestData = await manifestResponse.json();
        if (manifestData.content) {
          const manifestContent = Buffer.from(manifestData.content, 'base64').toString('utf-8');
          manifest = parseManifest(manifestContent);

          if (manifest) {
            for (const intentEntry of manifest.intents) {
              if (intentEntry.status !== 'active') continue;

              try {
                const intentResponse = await fetch(
                  `https://api.github.com/repos/${owner}/${repo}/contents/.intent/intents/${intentEntry.file}?ref=${head}`,
                  { headers: getGitHubHeaders(githubToken) }
                );

                if (intentResponse.ok) {
                  const intentData = await intentResponse.json();
                  if (intentData.content) {
                    const intentContent = Buffer.from(intentData.content, 'base64').toString('utf-8');
                    const parsed = parseIntentV2(intentContent, lang);
                    if (parsed) {
                      intentsV2.push(parsed);
                    }
                  }
                }
              } catch {
                // Failed to load this intent
              }
            }
          }
        }
      }
    } catch {
      // No intents
    }

    // Collect files to fetch
    const filesToFetch = new Set<string>();
    for (const intent of intentsV2) {
      for (const file of intent.frontmatter.files) {
        filesToFetch.add(file.replace(/^\.\//, ''));
      }
    }

    // Fetch file contents
    const fileContents: Record<string, string> = {};
    for (const filePath of filesToFetch) {
      try {
        const fileResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${head}`,
          { headers: getGitHubHeaders(githubToken) }
        );
        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          if (fileData.content) {
            fileContents[filePath] = Buffer.from(fileData.content, 'base64').toString('utf-8');
          }
        }
      } catch {
        // File not found
      }
    }

    // Resolve anchors
    const resolvedIntentsV2 = intentsV2.map((intent) => {
      const resolvedChunks = intent.chunks.map((chunk) => {
        let resolvedFile: string | null = null;
        let resolved: { startLine: number; endLine: number; content: string; contentHash: string } | null = null;
        let hashMatch: boolean | null = null;

        for (const file of intent.frontmatter.files) {
          const normalizedFile = file.replace(/^\.\//, '');
          const content = fileContents[normalizedFile];
          if (!content) continue;

          const anchorResult = resolveAnchor(chunk.anchor, content);
          if (anchorResult && anchorResult.found) {
            resolvedFile = normalizedFile;
            resolved = {
              startLine: anchorResult.startLine,
              endLine: anchorResult.endLine,
              content: anchorResult.content,
              contentHash: anchorResult.hash,
            };
            if (chunk.storedHash) {
              hashMatch = anchorResult.hash === chunk.storedHash;
            }
            break;
          }
        }

        return { ...chunk, resolvedFile, resolved, hashMatch };
      });

      const overlaps = detectOverlaps(resolvedChunks);

      return {
        ...intent,
        resolvedChunks: resolvedChunks.map(chunk => ({
          ...chunk,
          overlaps: overlaps.get(chunk.anchor) || [],
        })),
      };
    });

    res.json({
      diff,
      changedFiles,
      intents: {},
      intentsV2: resolvedIntentsV2,
      manifest,
      fileContents,
      branchInfo: {
        base,
        head,
        aheadBy: compareData.ahead_by,
        behindBy: compareData.behind_by,
        totalCommits: compareData.total_commits,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
