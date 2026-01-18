import { readFileSync, existsSync } from "fs";
import { createPrivateKey } from "crypto";
import { SignJWT } from "jose";

// ============================================
// CONFIGURATION
// ============================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Legacy OAuth App configuration (fallback)
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// GitHub App configuration (preferred - read-only permissions)
const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_APP_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID;
const GITHUB_APP_CLIENT_SECRET = process.env.GITHUB_APP_CLIENT_SECRET;
const GITHUB_APP_PRIVATE_KEY_PATH = process.env.GITHUB_APP_PRIVATE_KEY_PATH;

// Load GitHub App private key if available
let githubAppPrivateKey: string | null = null;
if (GITHUB_APP_PRIVATE_KEY_PATH && existsSync(GITHUB_APP_PRIVATE_KEY_PATH)) {
  githubAppPrivateKey = readFileSync(GITHUB_APP_PRIVATE_KEY_PATH, "utf-8");
  console.log("[GitHub App] Private key loaded from", GITHUB_APP_PRIVATE_KEY_PATH);
} else if (process.env.GITHUB_APP_PRIVATE_KEY) {
  githubAppPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");
  console.log("[GitHub App] Private key loaded from environment variable");
}

// Check if GitHub App is configured
export const isGitHubAppConfigured = !!(
  GITHUB_APP_ID &&
  GITHUB_APP_CLIENT_ID &&
  GITHUB_APP_CLIENT_SECRET &&
  githubAppPrivateKey
);

if (isGitHubAppConfigured) {
  console.log("[GitHub App] Configured with App ID:", GITHUB_APP_ID);
} else {
  console.log("[GitHub App] Not configured, falling back to OAuth App");
}

// Export OAuth config for auth routes
export const oauthConfig = {
  clientId: isGitHubAppConfigured ? GITHUB_APP_CLIENT_ID : GITHUB_CLIENT_ID,
  clientSecret: isGitHubAppConfigured ? GITHUB_APP_CLIENT_SECRET : GITHUB_CLIENT_SECRET,
  isGitHubApp: isGitHubAppConfigured,
};

// ============================================
// TOKEN CACHE
// ============================================

// Cache for installation tokens (key: installationId, value: { token, expiresAt })
const installationTokenCache = new Map<number, { token: string; expiresAt: Date }>();

// ============================================
// TOKEN GENERATION
// ============================================

/**
 * Generate a JWT to authenticate as the GitHub App
 */
export async function generateAppJWT(): Promise<string> {
  if (!githubAppPrivateKey || !GITHUB_APP_ID) {
    throw new Error("GitHub App not configured");
  }

  const privateKey = createPrivateKey(githubAppPrivateKey);

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(GITHUB_APP_ID)
    .setExpirationTime("10m")
    .sign(privateKey);

  return jwt;
}

/**
 * Get installation ID for a specific repository
 */
export async function getInstallationId(owner: string, repo: string): Promise<number | null> {
  try {
    const appJwt = await generateAppJWT();

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/installation`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${appJwt}`,
          "User-Agent": "Intent-App",
        },
      }
    );

    if (!response.ok) {
      console.log(`[GitHub App] Installation not found for ${owner}/${repo}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error("[GitHub App] Error getting installation ID:", error);
    return null;
  }
}

/**
 * Get an installation access token for a specific installation
 */
export async function getInstallationToken(installationId: number): Promise<string | null> {
  // Check cache first
  const cached = installationTokenCache.get(installationId);
  if (cached && cached.expiresAt > new Date()) {
    return cached.token;
  }

  try {
    const appJwt = await generateAppJWT();

    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${appJwt}`,
          "User-Agent": "Intent-App",
        },
      }
    );

    if (!response.ok) {
      console.error(`[GitHub App] Failed to get installation token: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Cache the token (expires in 1 hour, we cache for 55 minutes)
    const expiresAt = new Date(Date.now() + 55 * 60 * 1000);
    installationTokenCache.set(installationId, { token: data.token, expiresAt });

    return data.token;
  } catch (error) {
    console.error("[GitHub App] Error getting installation token:", error);
    return null;
  }
}

export type TokenSource = "installation" | "user" | "server" | null;

/**
 * Get a token for accessing a specific repository
 * Priority: 1. GitHub App installation token, 2. User OAuth token, 3. Server token
 */
export async function getRepoAccessToken(
  owner: string,
  repo: string,
  userToken?: string
): Promise<{ token: string | null; source: TokenSource }> {
  // 1. Try GitHub App installation token (read-only, preferred)
  if (isGitHubAppConfigured) {
    const installationId = await getInstallationId(owner, repo);
    if (installationId) {
      const token = await getInstallationToken(installationId);
      if (token) {
        return { token, source: "installation" };
      }
    }
  }

  // 2. Fall back to user's OAuth token
  if (userToken) {
    return { token: userToken, source: "user" };
  }

  // 3. Fall back to server token (for public repos)
  if (GITHUB_TOKEN) {
    return { token: GITHUB_TOKEN, source: "server" };
  }

  return { token: null, source: null };
}

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
  const token = userToken || GITHUB_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}
