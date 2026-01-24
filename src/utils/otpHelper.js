import crypto from "crypto";
import client, { isRedisAvailable, ensureRedisConnection } from "./redisClient.js";

const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || "6", 10);
const OTP_TTL = parseInt(process.env.OTP_TTL_SECONDS || "300", 10);

// In-memory OTP storage fallback (for development when Redis is not available)
const memoryStore = new Map();

// generate OTP
export function generateOtp() {
  // Generate a random OTP of specified length (default 6 digits)
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

// hash OTP before storing
function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// save OTP in redis (with fallback to memory)
export async function saveOtp(mobile, otp) {
  const hashed = hashOtp(otp);
  
  // Try Redis first
  if (client) {
    try {
      // Ensure connection is established
      const connected = await ensureRedisConnection();
      
      if (connected && client.status === 'ready') {
        // Use setex (lowercase) which is the Redis command, or setEx if available
        if (typeof client.setEx === 'function') {
          await client.setEx(`otp:${mobile}`, OTP_TTL, hashed);
        } else if (typeof client.setex === 'function') {
          await client.setex(`otp:${mobile}`, OTP_TTL, hashed);
        } else {
          // Fallback: use set with expire
          await client.set(`otp:${mobile}`, hashed, 'EX', OTP_TTL);
        }
        return; // Success, exit early
      }
    } catch (error) {
      // Redis failed, fall through to memory storage
      console.warn('Redis error, using in-memory storage:', error.message);
    }
  }
  
  // Fallback to in-memory storage
  memoryStore.set(`otp:${mobile}`, {
    hash: hashed,
    expiresAt: Date.now() + (OTP_TTL * 1000)
  });
  // Clean up expired entries
  setTimeout(() => memoryStore.delete(`otp:${mobile}`), OTP_TTL * 1000);
  if (!client || !isRedisAvailable()) {
    console.warn('Redis not available, using in-memory storage for OTP (not persistent)');
  }
}

// verify OTP (with fallback to memory)
export async function verifyOtp(mobile, otp) {
  try {
    let storedHash = null;
    
    // Try Redis first
    if (client) {
      try {
        const connected = await ensureRedisConnection();
        
        if (connected && client.status === 'ready') {
          storedHash = await client.get(`otp:${mobile}`);
        }
      } catch (error) {
        // Redis read failed, fall through to memory
      }
    }
    
    // If not found in Redis, check memory store
    if (!storedHash) {
      const stored = memoryStore.get(`otp:${mobile}`);
      if (stored && stored.expiresAt > Date.now()) {
        storedHash = stored.hash;
      } else if (stored) {
        // Expired, remove it
        memoryStore.delete(`otp:${mobile}`);
      }
    }
    
    if (!storedHash) return false;
    
    const incomingHash = hashOtp(otp);
    if (incomingHash !== storedHash) return false;

    // remove after success
    if (client) {
      try {
        const connected = await ensureRedisConnection();
        if (connected && client.status === 'ready') {
          await client.del(`otp:${mobile}`);
        } else {
          memoryStore.delete(`otp:${mobile}`);
        }
      } catch (error) {
        // Redis delete failed, try memory
        memoryStore.delete(`otp:${mobile}`);
      }
    } else {
      memoryStore.delete(`otp:${mobile}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error verifying OTP:', error.message);
    return false;
  }
}