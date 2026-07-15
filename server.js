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
import { isFirebaseInitialized } from "./src/utils/firebaseNotification.js";
import { transporter } from "./src/utils/smtpTransporter.js";

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();

// Render / other reverse proxies — correct client IP for rate limiting and logs
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

/** Comma-separated origins from env (e.g. https://app.vercel.app,https://custom.com) */
function originsFromEnv(value) {
  if (!value || typeof value !== "string") return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

// Function to print service status on startup
const printServiceStatus = () => {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 SERVICE STATUS CHECK");
  console.log("=".repeat(70));
  
  // Check Firebase
  const firebaseStatus = isFirebaseInitialized();
  console.log(`📱 Firebase Push Notifications: ${firebaseStatus ? "✅ ENABLED" : "❌ DISABLED"}`);
  if (!firebaseStatus) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log("   ⚠️  FIREBASE_SERVICE_ACCOUNT is set but initialization failed");
      console.log("   💡 Check if the JSON is valid and properly formatted");
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      console.log("   ⚠️  Individual Firebase env vars are set but initialization failed");
      console.log("   💡 Check if FIREBASE_PRIVATE_KEY has proper newline characters");
    } else {
      console.log("   💡 Set FIREBASE_SERVICE_ACCOUNT environment variable to enable push notifications");
      console.log("   💡 Or set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL");
    }
  }
  
  // Check Email
  const emailStatus = !!transporter;
  console.log(`📧 Email Service: ${emailStatus ? "✅ ENABLED" : "❌ DISABLED"}`);
  if (!emailStatus) {
    console.log(`   EMAIL_USER: ${process.env.EMAIL_USER ? "✅ Set" : "❌ Not set"}`);
    console.log(`   EMAIL_PASS: ${process.env.EMAIL_PASS ? "✅ Set" : "❌ Not set"}`);
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log("   💡 Set EMAIL_USER and EMAIL_PASS environment variables to enable email sending");
    }
  }
  
  console.log("=".repeat(70) + "\n");
};

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
// CORS (Vercel frontend + Render backend)
// ============================================
// FRONTEND_ORIGIN: primary URL(s), comma-separated — e.g. https://your-app.vercel.app
// CORS_ORIGINS:    extra allowed origins (custom domains, preview URLs)
const allowedOrigins = [
  ...originsFromEnv(process.env.FRONTEND_ORIGIN),
  ...originsFromEnv(process.env.CORS_ORIGINS),
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

// Any *.vercel.app when production (Render) or when you explicitly set frontend origin(s)
if (
  process.env.NODE_ENV === "production" ||
  originsFromEnv(process.env.FRONTEND_ORIGIN).length > 0 ||
  originsFromEnv(process.env.CORS_ORIGINS).length > 0
) {
  allowedOrigins.push(/^https:\/\/.*\.vercel\.app$/);
}

const validOrigins = allowedOrigins.filter(Boolean);

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

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

logger.info("Connecting to MongoDB…");

mongoose
  .connect(MONGO_URL, {
    maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE || "50", 10),
    serverSelectionTimeoutMS: 60000, // wait up to 60 s for Atlas cold-start
    connectTimeoutMS: 60000,
  })
  .then(() => {
    logger.info("MongoDB connected ✅");

    // ── Register routes (only after DB is ready) ──────────────────────
    app.use("/", routes);

    // ── Global error handler (must be after routes) ───────────────────
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
      const statusCode = err.status || err.statusCode || 500;
      const message    = err.message || "Internal Server Error";
      const details    = process.env.NODE_ENV === "production" ? undefined : err.stack;
      req.log?.error({ err, statusCode }, "Unhandled error");
      res.status(statusCode).json({ error: message, details });
    });

    // ── Start HTTP server (only after DB + routes are ready) ──────────
    const server = app.listen(PORT, HOST, () => {
      logger.info(`🚀 Server listening on ${HOST}:${PORT}`);
      logger.info(`📡 API available at: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
      logger.info(`🔗 Frontend should connect to: http://localhost:${PORT}`);
    });

    // ── Socket.IO (needs the server object) ───────────────────────────
    const io = new Server(server, {
      cors: {
        origin: function (origin, callback) {
          const socketOrigins = [
<<<<<<< HEAD
            ...originsFromEnv(process.env.FRONTEND_ORIGIN),
            ...originsFromEnv(process.env.CORS_ORIGINS),
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
          ];

          if (
            process.env.NODE_ENV === "production" ||
            originsFromEnv(process.env.FRONTEND_ORIGIN).length > 0 ||
            originsFromEnv(process.env.CORS_ORIGINS).length > 0
          ) {
=======
            process.env.FRONTEND_ORIGIN,
            "http://localhost:5173",
            "http://localhost:3000",
          ].filter(Boolean);

          if (process.env.FRONTEND_ORIGIN) {
>>>>>>> e75b804 (Latest Version)
            socketOrigins.push(/^https:\/\/.*\.vercel\.app$/);
          }

          if (!origin) return callback(null, true);

          const isAllowed = socketOrigins.some(o =>
            typeof o === 'string' ? origin === o : o.test(origin)
          );
          isAllowed ? callback(null, true) : callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ["GET", "POST"],
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      allowEIO3: true,
      maxHttpBufferSize: 1e6,
    });

    io.use(handleSocketAuth);
    io.on("connection", (socket) => handleConnection(socket, io));
    global.io = io;

    logger.info("Socket.IO server initialized");
    printServiceStatus();
  })
  .catch((err) => {
    logger.error({ err }, "MongoDB connection failed — server will NOT start");
    process.exit(1);
  });
