import IORedis from "ioredis";

// Redis connection for OTP storage
// In Docker container: REDIS_HOST=redis (service name), port 6379
// From host machine: REDIS_HOST=127.0.0.1, port 6380 (Docker mapped port)
// If REDIS_HOST is set, use it; otherwise detect based on environment
const redisHost = process.env.REDIS_HOST || (process.env.NODE_ENV === 'production' ? "redis" : "127.0.0.1");
// If connecting from host to Docker Redis, use port 6380 (mapped port)
// If connecting from Docker container to Docker Redis, use port 6379 (container port)
const redisPort = process.env.REDIS_PORT 
  ? parseInt(process.env.REDIS_PORT) 
  : (process.env.NODE_ENV === 'production' ? 6379 : 6380);

let client = null;
let isConnected = false;

// Create Redis client with lazy connection
try {
  client = new IORedis({
    host: redisHost,
    port: redisPort,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      // Stop retrying after 5 attempts
      if (times > 5) {
        console.warn('Redis: Max retry attempts reached. OTP functionality may be unavailable.');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    lazyConnect: true, // Don't connect immediately
    enableOfflineQueue: false, // Don't queue commands when offline
  });

  client.on('error', (err) => {
    isConnected = false;
    // Only log if it's not a connection refused (which is expected when Redis is not running)
    if (err.code !== 'ECONNREFUSED') {
      console.error('Redis Client Error:', err.message);
    }
  });

  client.on('connect', () => {
    isConnected = true;
    console.log('Redis Client Connected');
  });

  client.on('ready', () => {
    isConnected = true;
    console.log('Redis Client Ready');
  });

  client.on('close', () => {
    isConnected = false;
    console.log('Redis Client Disconnected');
  });
  } catch (error) {
  console.error('Failed to create Redis client:', error.message);
}

// Helper to check if Redis is available
export const isRedisAvailable = () => {
  return client && isConnected && client.status === 'ready';
};

// Helper to ensure Redis is connected
export const ensureRedisConnection = async () => {
  if (!client) {
    console.warn('Redis client not initialized');
    return false;
  }
  
  try {
    if (client.status === 'ready') {
      return true;
    }
    
    if (client.status === 'end' || client.status === 'close') {
      // Reconnect if disconnected
      try {
        await client.connect();
      } catch (connectError) {
        console.warn('Redis reconnection failed:', connectError.message);
        return false;
      }
    }
    
    // Wait a bit for connection to establish
    if (client.status === 'connecting' || client.status === 'connect') {
      // Wait for ready state
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('Redis connection timeout');
          resolve(false);
        }, 2000);
        
        const checkReady = () => {
          if (client && client.status === 'ready') {
            clearTimeout(timeout);
            client.removeListener('ready', checkReady);
            client.removeListener('error', checkError);
            resolve(true);
          }
        };
        
        const checkError = (err) => {
          clearTimeout(timeout);
          client.removeListener('ready', checkReady);
          client.removeListener('error', checkError);
          console.warn('Redis connection error:', err.message);
          resolve(false);
        };
        
        client.once('ready', checkReady);
        client.once('error', checkError);
      });
    }
    
    return client.status === 'ready';
  } catch (error) {
    console.warn('Redis connection check failed:', error.message);
    return false;
  }
};

export default client;

