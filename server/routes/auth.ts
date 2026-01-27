import { Router } from "express";
import { randomBytes } from "crypto";
import { SignJWT } from "jose";
import { getAuthUser, getJWTSecret } from "../middleware/auth";
import {
  isGitHubAppConfigured,
  githubAppCredentials,
  getInstallationId,
} from "../services/tokenManager";

const router = Router();

// Legacy OAuth App configuration (fallback)
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// Default repos for configuration endpoint
const DEFAULT_REPO = process.env.DEFAULT_REPO;
const DEFAULT_REPO_PATH = process.env.DEFAULT_REPO_PATH;

// GET /api/auth/github - Redirect to GitHub OAuth
router.get("/github", (req, res) => {
  const clientId = isGitHubAppConfigured
    ? githubAppCredentials.clientId
    : GITHUB_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({ error: "GitHub OAuth not configured" });
  }

  const redirectParam = (req.query.redirect as string) || "/";
  let redirectUrl = "/";
  if (redirectParam.startsWith("/") && !redirectParam.startsWith("//")) {
    redirectUrl = redirectParam;
  }

  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ redirect: redirectUrl, nonce })).toString("base64");

  res.setHeader("Set-Cookie", [
    `intent_oauth_nonce=${nonce}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
  ]);

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", clientId);
  githubAuthUrl.searchParams.set("scope", isGitHubAppConfigured ? "read:user" : "repo read:user");
  githubAuthUrl.searchParams.set("state", state);

  res.redirect(302, githubAuthUrl.toString());
});

// GET /api/auth/callback - OAuth callback from GitHub
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing code parameter" });
  }

  const clientId = isGitHubAppConfigured
    ? githubAppCredentials.clientId
    : GITHUB_CLIENT_ID;
  const clientSecret = isGitHubAppConfigured
    ? githubAppCredentials.clientSecret
    : GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: "GitHub OAuth not configured" });
  }

  const cookies = req.headers.cookie || "";
  const nonceMatch = cookies.match(/intent_oauth_nonce=([^;]+)/);
  const cookieNonce = nonceMatch ? nonceMatch[1] : null;

  let redirectUrl = "/";
  if (state && typeof state === "string") {
    try {
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      if (!cookieNonce || cookieNonce !== stateData.nonce) {
        return res.status(403).json({ error: "Invalid state - possible CSRF attack" });
      }
      if (stateData.redirect && stateData.redirect.startsWith("/") && !stateData.redirect.startsWith("//")) {
        redirectUrl = stateData.redirect;
      }
    } catch {
      return res.status(400).json({ error: "Invalid state parameter" });
    }
  } else {
    return res.status(400).json({ error: "Missing state parameter" });
  }

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error_description || tokenData.error });
    }

    const accessToken = tokenData.access_token;

    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github.v3+json" },
    });

    const userData = await userResponse.json();

    const jwt = await new SignJWT({
      sub: userData.id.toString(),
      login: userData.login,
      name: userData.name,
      avatar: userData.avatar_url,
      github_token: accessToken,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(getJWTSecret());

    res.setHeader("Set-Cookie", [
      `intent_token=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
      `intent_oauth_nonce=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    ]);

    res.redirect(302, `http://localhost:5173${redirectUrl}`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// GET /api/auth/github-app/callback - Alias for GitHub App OAuth callback
router.get("/github-app/callback", async (req, res) => {
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  res.redirect(302, `/api/auth/callback?${queryString}`);
});

// GET /api/auth/me - Get current user
router.get("/me", async (req, res) => {
  const auth = await getAuthUser(req.headers.cookie);
  if (!auth) {
    return res.status(401).json({ error: "Not authenticated", user: null });
  }
  res.json({ user: auth.user });
});

// POST /api/auth/logout - Clear auth cookie
router.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", [`intent_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`]);
  res.json({ success: true });
});

// GET /api/config - Get frontend configuration
router.get("/config", (_req, res) => {
  const hasOAuth = isGitHubAppConfigured || !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
  res.json({
    defaultRepo: DEFAULT_REPO || null,
    defaultRepoPath: DEFAULT_REPO_PATH || null,
    hasOAuth,
    hasGitHubApp: isGitHubAppConfigured,
    githubAppSlug: isGitHubAppConfigured ? "intent-code" : null,
  });
});

// GET /api/github-app/installation-status - Check if GitHub App is installed
router.get("/github-app/installation-status", async (req, res) => {
  const { owner, repo } = req.query;

  if (!owner || !repo || typeof owner !== "string" || typeof repo !== "string") {
    return res.status(400).json({ error: "Missing owner or repo parameter" });
  }

  if (!isGitHubAppConfigured) {
    return res.json({
      installed: false,
      reason: "github_app_not_configured",
      installUrl: null,
    });
  }

  try {
    const installationId = await getInstallationId(owner, repo);

    if (installationId) {
      return res.json({
        installed: true,
        installationId,
        installUrl: null,
      });
    }

    const installUrl = `https://github.com/apps/intent-code/installations/new`;

    return res.json({
      installed: false,
      reason: "not_installed",
      installUrl,
    });
  } catch (error) {
    console.error("[GitHub App] Error checking installation:", error);
    return res.status(500).json({ error: "Failed to check installation status" });
  }
});

export default router;
