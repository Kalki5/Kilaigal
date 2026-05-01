import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimiter, requestLog } from "../../middleware/rateLimiter.js";

const MAX_REQUESTS = 10;
const WINDOW_MS = 60000; // 60 seconds

/**
 * Helper: create a mock req with a given user phone header.
 */
function mockReq(phone) {
  return { headers: { "x-user-phone": phone } };
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

describe("rateLimiter unit tests", () => {
  // _Requirements: 10.1, 10.2_

  let middleware;

  beforeEach(() => {
    vi.useFakeTimers();
    requestLog.clear();
    middleware = rateLimiter(MAX_REQUESTS, WINDOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("allows requests under the limit", () => {
    it("allows a single request from a user", () => {
      vi.setSystemTime(1000000);
      const { allowed } = invokeMiddleware(middleware, "+1234567890");
      expect(allowed).toBe(true);
    });

    it("allows exactly 10 requests within the window", () => {
      const phone = "+1234567890";
      vi.setSystemTime(1000000);

      for (let i = 0; i < MAX_REQUESTS; i++) {
        const { allowed } = invokeMiddleware(middleware, phone);
        expect(allowed).toBe(true);
      }
    });

    it("allows requests from different users independently", () => {
      vi.setSystemTime(1000000);

      // Fill up user A's limit
      for (let i = 0; i < MAX_REQUESTS; i++) {
        invokeMiddleware(middleware, "+1111111111");
      }

      // User B should still be allowed
      const { allowed } = invokeMiddleware(middleware, "+2222222222");
      expect(allowed).toBe(true);
    });

    it("calls next() without setting status for requests without x-user-phone header", () => {
      const req = { headers: {} };
      const res = mockRes();
      let nextCalled = false;
      middleware(req, res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBeNull();
    });
  });

  describe("rejects the 11th request within the window", () => {
    it("rejects the 11th request with 429 status", () => {
      const phone = "+1234567890";
      vi.setSystemTime(1000000);

      // Make 10 allowed requests
      for (let i = 0; i < MAX_REQUESTS; i++) {
        const { allowed } = invokeMiddleware(middleware, phone);
        expect(allowed).toBe(true);
      }

      // 11th request should be rejected
      const { allowed, res } = invokeMiddleware(middleware, phone);
      expect(allowed).toBe(false);
      expect(res.statusCode).toBe(429);
    });

    it("returns the correct error message body on rejection", () => {
      const phone = "+1234567890";
      vi.setSystemTime(1000000);

      for (let i = 0; i < MAX_REQUESTS; i++) {
        invokeMiddleware(middleware, phone);
      }

      const { res } = invokeMiddleware(middleware, phone);
      expect(res.body).toEqual({
        error: "Rate limit exceeded. Please try again later.",
      });
    });
  });

  describe("returns correct Retry-After header value", () => {
    it("sets Retry-After header in seconds (rounded up) on rejection", () => {
      const phone = "+1234567890";
      const baseTime = 1000000;
      vi.setSystemTime(baseTime);

      // Make 10 requests at baseTime
      for (let i = 0; i < MAX_REQUESTS; i++) {
        invokeMiddleware(middleware, phone);
      }

      // 11th request at the same time — oldest timestamp expires in exactly 60s
      const { res } = invokeMiddleware(middleware, phone);
      expect(res.headers["Retry-After"]).toBe("60");
    });

    it("calculates Retry-After correctly when time has partially elapsed", () => {
      const phone = "+1234567890";
      const baseTime = 1000000;

      // Make 10 requests at baseTime
      vi.setSystemTime(baseTime);
      for (let i = 0; i < MAX_REQUESTS; i++) {
        invokeMiddleware(middleware, phone);
      }

      // Advance 30 seconds (30000ms) — oldest timestamp expires in 30s
      vi.setSystemTime(baseTime + 30000);
      const { res } = invokeMiddleware(middleware, phone);
      expect(res.headers["Retry-After"]).toBe("30");
    });

    it("rounds Retry-After up using Math.ceil for fractional seconds", () => {
      const phone = "+1234567890";
      const baseTime = 1000000;

      // Make 10 requests at baseTime
      vi.setSystemTime(baseTime);
      for (let i = 0; i < MAX_REQUESTS; i++) {
        invokeMiddleware(middleware, phone);
      }

      // Advance 30500ms — oldest expires in 29500ms = 29.5s → ceil = 30
      vi.setSystemTime(baseTime + 30500);
      const { res } = invokeMiddleware(middleware, phone);
      expect(res.headers["Retry-After"]).toBe("30");
    });
  });

  describe("allows requests after the window expires", () => {
    it("allows a request after the full window has elapsed", () => {
      const phone = "+1234567890";
      const baseTime = 1000000;

      // Fill up the limit
      vi.setSystemTime(baseTime);
      for (let i = 0; i < MAX_REQUESTS; i++) {
        invokeMiddleware(middleware, phone);
      }

      // Verify rejected at current time
      const { allowed: rejected } = invokeMiddleware(middleware, phone);
      expect(rejected).toBe(false);

      // Move past the window (60001ms later)
      vi.setSystemTime(baseTime + WINDOW_MS + 1);

      // Should be allowed again
      const { allowed } = invokeMiddleware(middleware, phone);
      expect(allowed).toBe(true);
    });

    it("allows a new burst of 10 requests after the window expires", () => {
      const phone = "+1234567890";
      const baseTime = 1000000;

      // First burst: fill up the limit
      vi.setSystemTime(baseTime);
      for (let i = 0; i < MAX_REQUESTS; i++) {
        invokeMiddleware(middleware, phone);
      }

      // Move past the window
      vi.setSystemTime(baseTime + WINDOW_MS + 1);

      // Second burst: should allow another 10
      for (let i = 0; i < MAX_REQUESTS; i++) {
        const { allowed } = invokeMiddleware(middleware, phone);
        expect(allowed).toBe(true);
      }

      // 11th in the new window should be rejected
      const { allowed: rejected } = invokeMiddleware(middleware, phone);
      expect(rejected).toBe(false);
    });

    it("uses sliding window — partial expiry allows partial new requests", () => {
      const phone = "+1234567890";
      const baseTime = 1000000;

      // Make 5 requests at baseTime
      vi.setSystemTime(baseTime);
      for (let i = 0; i < 5; i++) {
        invokeMiddleware(middleware, phone);
      }

      // Make 5 more requests at baseTime + 30000 (30s later)
      vi.setSystemTime(baseTime + 30000);
      for (let i = 0; i < 5; i++) {
        invokeMiddleware(middleware, phone);
      }

      // At baseTime + 30000, all 10 are within the window → 11th rejected
      const { allowed: rejected } = invokeMiddleware(middleware, phone);
      expect(rejected).toBe(false);

      // Move to baseTime + 60001 — the first 5 requests expire, 5 remain
      vi.setSystemTime(baseTime + WINDOW_MS + 1);

      // Should allow 5 more requests (5 old ones expired, 5 from 30s ago remain)
      for (let i = 0; i < 5; i++) {
        const { allowed } = invokeMiddleware(middleware, phone);
        expect(allowed).toBe(true);
      }

      // Now at 10 again within the window → 11th rejected
      const { allowed: rejectedAgain } = invokeMiddleware(middleware, phone);
      expect(rejectedAgain).toBe(false);
    });
  });
});
