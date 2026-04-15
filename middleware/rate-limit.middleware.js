const logger = require('../utils/logger');

function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const maxRequests = options.maxRequests || 100;
  const message = options.message || 'Too many requests. Please try again shortly.';
  const keyGenerator = options.keyGenerator || ((req) => req.ip || 'unknown');
  const store = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const key = keyGenerator(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.expiresAt <= now) {
      store.set(key, {
        count: 1,
        expiresAt: now + windowMs,
      });
      return next();
    }

    entry.count += 1;

    if (entry.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((entry.expiresAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      logger.info('HTTP rate limit exceeded', {
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
      });
      return res.status(429).json({ message });
    }

    return next();
  };
}

module.exports = createRateLimiter;
