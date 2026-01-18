import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthFromRequest, getGitHubHeaders } from './_lib/github.js';
import { parseIntentV2, parseManifest, resolveAnchor, detectOverlaps } from './_lib/intents.js';
import type { IntentV2, Manifest } from './_lib/intents.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { owner, repo, prNumber, lang = 'en' } = req.body as {
    owner: string;
    repo: string;
    prNumber: number;
    lang?: string;
  };

  if (!owner || !repo || !prNumber) {
    return res.status(400).json({ error: 'Missing owner, repo, or prNumber' });
  }

  // Get user's GitHub token from session (optional - falls back to public access)
  const auth = await getAuthFromRequest(req);
  const githubToken = auth?.githubToken;

  try {
    // Fetch PR diff from GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers: getGitHubHeaders(githubToken, 'application/vnd.github.v3.diff') }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({
          error: 'Repository or PR not found. If private, please login with GitHub.',
          needsAuth: !auth
        });
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const diff = await response.text();

    // Get PR info
    const prInfoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers: getGitHubHeaders(githubToken) }
    );

    const prInfo = await prInfoResponse.json();

    // Get changed files
    const filesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      { headers: getGitHubHeaders(githubToken) }
    );

    const files = await filesResponse.json();
    const changedFiles = files.map((f: { filename: string }) => f.filename);

    const head = prInfo.head?.ref;

    // Try to load intents from the head branch
    const intentsV2: IntentV2[] = [];
    let manifest: Manifest | null = null;

    try {
      // Check if manifest exists
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
            // Load each intent file
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
      // No intents in this branch
    }

    // Collect all files referenced by intents to fetch their content
    const filesToFetch = new Set<string>();
    for (const intent of intentsV2) {
      for (const file of intent.frontmatter.files) {
        filesToFetch.add(file.replace(/^\.\//, ''));
      }
    }

    // Fetch file contents from GitHub
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
        // File not found or error fetching
      }
    }

    // Resolve anchors for each intent's chunks
    const resolvedIntentsV2 = intentsV2.map((intent) => {
      const resolvedChunks = intent.chunks.map((chunk) => {
        // Find which file this chunk belongs to
        let resolvedFile: string | null = null;
        let resolved: { startLine: number; endLine: number; content: string; contentHash: string } | null = null;
        let hashMatch: boolean | null = null;

        // Try to resolve in each of the intent's files
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
            // Check hash match if stored hash exists
            if (chunk.storedHash) {
              hashMatch = anchorResult.hash === chunk.storedHash;
            }
            break;
          }
        }

        return {
          ...chunk,
          resolvedFile,
          resolved,
          hashMatch,
        };
      });

      // Detect overlaps
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
      prInfo: {
        title: prInfo.title,
        number: prInfo.number,
        author: prInfo.user?.login,
        base: prInfo.base?.ref,
        head: prInfo.head?.ref,
        url: prInfo.html_url,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
