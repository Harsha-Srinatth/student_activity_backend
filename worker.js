
// worker.js
import dotenv from "dotenv";
import { Worker, QueueScheduler } from "bullmq";
import IORedis from "ioredis";
import mongoose from "mongoose";
import pino from "pino";
import bcrypt from "bcryptjs";
import FacultyDetails from "./src/models/facultyDetails.js";
import StudentDetails from "./src/models/studentDetails.js";

dotenv.config();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// Redis connection (Upstash first, fallback local)
// In Docker: REDIS_HOST=redis (service name), locally: REDIS_HOST=127.0.0.1
const connection = new IORedis({
  host: process.env.REDIS_HOST || (process.env.NODE_ENV === 'production' ? "redis" : "127.0.0.1"),
  port: parseInt(process.env.REDIS_PORT || "6379"),
});


// Schedule to handle stalled jobs
new QueueScheduler("registration-queue", { connection });

const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "8", 10);

// Connect to Mongo
const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  logger.error("MONGO_URL is not set in environment variables");
  process.exit(1);
}

mongoose
  .connect(MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE || "50", 10),
  })
  .then(() => logger.info("Worker connected to MongoDB"))
  .catch((err) => {
    logger.error(err, "Worker MongoDB connection failed");
    process.exit(1);
  });

// Worker handles both Faculty and Student jobs
const worker = new Worker(
  "registration-queue",
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "Processing job");
    const data = job.data;

    try {
      const hashedPassword = await bcrypt.hash(data.password, 12);

      if (job.name === "faculty-register") {
        const doc = {
          facultyid: data.facultyid,
          fullname: data.fullname,
          username: data.username,
          institution: data.institution,
          dept: data.dept,
          email: data.email,
          mobile: data.mobile,
          password: hashedPassword,
          dateofjoin: data.dateofjoin,
        };

        await FacultyDetails.collection.insertOne(doc).catch((err) => {
          if (err.code === 11000) {
            const key = Object.keys(err.keyValue || {}).join(", ");
            logger.warn({ jobId: job.id, key }, "Duplicate faculty - skipping insert");
          } else {
            throw err;
          }
        });
      } else if (job.name === "student-register") {
        const doc = {
          studentid: data.studentid,
          fullname: data.fullname,
          username: data.username,
          institution: data.institution,
          dept: data.dept,
          email: data.email,
          mobileno: data.mobileno,
          password: hashedPassword,
          programName: data.programName,
          semester: data.semester,
          facultyid: data.facultyid,
          dateofjoin: data.dateofjoin,
        };

        await StudentDetails.collection.insertOne(doc).catch((err) => {
          if (err.code === 11000) {
            const key = Object.keys(err.keyValue || {}).join(", ");
            logger.warn({ jobId: job.id, key }, "Duplicate student - skipping insert");
          } else {
            throw err;
          }
        });
      } else {
        logger.warn({ jobId: job.id, name: job.name }, "Unknown job type");
      }

      return { ok: true };
    } catch (err) {
      logger.error({ err, jobId: job.id }, "Failed processing job");
      throw err;
    }
  },
  { connection, concurrency }
);

// Events
worker.on("completed", (job) =>
  logger.info({ jobId: job.id, name: job.name }, "Job completed")
);
worker.on("failed", (job, err) =>
  logger.error({ jobId: job?.id, name: job?.name, err }, "Job failed")
);

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received: closing worker");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received: closing worker");
  await worker.close();
  process.exit(0);
});