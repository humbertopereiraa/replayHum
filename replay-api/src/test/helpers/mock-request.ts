import type { Request } from 'express';

type MockRequestOverrides = Partial<
  Pick<Request, 'body' | 'query' | 'params' | 'cookies' | 'headers'>
> & {
  googleSub?: string;
  unitId?: number;
};

export function createMockRequest(overrides: MockRequestOverrides = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    cookies: {},
    headers: {},
    ...overrides,
  } as Request;
}
