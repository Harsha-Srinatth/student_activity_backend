import StudentDetails from "../../models/student/studentDetails.js";
import bcrypt from "bcryptjs";
import { 
  addOrUpdateDeviceToken, 
  removeDeviceToken, 
  removeAllDeviceTokens,
  getUserAgentDeviceName 
} from "../../utils/fcmTokenManager.js";

const updateStudentSettings = async (req, res) => {
  try {
    const studentid = req.user?.studentid;
    if (!studentid) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const allowedFields = [
      "fullname",
      "username",
      "email",
      "password",
      "image",
      "dept",
      "programName",
      "semester",
      "facultyid",
      "fcmTokenData", // { token, deviceId, deviceName, action }
    ];
    const updates = {};
    
    // Handle FCM token separately (multi-device support)
    let fcmTokenHandled = false;
    let updatedToken = null; // Store the token that was updated/added
    
    if (req.body.fcmTokenData !== undefined) {
      const { token, deviceId, deviceName, action } = req.body.fcmTokenData;
      
      if (action === 'remove' && deviceId) {
        // Remove specific device
        const student = await StudentDetails.findOne({ studentid });
        if (student) {
          await removeDeviceToken(student, deviceId);
          await student.save();
          updatedToken = null; // Device removed, no token
        }
        fcmTokenHandled = true;
      } else if (action === 'removeAll') {
        // Remove all devices
        const student = await StudentDetails.findOne({ studentid });
        if (student) {
          await removeAllDeviceTokens(student);
          await student.save();
          updatedToken = null; // All devices removed
        }
        fcmTokenHandled = true;
      } else if (token && deviceId) {
        // Add or update device token
        const student = await StudentDetails.findOne({ studentid });
        if (student) {
          const deviceNameToUse = deviceName || getUserAgentDeviceName(req);
          await addOrUpdateDeviceToken(student, token, deviceId, deviceNameToUse);
          await student.save();
          // Get the token for this specific device
          const device = student.fcmDevices.find(d => d.deviceId === deviceId);
          updatedToken = device ? device.token : token;
        }
        fcmTokenHandled = true;
      }
    }
    
    // fcmTokenData is required for FCM token management
    // Legacy fcmToken field is no longer supported
    
    // Process other allowed fields
    for (const key of allowedFields) {
      if (req.body[key] !== undefined && key !== "fcmTokenData") {
        // Special handling for password - hash it before saving
        if (key === "password") {
          if (req.body[key].trim().length < 8) {
            return res.status(400).json({ 
              message: "Password must be at least 8 characters long" 
            });
          }
          updates[key] = await bcrypt.hash(req.body[key], 12);
        } 
        // Special handling for image - it's an object with url property
        else if (key === "image" && typeof req.body[key] === "string") {
          updates["image.url"] = req.body[key];
        } 
        // For other fields, set directly
        else if (key !== "image") {
          updates[key] = req.body[key];
        }
      }
    }

    // If no updates provided and no FCM token was handled, return error
    if (Object.keys(updates).length === 0 && !fcmTokenHandled) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    // Validate email format if email is being updated
    if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Only update if there are other fields to update (FCM token already handled above)
    if (Object.keys(updates).length > 0) {
      await StudentDetails.findOneAndUpdate(
        { studentid },
        { $set: updates },
        { runValidators: true }
      );
    }

    // Fetch updated student for response
    const student = await StudentDetails.findOne({ studentid }).select(
      "studentid fullname username email image dept programName semester facultyid fcmDevices"
    ).lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Return token - use updatedToken if available (from fcmTokenData update), otherwise first device token
    const responseData = student;
    if (updatedToken !== null && updatedToken !== undefined) {
      // Return the token that was just updated/added
      responseData.fcmToken = updatedToken;
    } else {
      // Return first token from fcmDevices (or null if no devices)
      responseData.fcmToken = (student.fcmDevices && student.fcmDevices.length > 0) 
        ? student.fcmDevices[0].token 
        : null;
    }

    return res.json({ message: "Profile updated successfully", student: responseData });
  } catch (error) {
    console.error("Error updating student profile:", error);
    
    // Handle duplicate key errors (unique constraint violations)
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0];
      return res.status(400).json({ 
        message: `${field} already exists. Please use a different ${field}.` 
      });
    }
    
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export default updateStudentSettings;


