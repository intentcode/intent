/**
 * Shared handlers - Pure functions that can be used by both Express and Vercel
 */

// Config handler
export function getConfig() {
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

  return {
    defaultRepo: process.env.DEFAULT_REPO || null,
    defaultRepoPath: process.env.DEFAULT_REPO_PATH || null,
    hasOAuth: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
  };
}
