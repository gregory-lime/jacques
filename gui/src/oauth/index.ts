/**
 * OAuth Module
 *
 * OAuth helpers for Google Docs and Notion integrations.
 */

export {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
  getGoogleUserInfo,
  parseGoogleCallback,
} from "./google.js";
export type { GoogleOAuthConfig, GoogleTokens, GoogleUserInfo } from "./google.js";

export {
  buildNotionAuthUrl,
  exchangeNotionCode,
  parseNotionCallback,
} from "./notion.js";
export type { NotionOAuthConfig, NotionTokenResponse } from "./notion.js";
