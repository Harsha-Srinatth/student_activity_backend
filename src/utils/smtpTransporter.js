import nodemailer from "nodemailer";
import dotenv from "dotenv";

// Load environment variables (in case this module is imported before dotenv.config() in server.js)
dotenv.config();

// Check if email credentials are configured
const hasEmailCredentials = process.env.EMAIL_USER && process.env.EMAIL_PASS;

// Debug logging (only in development)
if (process.env.NODE_ENV !== 'production') {
  console.log('📧 Email Configuration Check:');
  console.log(`   EMAIL_USER: ${process.env.EMAIL_USER ? '✅ Set' : '❌ Not set'}`);
  console.log(`   EMAIL_PASS: ${process.env.EMAIL_PASS ? '✅ Set' : '❌ Not set'}`);
  console.log(`   SMTP_HOST: ${process.env.SMTP_HOST || 'smtp.gmail.com (default)'}`);
}

// Create transporter only if credentials are available
export const transporter = hasEmailCredentials
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })
  : null;

// Verify transporter configuration on startup
if (hasEmailCredentials && transporter) {
  transporter.verify((error, success) => {
    if (error) {
      console.warn("⚠️  SMTP configuration error:", error.message);
      console.warn("   Email sending will be disabled. Please check EMAIL_USER and EMAIL_PASS environment variables.");
    } else {
      console.log("✅ SMTP transporter configured successfully");
    }
  });
} else {
  console.warn("⚠️  Email credentials not configured (EMAIL_USER and EMAIL_PASS missing)");
  console.warn("   Email sending will be disabled. Registration will still work, but welcome emails won't be sent.");
}

if (process.env.NODE_ENV !== "production") {
  const sendEnabled = (process.env.SEND_EMAILS || process.env.NOTIFICATIONS_ENABLED || "").toLowerCase();
  if (sendEnabled !== "true" && sendEnabled !== "1" && sendEnabled !== "yes") {
    console.log("📧 Notifications/emails are disabled by default. Set SEND_EMAILS=true (or NOTIFICATIONS_ENABLED=true) to send welcome emails.");
  }
}