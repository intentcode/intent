import { getServerToken } from "../services/tokenManager";

/**
 * Get GitHub API headers with optional authentication
 */
export function getGitHubHeaders(
  accept: string = "application/vnd.github.v3+json",
  userToken?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": "Intent-App",
  };
  
  // Prefer user's OAuth token, fallback to server token
  const token = userToken || getServerToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  return headers;
}

/**
 * Decode base64 content from GitHub API
 */
export function decodeBase64(content: string): string {
  return Buffer.from(content, "base64").toString("utf-8");
}

/**
 * Build GitHub API URL for a file
 */
export function getGitHubFileUrl(owner: string, repo: string, path: string, ref: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
}

/**
 * Build GitHub API URL for comparing branches
 */
export function getGitHubCompareUrl(owner: string, repo: string, base: string, head: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`;
}
