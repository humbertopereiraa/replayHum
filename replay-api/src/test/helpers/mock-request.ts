import type { Request } from 'express';

type MockRequestOverrides = Partial<
  Pick<Request, 'body' | 'query' | 'params' | 'cookies' | 'headers'>
> & {
  studentId?: number;
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
