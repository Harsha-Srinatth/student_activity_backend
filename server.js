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

import routes from "./src/routes/index.js";
// import { createRegistrationQueue } from "./src/queue/registrationQueue.js"; // Disabled
import { Server } from "socket.io";
import { handleSocketAuth, handleConnection } from "./src/socket/socketHandlers.js";

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();

// Middleware
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

// ============================================
// LOCAL DEVELOPMENT CORS CONFIGURATION (COMMENTED)
// ============================================
// Uncomment this section for local development
/*
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
*/

// ============================================
// PRODUCTION CORS CONFIGURATION
// ============================================
// CORS configuration - allow multiple origins for Vercel deployments
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN, // Production URL
  "http://localhost:5173",     // Local development
  "http://localhost:3000",     // Alternative local port
];

// Add Vercel preview URLs pattern if FRONTEND_ORIGIN is set
if (process.env.FRONTEND_ORIGIN) {
  // Extract base domain from FRONTEND_ORIGIN (e.g., student-frontend-phi.vercel.app)
  const baseDomain = process.env.FRONTEND_ORIGIN.replace(/^https?:\/\//, '');
  // Allow all Vercel preview deployments (*.vercel.app)
  allowedOrigins.push(new RegExp(`^https://.*\\.vercel\\.app$`));
}

// Filter out undefined values
const validOrigins = allowedOrigins.filter(origin => origin);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Check if origin matches any allowed origin
      const isAllowed = validOrigins.some(allowedOrigin => {
        if (typeof allowedOrigin === 'string') {
          return origin === allowedOrigin;
        } else if (allowedOrigin instanceof RegExp) {
          return allowedOrigin.test(origin);
        }
        return false;
      });
      
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
  process.env.MONGO_URL; // fallback for local dev

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

app.use("/", routes);

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

// Default to port 5000 for local development, use PORT env variable if set (for production)
const PORT = process.env.PORT || 5000;
// Listen on 0.0.0.0 for cloud deployments (Render, Railway, etc.) or when PORT is set
// Use 127.0.0.1 only for local development when PORT is not set by the platform
// Render and other cloud platforms always set PORT, so we bind to 0.0.0.0 to be accessible
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const server = app.listen(PORT, HOST, () => {
  logger.info(`🚀 Server listening on ${HOST}:${PORT}`);
  logger.info(`📡 API available at: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  logger.info(`🔗 Frontend should connect to: http://localhost:${PORT}`);
});

// -------------------------------
// Socket.IO Setup
// -------------------------------
// LOCAL DEVELOPMENT Socket.IO CORS (COMMENTED)
// Uncomment for local development:
/*
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"],
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
  maxHttpBufferSize: 1e6,
});
*/

// PRODUCTION Socket.IO CORS
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      const socketOrigins = [
        process.env.FRONTEND_ORIGIN,
        "http://localhost:5173",
        "http://localhost:3000",
      ].filter(Boolean);
      
      if (process.env.FRONTEND_ORIGIN) {
        socketOrigins.push(/^https:\/\/.*\.vercel\.app$/);
      }
      
      if (!origin) return callback(null, true);
      
      const isAllowed = socketOrigins.some(allowedOrigin => {
        if (typeof allowedOrigin === 'string') {
          return origin === allowedOrigin;
        } else if (allowedOrigin instanceof RegExp) {
          return allowedOrigin.test(origin);
        }
        return false;
      });
      
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ['websocket', 'polling'],
  // Connection timeout settings
  pingTimeout: 60000,      // 60 seconds - how long to wait for pong before considering connection dead
  pingInterval: 25000,     // 25 seconds - how often to send ping packets
  // Connection management
  allowEIO3: true,         // Allow Engine.IO v3 clients
  maxHttpBufferSize: 1e6,  // 1MB max message size
});

// Socket authentication middleware
io.use(handleSocketAuth);

// Handle socket connections
io.on("connection", (socket) => {
  handleConnection(socket, io);
});

// Make io available globally for use in controllers
global.io = io;

logger.info("Socket.IO server initialized");
