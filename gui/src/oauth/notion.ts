/**
 * Notion OAuth Helpers
 *
 * Handles OAuth flow for Notion integration.
 */

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

export interface NotionOAuthConfig {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string;
  owner: {
    type: string;
    user?: {
      id: string;
      name?: string;
      avatar_url?: string;
      type: string;
      person?: {
        email?: string;
      };
    };
  };
}

/**
 * Build Notion OAuth authorization URL
 */
export function buildNotionAuthUrl(config: NotionOAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.client_id,
    redirect_uri: config.redirect_uri,
    response_type: "code",
    owner: "user",
  });

  return `${NOTION_AUTH_URL}?${params}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeNotionCode(
  code: string,
  config: NotionOAuthConfig
): Promise<NotionTokenResponse> {
  // Notion requires Basic auth for token exchange
  const credentials = btoa(`${config.client_id}:${config.client_secret}`);

  const response = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirect_uri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

/**
 * Parse OAuth callback URL to extract code or error
 */
export function parseNotionCallback(url: string): { code?: string; error?: string } {
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
