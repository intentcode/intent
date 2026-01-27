import { jwtVerify } from "jose";
import { logger } from "../utils/logger";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface AuthUser {
  id: string;
  login: string;
  name: string | null;
  avatar: string;
}

export interface AuthResult {
  user: AuthUser;
  githubToken: string;
}

/**
 * Extract user from JWT cookie
 */
export async function getAuthUser(cookies: string | undefined): Promise<AuthResult | null> {
  if (!cookies) {
    logger.debug("auth", "No cookies provided");
    return null;
  }

  const tokenMatch = cookies.match(/intent_token=([^;]+)/);
  if (!tokenMatch) {
    logger.debug("auth", "No intent_token cookie found");
    return null;
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(tokenMatch[1], secret);

    logger.debug("auth", `Authenticated user: ${payload.login}`);
    return {
      user: {
        id: payload.sub as string,
        login: payload.login as string,
        name: payload.name as string | null,
        avatar: payload.avatar as string,
      },
      githubToken: payload.github_token as string,
    };
  } catch (error) {
    logger.debug("auth", "JWT verification failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/**
 * Get JWT secret for signing tokens
 */
export function getJWTSecret(): Uint8Array {
  return new TextEncoder().encode(JWT_SECRET);
}

/**
 * Get raw JWT secret string
 */
export function getJWTSecretString(): string {
  return JWT_SECRET;
}
