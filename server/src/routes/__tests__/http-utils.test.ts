/**
 * HTTP utils tests
 */

import { parseBody, sendJson, getMimeType, createSSEWriter } from '../http-utils.js';
import { createMockRequest, createMockResponse, getSentJson } from './test-helpers.js';

describe('sendJson', () => {
  it('sends JSON response with correct headers', () => {
    const res = createMockResponse();
    sendJson(res, 200, { hello: 'world' });

    const { status, data } = getSentJson(res);
    expect(status).toBe(200);
    expect(data).toEqual({ hello: 'world' });
    expect(res._mockData.headers['Content-Type']).toBe('application/json');
    expect(res._mockData.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('sends error responses', () => {
    const res = createMockResponse();
    sendJson(res, 404, { error: 'Not found' });

    const { status, data } = getSentJson(res);
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'Not found' });
  });

  it('sends null body', () => {
    const res = createMockResponse();
    sendJson(res, 200, null);

    const { status, data } = getSentJson(res);
    expect(status).toBe(200);
    expect(data).toBeNull();
  });
});

describe('parseBody', () => {
  it('parses valid JSON body', async () => {
    const req = createMockRequest({ body: { name: 'test' } });
    const result = await parseBody<{ name: string }>(req);
    expect(result).toEqual({ name: 'test' });
  });

  it('returns null for invalid JSON', async () => {
    const req = createMockRequest();
    // Override to send invalid JSON
    process.nextTick(() => {
      // The default createMockRequest already emits 'end' with no data
      // so this will try to parse '' which is invalid
    });
    // We need a fresh request that sends bad data
    const { EventEmitter } = await import('events');
    const badReq = new EventEmitter() as typeof req;
    badReq.method = 'POST';
    process.nextTick(() => {
      badReq.emit('data', Buffer.from('not-json'));
      badReq.emit('end');
    });
    const result = await parseBody(badReq);
    expect(result).toBeNull();
  });

  it('returns null on request error', async () => {
    const { EventEmitter } = await import('events');
    const req = new EventEmitter() as ReturnType<typeof createMockRequest>;
    req.method = 'POST';
    process.nextTick(() => {
      req.emit('error', new Error('connection reset'));
    });
    const result = await parseBody(req);
    expect(result).toBeNull();
  });
});

describe('getMimeType', () => {
  it('returns correct MIME types', () => {
    expect(getMimeType('file.html')).toBe('text/html');
    expect(getMimeType('file.js')).toBe('application/javascript');
    expect(getMimeType('file.css')).toBe('text/css');
    expect(getMimeType('file.json')).toBe('application/json');
    expect(getMimeType('file.png')).toBe('image/png');
    expect(getMimeType('file.svg')).toBe('image/svg+xml');
  });

  it('returns octet-stream for unknown extensions', () => {
    expect(getMimeType('file.xyz')).toBe('application/octet-stream');
    expect(getMimeType('file.bin')).toBe('application/octet-stream');
  });
});

describe('createSSEWriter', () => {
  it('sets SSE headers', () => {
    const res = createMockResponse();
    createSSEWriter(res);

    expect(res._mockData.statusCode).toBe(200);
    expect(res._mockData.headers['Content-Type']).toBe('text/event-stream');
    expect(res._mockData.headers['Cache-Control']).toBe('no-cache');
  });

  it('writes SSE events', () => {
    const res = createMockResponse();
    const sse = createSSEWriter(res);

    sse.send('progress', { percent: 50 });

    expect(res._mockData.body).toContain('event: progress\n');
    expect(res._mockData.body).toContain('data: {"percent":50}\n');
  });

  it('ends the response', () => {
    const res = createMockResponse();
    const sse = createSSEWriter(res);
    sse.end();

    expect(res._mockData.ended).toBe(true);
  });
});
