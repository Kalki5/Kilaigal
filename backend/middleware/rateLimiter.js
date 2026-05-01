// In-memory sliding window rate limiter (per Lambda invocation)
const requestLog = new Map();

/**
 * Express middleware factory that limits requests per user (identified by x-user-phone).
 * Uses a sliding window algorithm with an in-memory store.
 * @param {number} maxRequests - Maximum requests allowed in the window
 * @param {number} windowMs - Window duration in milliseconds
 * @returns {Function} Express middleware
 */
export function rateLimiter(maxRequests, windowMs) {
  return (req, res, next) => {
    const userPhone = req.headers['x-user-phone'];
    if (!userPhone) {
      return next();
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    // Get existing timestamps for this user, or initialize empty array
    let timestamps = requestLog.get(userPhone) || [];

    // Filter out timestamps older than the sliding window
    timestamps = timestamps.filter((ts) => ts > windowStart);

    if (timestamps.length >= maxRequests) {
      // Calculate Retry-After: seconds until the oldest timestamp in the window expires
      const oldestTimestamp = timestamps[0];
      const retryAfterMs = oldestTimestamp + windowMs - now;
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
      });
    }

    // Record this request and proceed
    timestamps.push(now);
    requestLog.set(userPhone, timestamps);
    next();
  };
}

// Exported for testing purposes
export { requestLog };
