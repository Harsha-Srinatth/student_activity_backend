import HOD from "../../models/Hod/hodDetails.js";
import { 
  addOrUpdateDeviceToken, 
  removeDeviceToken, 
  removeAllDeviceTokens,
  getUserAgentDeviceName 
} from "../../utils/fcmTokenManager.js";

const updateHODSettings = async (req, res) => {
  try {
    const hodId = req.user?.hodId;
    if (!hodId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const allowedFields = [
      "fullname",
      "mobile",
      "email",
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
        const hod = await HOD.findOne({ hodId });
        if (hod) {
          await removeDeviceToken(hod, deviceId);
          await hod.save();
          updatedToken = null; // Device removed, no token
        }
        fcmTokenHandled = true;
      } else if (action === 'removeAll') {
        // Remove all devices
        const hod = await HOD.findOne({ hodId });
        if (hod) {
          await removeAllDeviceTokens(hod);
          await hod.save();
          updatedToken = null; // All devices removed
        }
        fcmTokenHandled = true;
      } else if (token && deviceId) {
        // Add or update device token
        const hod = await HOD.findOne({ hodId });
        if (hod) {
          const deviceNameToUse = deviceName || getUserAgentDeviceName(req);
          await addOrUpdateDeviceToken(hod, token, deviceId, deviceNameToUse);
          await hod.save();
          // Get the token for this specific device
          const device = hod.fcmDevices.find(d => d.deviceId === deviceId);
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
        updates[key] = req.body[key];
      }
    }

    // Only update if there are other fields to update (FCM token already handled above)
    // If only fcmTokenData was provided, that's valid - no need for other fields
    if (Object.keys(updates).length > 0) {
      await HOD.findOneAndUpdate(
        { hodId },
        { $set: updates },
        { new: true, runValidators: true }
      );
    }
    
    // If no updates provided and no FCM token was handled, return error
    if (Object.keys(updates).length === 0 && !fcmTokenHandled) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    // Fetch updated HOD for response
    const hod = await HOD.findOne({ hodId }).select(
      "hodId fullname email mobile collegeId department fcmDevices"
    ).lean();

    if (!hod) {
      return res.status(404).json({ message: "HOD not found" });
    }

    // Return token - use updatedToken if available (from fcmTokenData update), otherwise first device token
    const responseData = hod;
    if (updatedToken !== null && updatedToken !== undefined) {
      // Return the token that was just updated/added
      responseData.fcmToken = updatedToken;
    } else {
      // Return first token from fcmDevices (or null if no devices)
      responseData.fcmToken = (hod.fcmDevices && hod.fcmDevices.length > 0) 
        ? hod.fcmDevices[0].token 
        : null;
    }

    return res.json({ message: "Settings updated", hod: responseData });
  } catch (error) {
    console.error("Error updating HOD settings:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export default updateHODSettings;

