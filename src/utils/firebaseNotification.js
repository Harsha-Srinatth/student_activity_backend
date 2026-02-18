import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin SDK
let firebaseAdminInitialized = false;

try {
  // Initialize Firebase Admin if not already initialized
  if (!admin.apps.length) {
    let credential;
    
    // Priority 1: Use environment variables (for production/cloud deployments)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        // Parse JSON from environment variable
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(serviceAccount);
        console.log("✅ Firebase Admin SDK initialized from environment variable");
      } catch (parseError) {
        console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:", parseError.message);
        throw parseError;
      }
    }
    // Priority 2: Use individual environment variables (alternative method)
    else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      });
      console.log("✅ Firebase Admin SDK initialized from individual environment variables");
    }
    // Priority 3: Try to load from file (for local development)
    else {
      const serviceAccountPath = path.join(
        __dirname,
        "../../college360x-firebase-adminsdk-fbsvc-1474ab2f32.json"
      );
      
      // Check if file exists before trying to load it
      if (fs.existsSync(serviceAccountPath)) {
        try {
          credential = admin.credential.cert(serviceAccountPath);
          console.log("✅ Firebase Admin SDK initialized from file (local development)");
        } catch (fileError) {
          console.error("❌ Error loading Firebase credentials file:", fileError.message);
          console.warn("⚠️  Firebase notifications will be disabled.");
          // credential remains undefined, so Firebase won't be initialized
        }
      } else {
        // File doesn't exist - this is OK for production
        console.warn("⚠️  Firebase credentials file not found. Firebase notifications will be disabled.");
        console.warn("   To enable Firebase notifications, set FIREBASE_SERVICE_ACCOUNT environment variable");
        console.warn("   or provide FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL");
        // credential remains undefined, so Firebase won't be initialized
      }
    }
    
    // Initialize with the credential we found (only if credential was set)
    if (credential) {
      admin.initializeApp({
        credential: credential,
      });
      firebaseAdminInitialized = true;
    } else {
      // No credential found - Firebase will remain uninitialized
      firebaseAdminInitialized = false;
    }
  } else {
    firebaseAdminInitialized = true;
  }
} catch (error) {
  console.error("❌ Error initializing Firebase Admin SDK:", error.message);
  console.warn("⚠️  Firebase notifications will be disabled. App will continue to work without push notifications.");
  firebaseAdminInitialized = false;
}

/**
 * Send push notification to a single device
 * @param {string} fcmToken - The FCM token of the device
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload (optional)
 * @returns {Promise<object>} - Result of the notification send
 */
export const sendNotification = async (fcmToken, title, body, data = {}) => {
  console.log("🔔 [NOTIFICATION] Attempting to send notification:", { title, body, hasToken: !!fcmToken, data });
  
  if (!firebaseAdminInitialized) {
    console.warn("⚠️  [NOTIFICATION] Firebase Admin SDK is not initialized - notification skipped");
    return { success: false, error: "Firebase Admin SDK not initialized" };
  }

  if (!fcmToken) {
    console.warn("⚠️ [NOTIFICATION] No FCM token provided");
    return { success: false, error: "No FCM token provided" };
  }

  try {
    // Get base URL from environment or use default
    // For production, this should be your deployed frontend URL
    // For web push, icon needs to be a publicly accessible URL
    const baseUrl = process.env.FRONTEND_URL || process.env.VITE_API_URL?.replace('/api', '') || "http://localhost:5173";
    // Use weblogo.jpg from public folder
    const iconUrl = `${baseUrl}/weblogo.jpg`;
    
    const message = {
      notification: {
        title: `College360x: ${title}`,
        body: body,
      },
      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      token: fcmToken,
      // Android specific options
      android: {
        notification: {
          icon: "logo",
          sound: "default",
          channelId: "college360x_notifications",
          imageUrl: iconUrl,
        },
      },
      // Web push specific options
      webpush: {
        notification: {
          icon: iconUrl,
          badge: iconUrl,
          requireInteraction: false,
          title: `College360x: ${title}`,
        },
        fcmOptions: {
          link: data.link || "/",
        },
      },
      // APNS (iOS) specific options
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            alert: {
              title: `College360x: ${title}`,
              body: body,
            },
          },
        },
        fcmOptions: {
          imageUrl: iconUrl,
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("✅ [NOTIFICATION] Successfully sent notification:", { messageId: response, title, body });
    return { success: true, messageId: response };
  } catch (error) {
    console.error("❌ [NOTIFICATION] Error sending notification:", { error: error.message, code: error.code, title, body });
    
    // Handle invalid token errors
    if (error.code === "messaging/invalid-registration-token" || 
        error.code === "messaging/registration-token-not-registered") {
      return { 
        success: false, 
        error: "Invalid or unregistered token",
        code: error.code 
      };
    }
    
    return { success: false, error: error.message, code: error.code };
  }
};

/**
 * Send push notification to multiple devices
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload (optional)
 * @returns {Promise<object>} - Result of the batch notification send
 */
export const sendBatchNotifications = async (fcmTokens, title, body, data = {}) => {
  console.log("🔔 [NOTIFICATION] Attempting to send batch notifications:", { 
    title, 
    body, 
    tokenCount: fcmTokens?.length || 0, 
    data 
  });
  
  if (!firebaseAdminInitialized) {
    console.warn("⚠️  [NOTIFICATION] Firebase Admin SDK is not initialized - batch notifications skipped");
    return { success: false, error: "Firebase Admin SDK not initialized" };
  }

  if (!fcmTokens || fcmTokens.length === 0) {
    console.warn("No FCM tokens provided");
    return { success: false, error: "No FCM tokens provided" };
  }

  // Filter out null/undefined tokens
  const validTokens = fcmTokens.filter(token => token && token.trim() !== "");

  if (validTokens.length === 0) {
    console.warn("⚠️ [NOTIFICATION] No valid FCM tokens provided after filtering");
    return { success: false, error: "No valid FCM tokens provided" };
  }
  
  console.log(`📤 [NOTIFICATION] Sending to ${validTokens.length} valid tokens (filtered from ${fcmTokens.length} total)`);

  try {
    // Get base URL from environment or use default
    // For web push, icon needs to be a publicly accessible URL
    const baseUrl = process.env.FRONTEND_URL || process.env.VITE_API_URL?.replace('/api', '') || "http://localhost:5173";
    // Use weblogo.jpg from public folder
    const iconUrl = `${baseUrl}/weblogo.jpg`;
    
    const messages = validTokens.map(token => ({
      notification: {
        title: `College360x: ${title}`,
        body: body,
      },
      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      token: token,
      // Android specific options
      android: {
        notification: {
          icon: "logo",
          sound: "default",
          channelId: "college360x_notifications",
          imageUrl: iconUrl,
        },
      },
      // Web push specific options
      webpush: {
        notification: {
          icon: iconUrl,
          badge: iconUrl,
          requireInteraction: false,
          title: `College360x: ${title}`,
        },
        fcmOptions: {
          link: data.link || "/",
        },
      },
      // APNS (iOS) specific options
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            alert: {
              title: `College360x: ${title}`,
              body: body,
            },
          },
        },
        fcmOptions: {
          imageUrl: iconUrl,
        },
      },
    }));

    const response = await admin.messaging().sendEach(messages);
    console.log(`✅ [NOTIFICATION] Successfully sent ${response.successCount} out of ${validTokens.length} notifications`);
    if (response.failureCount > 0) {
      console.warn(`⚠️ [NOTIFICATION] Failed to send ${response.failureCount} notifications`);
      // Log failed tokens for debugging
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`❌ [NOTIFICATION] Failed token ${idx + 1}:`, resp.error?.message || resp.error);
        }
      });
    }
    
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    };
  } catch (error) {
    console.error("❌ [NOTIFICATION] Error sending batch notifications:", { error: error.message, code: error.code, title, body });
    return { success: false, error: error.message };
  }
};

/**
 * Send welcome notification after registration
 * @param {string} fcmToken - The FCM token of the newly registered user
 * @param {string} userName - Name of the user
 * @param {string} userType - Type of user (student/faculty/hod)
 * @returns {Promise<object>} - Result of the notification send
 */
export const sendWelcomeNotification = async (fcmToken, userName, userType = "user") => {
  if (!fcmToken) {
    console.log("No FCM token provided for welcome notification");
    return { success: false, error: "No FCM token provided" };
  }

  const title = "Welcome to College360x! 🎉";
  const body = `Hello ${userName}, your registration was successful! We're excited to have you onboard.`;

  const data = {
    type: "registration",
    userType: userType,
    timestamp: new Date().toISOString(),
  };

  return await sendNotification(fcmToken, title, body, data);
};

/**
 * Send notification to student by studentid
 * @param {string} studentid - Student ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload (optional)
 * @returns {Promise<object>} - Result of the notification send
 */
export const sendNotificationToStudent = async (studentid, title, body, data = {}) => {
  try {
    const StudentDetails = (await import("../models/student/studentDetails.js")).default;
    const student = await StudentDetails.findOne({ studentid }).select("fcmToken").lean();
    
    if (!student || !student.fcmToken) {
      return { success: false, error: "Student not found or no FCM token" };
    }
    
    return await sendNotification(student.fcmToken, title, body, data);
  } catch (error) {
    console.error("Error sending notification to student:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to faculty by facultyid
 * @param {string} facultyid - Faculty ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload (optional)
 * @returns {Promise<object>} - Result of the notification send
 */
export const sendNotificationToFaculty = async (facultyid, title, body, data = {}) => {
  try {
    const FacultyDetails = (await import("../models/faculty/facultyDetails.js")).default;
    const faculty = await FacultyDetails.findOne({ facultyid }).select("fcmToken").lean();
    
    if (!faculty || !faculty.fcmToken) {
      return { success: false, error: "Faculty not found or no FCM token" };
    }
    
    return await sendNotification(faculty.fcmToken, title, body, data);
  } catch (error) {
    console.error("Error sending notification to faculty:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to HOD by hodId
 * @param {string} hodId - HOD ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload (optional)
 * @returns {Promise<object>} - Result of the notification send
 */
export const sendNotificationToHOD = async (hodId, title, body, data = {}) => {
  try {
    const HOD = (await import("../models/Hod/hodDetails.js")).default;
    const hod = await HOD.findOne({ hodId }).select("fcmToken").lean();
    
    if (!hod || !hod.fcmToken) {
      return { success: false, error: "HOD not found or no FCM token" };
    }
    
    return await sendNotification(hod.fcmToken, title, body, data);
  } catch (error) {
    console.error("Error sending notification to HOD:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notifications to multiple students
 * @param {string[]} studentIds - Array of student IDs
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload (optional)
 * @returns {Promise<object>} - Result of the batch notification send
 */
export const sendNotificationsToStudents = async (studentIds, title, body, data = {}) => {
  try {
    const StudentDetails = (await import("../models/student/studentDetails.js")).default;
    const students = await StudentDetails.find({ studentid: { $in: studentIds } })
      .select("fcmToken")
      .lean();
    
    const fcmTokens = students
      .map(s => s.fcmToken)
      .filter(token => token && token.trim() !== "");
    
    if (fcmTokens.length === 0) {
      return { success: false, error: "No valid FCM tokens found" };
    }
    
    return await sendBatchNotifications(fcmTokens, title, body, data);
  } catch (error) {
    console.error("Error sending notifications to students:", error);
    return { success: false, error: error.message };
  }
};

