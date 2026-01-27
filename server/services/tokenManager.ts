import { readFileSync, existsSync } from "fs";
import { createPrivateKey } from "crypto";
import { SignJWT } from "jose";
import { logger } from "../utils/logger";

// GitHub App configuration
const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_APP_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID;
const GITHUB_APP_CLIENT_SECRET = process.env.GITHUB_APP_CLIENT_SECRET;
const GITHUB_APP_PRIVATE_KEY_PATH = process.env.GITHUB_APP_PRIVATE_KEY_PATH;

// Server-level GitHub token (for public repos / rate limiting)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Load GitHub App private key if available
let githubAppPrivateKey: string | null = null;
if (GITHUB_APP_PRIVATE_KEY_PATH && existsSync(GITHUB_APP_PRIVATE_KEY_PATH)) {
  githubAppPrivateKey = readFileSync(GITHUB_APP_PRIVATE_KEY_PATH, "utf-8");
  logger.info("token-manager", `GitHub App private key loaded from ${GITHUB_APP_PRIVATE_KEY_PATH}`);
} else if (process.env.GITHUB_APP_PRIVATE_KEY) {
  githubAppPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");
  logger.info("token-manager", "GitHub App private key loaded from env variable");
}

// Check if GitHub App is configured
export const isGitHubAppConfigured = !!(
  GITHUB_APP_ID &&
  GITHUB_APP_CLIENT_ID &&
  GITHUB_APP_CLIENT_SECRET &&
  githubAppPrivateKey
);

if (isGitHubAppConfigured) {
  logger.info("token-manager", `GitHub App configured (App ID: ${GITHUB_APP_ID})`);
} else {
  logger.info("token-manager", "GitHub App not configured, using OAuth fallback");
}

// Export credentials for auth routes
export const githubAppCredentials = {
  clientId: GITHUB_APP_CLIENT_ID,
  clientSecret: GITHUB_APP_CLIENT_SECRET,
};

// Cache for installation tokens (key: installationId, value: { token, expiresAt })
const installationTokenCache = new Map<number, { token: string; expiresAt: Date }>();

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
      logger.debug("token-manager", `Installation not found for ${owner}/${repo} (${response.status})`);
      return null;
    }

    const data = await response.json();
    logger.debug("token-manager", `Found installation ${data.id} for ${owner}/${repo}`);
    return data.id;
  } catch (error) {
    logger.error("token-manager", `Error getting installation ID for ${owner}/${repo}:`, error);
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
    logger.debug("token-manager", `Using cached token for installation ${installationId}`);
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
      logger.error("token-manager", `Failed to get installation token: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Cache the token (expires in 1 hour, we cache for 55 minutes)
    const expiresAt = new Date(Date.now() + 55 * 60 * 1000);
    installationTokenCache.set(installationId, { token: data.token, expiresAt });

    logger.debug("token-manager", `Generated new token for installation ${installationId}, cached until ${expiresAt.toISOString()}`);
    return data.token;
  } catch (error) {
    logger.error("token-manager", `Error getting installation token for ${installationId}:`, error);
    return null;
  }
}

export type TokenSource = "installation" | "user" | "server" | null;

export interface RepoAccessToken {
  token: string | null;
  source: TokenSource;
}

/**
 * Get a token for accessing a specific repository
 * Priority: 1. GitHub App installation token, 2. User OAuth token, 3. Server token
 */
export async function getRepoAccessToken(
  owner: string,
  repo: string,
  userToken?: string
): Promise<RepoAccessToken> {
  logger.debug("token-manager", `Getting access token for ${owner}/${repo} (userToken: ${userToken ? "yes" : "no"})`);

  // 1. Try GitHub App installation token (read-only, preferred)
  if (isGitHubAppConfigured) {
    const installationId = await getInstallationId(owner, repo);
    if (installationId) {
      const token = await getInstallationToken(installationId);
      if (token) {
        logger.debug("token-manager", `Using installation token for ${owner}/${repo}`);
        return { token, source: "installation" };
      }
    }
  }

  // 2. Fall back to user's OAuth token
  if (userToken) {
    logger.debug("token-manager", `Using user OAuth token for ${owner}/${repo}`);
    return { token: userToken, source: "user" };
  }

  // 3. Fall back to server token (for public repos)
  if (GITHUB_TOKEN) {
    logger.debug("token-manager", `Using server token for ${owner}/${repo}`);
    return { token: GITHUB_TOKEN, source: "server" };
  }

  logger.debug("token-manager", `No token available for ${owner}/${repo}`);
  return { token: null, source: null };
}

/**
 * Get the server-level GitHub token
 */
export function getServerToken(): string | undefined {
  return GITHUB_TOKEN;
}
