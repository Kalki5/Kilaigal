// Feature: enhanced-family-tree, Property 8: Rate limiter sliding window
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { rateLimiter, requestLog } from '../../middleware/rateLimiter.js';

const MAX_REQUESTS = 10;
const WINDOW_MS = 60000; // 60 seconds

/**
 * Helper: create a mock req with a given user phone header.
 */
function mockReq(phone) {
  return { headers: { 'x-user-phone': phone } };
}

/**
 * Helper: create a mock res that captures status code, headers, and JSON body.
 */
function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    set(key, value) {
      res.headers[key] = value;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
  };
  return res;
}

/**
 * Helper: invoke the rate limiter middleware and return whether the request was allowed.
 * Returns { allowed, res } where allowed is true if next() was called.
 */
function invokeMiddleware(middleware, phone) {
  const req = mockReq(phone);
  const res = mockRes();
  let allowed = false;
  const next = () => {
    allowed = true;
  };
  middleware(req, res, next);
  return { allowed, res };
}

describe('Property 8: Rate limiter sliding window', () => {
  // **Validates: Requirements 10.1**

  let middleware;

  beforeEach(() => {
    vi.useFakeTimers();
    requestLog.clear();
    middleware = rateLimiter(MAX_REQUESTS, WINDOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows at most 10 requests within any 60-second window', () => {
    fc.assert(
      fc.property(
        // Generate a sorted array of timestamps within a single 60-second window
        fc.array(
          fc.integer({ min: 0, max: WINDOW_MS - 1 }),
          { minLength: 1, maxLength: 30 }
        ),
        (offsets) => {
          requestLog.clear();
          const baseTime = 1000000;
          const phone = '+1234567890';

          // Sort offsets so we process them in chronological order
          const sorted = [...offsets].sort((a, b) => a - b);

          let allowedCount = 0;

          for (const offset of sorted) {
            vi.setSystemTime(baseTime + offset);
            const { allowed } = invokeMiddleware(middleware, phone);
            if (allowed) {
              allowedCount++;
            }
          }

          // Within a single 60-second window, at most MAX_REQUESTS should be allowed
          expect(allowedCount).toBeLessThanOrEqual(MAX_REQUESTS);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects the 11th request within any 60-second window', () => {
    fc.assert(
      fc.property(
        // Generate exactly 11 timestamps within a 60-second window
        fc.array(
          fc.integer({ min: 0, max: WINDOW_MS - 1 }),
          { minLength: 11, maxLength: 11 }
        ),
        (offsets) => {
          requestLog.clear();
          const baseTime = 1000000;
          const phone = '+1234567890';

          const sorted = [...offsets].sort((a, b) => a - b);

          const results = [];
          for (const offset of sorted) {
            vi.setSystemTime(baseTime + offset);
            const { allowed, res } = invokeMiddleware(middleware, phone);
            results.push({ allowed, res });
          }

          // Count allowed requests
          const allowedCount = results.filter((r) => r.allowed).length;

          // Exactly 10 should be allowed, the 11th should be rejected
          expect(allowedCount).toBe(MAX_REQUESTS);

          // The 11th result should be rejected with 429
          const rejectedResults = results.filter((r) => !r.allowed);
          expect(rejectedResults.length).toBe(1);
          expect(rejectedResults[0].res.statusCode).toBe(429);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('allows requests outside the sliding window', () => {
    fc.assert(
      fc.property(
        // Generate a gap duration that places the next request outside the window
        fc.integer({ min: WINDOW_MS, max: WINDOW_MS * 3 }),
        (gapMs) => {
          requestLog.clear();
          const baseTime = 1000000;
          const phone = '+1234567890';

          // Fill up the window with MAX_REQUESTS requests at baseTime
          vi.setSystemTime(baseTime);
          for (let i = 0; i < MAX_REQUESTS; i++) {
            const { allowed } = invokeMiddleware(middleware, phone);
            expect(allowed).toBe(true);
          }

          // Verify the next request at baseTime is rejected
          const { allowed: rejectedAtBase } = invokeMiddleware(middleware, phone);
          expect(rejectedAtBase).toBe(false);

          // Move time forward past the window
          vi.setSystemTime(baseTime + gapMs);

          // This request should be allowed since old timestamps have expired
          const { allowed: allowedAfterGap } = invokeMiddleware(middleware, phone);
          expect(allowedAfterGap).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
