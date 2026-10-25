interface RateLimitRecord {
  timestamps: number[];
}

const windowMs = 60 * 1000; // 1 minute window
const maxRequestsPerWindow = 20; // 20 inits per minute per IP

const ipRecords = new Map<string, RateLimitRecord>();

// Clean up stale entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRecords.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);
    if (record.timestamps.length === 0) {
      ipRecords.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref?.();

export function checkRateLimit(ip: string): {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
} {
  const now = Date.now();
  const record = ipRecords.get(ip) || { timestamps: [] };

  // Retain only requests within current window
  const activeTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (activeTimestamps.length >= maxRequestsPerWindow) {
    const oldestTimestamp = activeTimestamps[0];
    const reset = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
    return {
      success: false,
      limit: maxRequestsPerWindow,
      remaining: 0,
      reset: Math.max(reset, 1),
    };
  }

  activeTimestamps.push(now);
  ipRecords.set(ip, { timestamps: activeTimestamps });

  return {
    success: true,
    limit: maxRequestsPerWindow,
    remaining: maxRequestsPerWindow - activeTimestamps.length,
    reset: 60,
  };
}
