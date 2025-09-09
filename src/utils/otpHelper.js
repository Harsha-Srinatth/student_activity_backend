import crypto from "crypto";
import client from "./redisClient.js";

const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || "6", 10);
const OTP_TTL = parseInt(process.env.OTP_TTL_SECONDS || "300", 10);

// generate OTP
export function generateOtp() {
  return Math.floor(10 * (OTP_LENGTH - 1) + Math.random() * 9 * 10 * (OTP_LENGTH - 1)).toString();
}

// hash OTP before storing
function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// save OTP in redis
export async function saveOtp(mobile, otp) {
  const hashed = hashOtp(otp);
  await client.setEx(`otp:${mobile}`, OTP_TTL, hashed);
}

// verify OTP
export async function verifyOtp(mobile, otp) {
  const storedHash = await client.get(`otp:${mobile}`);
  if (!storedHash) return false;
  const incomingHash = hashOtp(otp);
  if (incomingHash !== storedHash) return false;

  // remove after success
  await client.del(`otp:${mobile}`);
  return true;
}