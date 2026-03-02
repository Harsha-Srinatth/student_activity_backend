/**
 * Optional Redis client for caching. If REDIS_URL is not set, get/set are no-ops (always cache miss).
 * Uses node-redis (v5) - createClient from 'redis'.
 */
import { createClient } from "redis";

let client = null;

/**
 * Get Redis client. Connects on first use if REDIS_URL is set.
 * @returns {Promise<import('redis').RedisClientType | null>}
 */
export async function getRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (client) return client;
  try {
    client = createClient({ url });
    client.on("error", (err) => console.error("Redis error:", err.message));
    await client.connect();
    return client;
  } catch (err) {
    console.error("Redis connect failed:", err.message);
    return null;
  }
}

/**
 * Get a string value from Redis. Returns null if Redis is unavailable or key is missing.
 * @param {string} key
 * @returns {Promise<string | null>}
 */
export async function redisGet(key) {
  const c = await getRedisClient();
  if (!c) return null;
  try {
    return await c.get(key);
  } catch {
    return null;
  }
}

/**
 * Set a string value in Redis. No-op if Redis is unavailable.
 * @param {string} key
 * @param {string} value
 * @param {object} [options] - e.g. { EX: 3600 } for TTL in seconds
 */
export async function redisSet(key, value, options = {}) {
  const c = await getRedisClient();
  if (!c) return;
  try {
    if (Object.keys(options).length) {
      await c.set(key, value, options);
    } else {
      await c.set(key, value);
    }
  } catch (err) {
    console.error("Redis set error:", err?.message);
  }
}
