import type { CookieOptions, Response } from 'express';

interface CookieCall {
  name: string;
  value: string;
  options: CookieOptions | undefined;
}

export interface MockResponse extends Response {
  statusCode: number;
  jsonBody: unknown;
  cookieCalls: CookieCall[];
}

export function createMockResponse(): MockResponse {
  const res = {
    statusCode: 200,
    jsonBody: undefined as unknown,
    cookieCalls: [] as CookieCall[],
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
    cookie(name: string, value: string, options?: CookieOptions) {
      this.cookieCalls.push({ name, value, options });
      return this;
    },
  };

  return res as MockResponse;
}
