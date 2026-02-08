/**
 * Google OAuth Helpers
 *
 * Handles OAuth flow for Google Docs integration.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// Required scopes for Google Drive access
const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface GoogleOAuthConfig {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GoogleUserInfo {
  email: string;
  verified_email: boolean;
  picture?: string;
}

/**
 * Build Google OAuth authorization URL
 */
export function buildGoogleAuthUrl(config: GoogleOAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.client_id,
    redirect_uri: config.redirect_uri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // Request refresh token
    prompt: "consent", // Force consent to get refresh token
  });

  return `${GOOGLE_AUTH_URL}?${params}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeGoogleCode(
  code: string,
  config: GoogleOAuthConfig
): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      code,
      redirect_uri: config.redirect_uri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

/**
 * Refresh access token using refresh token
 */
export async function refreshGoogleToken(
  refreshToken: string,
  config: Omit<GoogleOAuthConfig, "redirect_uri">
): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json();
}

/**
 * Get user info (email) using access token
 */
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get user info");
  }

  return response.json();
}

/**
 * Parse OAuth callback URL to extract code or error
 */
export function parseGoogleCallback(url: string): { code?: string; error?: string } {
  const searchParams = new URLSearchParams(new URL(url).search);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return { error };
  }

  if (code) {
    return { code };
  }

  return { error: "No code or error in callback URL" };
}
