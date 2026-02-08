/**
 * Test helpers for route module tests
 */

import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import type { RouteContext } from '../types.js';

/**
 * Create a mock IncomingMessage with optional body data
 */
export function createMockRequest(options: {
  method?: string;
  url?: string;
  body?: unknown;
} = {}): IncomingMessage {
  const { method = 'GET', url = '/', body } = options;

  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:4243' };

  // Simulate body streaming if body provided
  if (body !== undefined) {
    process.nextTick(() => {
      req.emit('data', Buffer.from(JSON.stringify(body)));
      req.emit('end');
    });
  } else {
    process.nextTick(() => {
      req.emit('end');
    });
  }

  return req;
}

interface MockResponseData {
  statusCode: number;
  headers: Record<string, string | number>;
  body: string;
  chunks: string[];
  ended: boolean;
}

/**
 * Create a mock ServerResponse that captures written data
 */
export function createMockResponse(): ServerResponse & { _mockData: MockResponseData } {
  const mockData: MockResponseData = {
    statusCode: 200,
    headers: {},
    body: '',
    chunks: [],
    ended: false,
  };

  const res = new EventEmitter() as ServerResponse & { _mockData: MockResponseData };
  res._mockData = mockData;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).writeHead = (statusCode: number, headers?: Record<string, string | number>) => {
    mockData.statusCode = statusCode;
    if (headers) {
      Object.assign(mockData.headers, headers);
    }
    return res;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).write = (chunk: string | Buffer) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString();
    mockData.chunks.push(str);
    mockData.body += str;
    return true;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).end = (chunk?: string | Buffer) => {
    if (chunk) {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      mockData.body += str;
    }
    mockData.ended = true;
    res.emit('finish');
    return res;
  };

  return res;
}

/**
 * Extract parsed JSON from a mock response
 */
export function getSentJson(res: ReturnType<typeof createMockResponse>): { status: number; data: unknown } {
  return {
    status: res._mockData.statusCode,
    data: JSON.parse(res._mockData.body),
  };
}

/**
 * Create a full RouteContext for testing a route handler
 */
export function createMockContext(options: {
  method?: string;
  url?: string;
  body?: unknown;
  notificationService?: RouteContext['notificationService'];
} = {}): { ctx: RouteContext; res: ReturnType<typeof createMockResponse> } {
  const { method = 'GET', url = '/', body, notificationService } = options;

  const req = createMockRequest({ method, url, body });
  const res = createMockResponse();

  const parsedUrl = new URL(url, 'http://localhost:4243');

  const ctx: RouteContext = {
    req,
    res,
    url: parsedUrl.pathname,
    rawUrl: url,
    method: method,
    query: parsedUrl.searchParams,
    notificationService,
    log: () => {},
  };

  return { ctx, res };
}
