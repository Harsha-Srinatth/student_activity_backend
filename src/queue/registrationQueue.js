// src/queue/registrationQueue.js
import { Queue } from "bullmq";
import IORedis from "ioredis";

// Explicit host selection
const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = parseInt(process.env.REDIS_PORT || "6379");

const connection = new IORedis({
  host: redisHost,
  port: redisPort,
  password: process.env.REDIS_PASSWORD || undefined,
});

export const registrationQueue = new Queue("registration-queue", {
  connection,
  defaultJobOptions: {
    removeOnComplete: {
      age: 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 86400,
      count: 500,
    },
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

export function createRegistrationQueue() {
  return registrationQueue;
}