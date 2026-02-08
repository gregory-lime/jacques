/**
 * Route types for the HTTP API
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { NotificationService } from '../services/notification-service.js';

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: string;           // pathname (no query string)
  rawUrl: string;        // original url
  method: string;
  query: URLSearchParams;
  notificationService?: NotificationService;
  log: (...args: unknown[]) => void;
}

export type RouteHandler = (ctx: RouteContext) => Promise<boolean>;
