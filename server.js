// server.js

// docker compose up -d --build
//stop 
// docker compose down
//locally
//docker-compose up redis -d
import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import pino from "pino";
import expressPino from "pino-http";

import authRoutes from "./src/routes/authRoutes.js";
import { createRegistrationQueue } from "./src/queue/registrationQueue.js";

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();

// Middleware
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);

app.use(expressPino({ logger }));

// Rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/register", limiter);

// -------------------------------
// MongoDB connection
// -------------------------------
const MONGO_URL =
  process.env.MONGO_URL ||
  "mongodb://127.0.0.1:27017/facultydb"; // fallback for local dev

mongoose
  .connect(MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE || "50", 10),
  })
  .then(() => logger.info("MongoDB connected"))
  .catch((err) => {
    logger.error({ err }, "MongoDB connection error");
    process.exit(1);
  });

// -------------------------------
// Redis Queue
// -------------------------------
// Detect whether running in Docker (REDIS_HOST=redis) or local (127.0.0.1)
process.env.REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
process.env.REDIS_PORT = process.env.REDIS_PORT || "6379";

createRegistrationQueue();

// Routes
app.use("/", authRoutes);

// Global JSON error handler (captures Multer/Cloudinary and other errors)
// Must be after all routes
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  // Optionally include details in non-production
  const details = process.env.NODE_ENV === "production" ? undefined : err.stack;
  req.log?.error({ err, statusCode }, "Unhandled error");
  res.status(statusCode).json({ error: message, details });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => logger.info(`Server listening on port ${PORT}`));
