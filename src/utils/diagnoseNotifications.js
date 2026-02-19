/**
 * Diagnostic utility to check notification and email service status
 * This helps identify why notifications/emails are not working
 */

import { transporter } from "./smtpTransporter.js";

/**
 * Diagnose notification and email service status
 * Returns a detailed report of what's configured and what's missing
 */
export const diagnoseServices = () => {
  const report = {
    timestamp: new Date().toISOString(),
    firebase: {
      initialized: false,
      method: null,
      error: null,
      status: "❌ Not Initialized",
    },
    email: {
      configured: false,
      status: "❌ Not Configured",
      details: {},
    },
    recommendations: [],
  };

  // Check Firebase Admin SDK status
  try {
    // Try to import and check if Firebase is initialized
    import("firebase-admin").then((admin) => {
      if (admin.default.apps.length > 0) {
        report.firebase.initialized = true;
        report.firebase.status = "✅ Initialized";
        
        // Try to determine how it was initialized
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          report.firebase.method = "Environment Variable (FIREBASE_SERVICE_ACCOUNT)";
        } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
          report.firebase.method = "Environment Variables (Individual)";
        } else {
          report.firebase.method = "File-based (Local Development)";
        }
      } else {
        report.firebase.status = "❌ Not Initialized";
        report.firebase.error = "Firebase Admin SDK apps array is empty";
        
        // Check what credentials are available
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          report.firebase.error = "FIREBASE_SERVICE_ACCOUNT is set but Firebase failed to initialize";
          report.recommendations.push("Check if FIREBASE_SERVICE_ACCOUNT JSON is valid");
        } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
          report.firebase.error = "Individual Firebase env vars are set but Firebase failed to initialize";
          report.recommendations.push("Check if FIREBASE_PRIVATE_KEY has proper newline characters (\\n)");
        } else {
          report.firebase.error = "No Firebase credentials found";
          report.recommendations.push("Set FIREBASE_SERVICE_ACCOUNT environment variable with your Firebase service account JSON");
        }
      }
    }).catch((err) => {
      report.firebase.error = err.message;
      report.recommendations.push("Firebase Admin SDK module not available or failed to load");
    });
  } catch (err) {
    report.firebase.error = err.message;
  }

  // Check Email/SMTP status
  if (transporter) {
    report.email.configured = true;
    report.email.status = "✅ Configured";
    report.email.details = {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || "587",
      user: process.env.EMAIL_USER ? "✅ Set" : "❌ Not Set",
    };
  } else {
    report.email.status = "❌ Not Configured";
    report.email.details = {
      EMAIL_USER: process.env.EMAIL_USER ? "✅ Set" : "❌ Not Set",
      EMAIL_PASS: process.env.EMAIL_PASS ? "✅ Set" : "❌ Not Set",
      SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com (default)",
    };
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      report.recommendations.push("Set EMAIL_USER and EMAIL_PASS environment variables to enable email sending");
    }
  }

  return report;
};

/**
 * Print diagnostic report to console
 */
export const printDiagnosticReport = () => {
  const report = diagnoseServices();
  
  console.log("\n" + "=".repeat(60));
  console.log("🔍 NOTIFICATION & EMAIL SERVICE DIAGNOSTICS");
  console.log("=".repeat(60));
  console.log(`Timestamp: ${report.timestamp}\n`);
  
  console.log("📱 FIREBASE PUSH NOTIFICATIONS:");
  console.log(`   Status: ${report.firebase.status}`);
  if (report.firebase.method) {
    console.log(`   Method: ${report.firebase.method}`);
  }
  if (report.firebase.error) {
    console.log(`   Error: ${report.firebase.error}`);
  }
  console.log();
  
  console.log("📧 EMAIL SERVICE:");
  console.log(`   Status: ${report.email.status}`);
  Object.entries(report.email.details).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}`);
  });
  console.log();
  
  if (report.recommendations.length > 0) {
    console.log("💡 RECOMMENDATIONS:");
    report.recommendations.forEach((rec, idx) => {
      console.log(`   ${idx + 1}. ${rec}`);
    });
    console.log();
  }
  
  console.log("=".repeat(60) + "\n");
  
  return report;
};

