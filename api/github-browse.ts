import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthFromRequest, getGitHubHeaders } from './_lib/github.js';
import { parseIntentV2, parseManifest, resolveAnchor, detectOverlaps } from './_lib/intents.js';
import type { IntentV2, Manifest } from './_lib/intents.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { owner, repo, branch, lang = 'en' } = req.body as {
    owner: string;
    repo: string;
    branch: string;
    lang?: string;
  };

  if (!owner || !repo || !branch) {
    return res.status(400).json({ error: 'Missing owner, repo, or branch' });
  }

  const auth = await getAuthFromRequest(req);
  const githubToken = auth?.githubToken;

  try {
    // Fetch repo info
    let repoInfo: { description: string | null; stars: number; language: string | null } | null = null;
    try {
      const repoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers: getGitHubHeaders(githubToken) }
      );
      if (repoResponse.ok) {
        const repoData = await repoResponse.json();
        repoInfo = {
          description: repoData.description,
          stars: repoData.stargazers_count,
          language: repoData.language,
        };
      }
    } catch {
      // Failed to fetch repo info
    }

    // Load intents from the branch
    const intentsV2: IntentV2[] = [];
    let manifest: Manifest | null = null;

    try {
      const manifestResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/.intent/manifest.yaml?ref=${branch}`,
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
                  `https://api.github.com/repos/${owner}/${repo}/contents/.intent/intents/${intentEntry.file}?ref=${branch}`,
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

    // Collect all files referenced by intents
    const filesSet = new Set<string>();
    for (const intent of intentsV2) {
      for (const file of intent.frontmatter.files) {
        filesSet.add(file.replace(/^\.\//, ''));
      }
    }
    const files = Array.from(filesSet);

    // Fetch file contents
    const fileContents: Record<string, string> = {};
    for (const filePath of files) {
      try {
        const fileResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
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
      intentsV2: resolvedIntentsV2,
      files,
      fileContents,
      branch,
      repoInfo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
