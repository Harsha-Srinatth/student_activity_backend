/**
 * FCM Token Manager
 * Handles multi-device FCM token management with device tracking
 */

/**
 * Add or update FCM token for a device
 * @param {Object} userDoc - Mongoose user document (Student, Faculty, or HOD)
 * @param {string} token - FCM token
 * @param {string} deviceId - Unique device identifier
 * @param {string} deviceName - Device name (optional)
 * @returns {Promise<Object>} Updated user document
 */
export const addOrUpdateDeviceToken = async (userDoc, token, deviceId, deviceName = null) => {
  if (!userDoc || !token || !deviceId) {
    throw new Error('User document, token, and deviceId are required');
  }

  // Initialize fcmDevices if it doesn't exist
  if (!userDoc.fcmDevices) {
    userDoc.fcmDevices = [];
  }

  // Check if device already exists
  const existingDeviceIndex = userDoc.fcmDevices.findIndex(
    device => device.deviceId === deviceId
  );

  if (existingDeviceIndex >= 0) {
    // Update existing device token
    userDoc.fcmDevices[existingDeviceIndex].token = token;
    userDoc.fcmDevices[existingDeviceIndex].lastUsed = new Date();
    if (deviceName) {
      userDoc.fcmDevices[existingDeviceIndex].deviceName = deviceName;
    }
    console.log(`🔄 [FCM] Updated token for device ${deviceId}`);
  } else {
    // Add new device
    userDoc.fcmDevices.push({
      deviceId,
      token,
      deviceName: deviceName || getUserAgentDeviceName(),
      lastUsed: new Date(),
      createdAt: new Date()
    });
    console.log(`✅ [FCM] Added new device ${deviceId}`);
  }

  return userDoc;
};

/**
 * Remove FCM token for a specific device
 * @param {Object} userDoc - Mongoose user document
 * @param {string} deviceId - Device identifier to remove
 * @returns {Promise<Object>} Updated user document
 */
export const removeDeviceToken = async (userDoc, deviceId) => {
  if (!userDoc || !deviceId) {
    throw new Error('User document and deviceId are required');
  }

  if (!userDoc.fcmDevices || userDoc.fcmDevices.length === 0) {
    return userDoc;
  }

  // Remove device
  userDoc.fcmDevices = userDoc.fcmDevices.filter(
    device => device.deviceId !== deviceId
  );

  console.log(`❌ [FCM] Removed device ${deviceId}`);
  return userDoc;
};

/**
 * Remove FCM token by token value (useful for cleaning up invalid tokens)
 * @param {Object} userDoc - Mongoose user document
 * @param {string} token - FCM token to remove
 * @returns {Promise<Object>} Updated user document
 */
export const removeDeviceTokenByToken = async (userDoc, token) => {
  if (!userDoc || !token) {
    throw new Error('User document and token are required');
  }

  if (!userDoc.fcmDevices || userDoc.fcmDevices.length === 0) {
    return userDoc;
  }

  const initialLength = userDoc.fcmDevices.length;
  // Remove device(s) with this token
  userDoc.fcmDevices = userDoc.fcmDevices.filter(
    device => device.token !== token
  );

  if (userDoc.fcmDevices.length < initialLength) {
    console.log(`❌ [FCM] Removed device(s) with invalid token ${token.substring(0, 20)}...`);
  }
  
  return userDoc;
};

/**
 * Remove all FCM tokens (disable notifications)
 * @param {Object} userDoc - Mongoose user document
 * @returns {Promise<Object>} Updated user document
 */
export const removeAllDeviceTokens = async (userDoc) => {
  if (!userDoc) {
    throw new Error('User document is required');
  }

  userDoc.fcmDevices = [];
  userDoc.fcmToken = [];
  
  console.log(`❌ [FCM] Removed all devices`);
  return userDoc;
};

/**
 * Get all active FCM tokens for a user
 * @param {Object} userDoc - Mongoose user document
 * @returns {string[]} Array of FCM tokens
 */
export const getAllTokens = (userDoc) => {
  if (!userDoc || !userDoc.fcmDevices || userDoc.fcmDevices.length === 0) {
    return [];
  }
  return userDoc.fcmDevices.map(device => device.token).filter(Boolean);
};

/**
 * Get first token (for backward compatibility)
 * @param {Object} userDoc - Mongoose user document
 * @returns {string|null} First FCM token or null
 */
export const getFirstToken = (userDoc) => {
  const tokens = getAllTokens(userDoc);
  return tokens.length > 0 ? tokens[0] : null;
};

/**
 * Sync fcmToken array from fcmDevices (for backward compatibility)
 * @param {Object} userDoc - Mongoose user document
 */
export const syncFcmTokenArray = (userDoc) => {
  if (!userDoc) return;
  
  if (userDoc.fcmDevices && userDoc.fcmDevices.length > 0) {
    userDoc.fcmToken = userDoc.fcmDevices.map(device => device.token).filter(Boolean);
  } else {
    userDoc.fcmToken = [];
  }
};

/**
 * Get device name from user agent (if available in request)
 * @param {Object} req - Express request object (optional)
 * @returns {string} Device name
 */
export const getUserAgentDeviceName = (req = null) => {
  if (req && req.headers && req.headers['user-agent']) {
    const ua = req.headers['user-agent'];
    // Simple device detection
    if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
      if (ua.includes('Android')) {
        const match = ua.match(/Android\s+([^;)]+)/);
        return match ? `Android ${match[1]}` : 'Android Mobile';
      }
      if (ua.includes('iPhone')) {
        const match = ua.match(/iPhone OS\s+([_\d]+)/);
        return match ? `iPhone iOS ${match[1].replace(/_/g, '.')}` : 'iPhone';
      }
      return 'Mobile Device';
    }
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Mac')) return 'Mac';
    if (ua.includes('Linux')) return 'Linux PC';
  }
  return 'Unknown Device';
};

/**
 * Clean up old/invalid tokens (optional utility)
 * @param {Object} userDoc - Mongoose user document
 * @param {number} daysOld - Remove tokens older than this many days (default: 90)
 * @returns {Promise<Object>} Updated user document
 */
export const cleanupOldTokens = async (userDoc, daysOld = 90) => {
  if (!userDoc || !userDoc.fcmDevices) {
    return userDoc;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const initialCount = userDoc.fcmDevices.length;
  userDoc.fcmDevices = userDoc.fcmDevices.filter(device => {
    return device.lastUsed && new Date(device.lastUsed) > cutoffDate;
  });

  if (userDoc.fcmDevices.length < initialCount) {
    syncFcmTokenArray(userDoc);
    console.log(`🧹 [FCM] Cleaned up ${initialCount - userDoc.fcmDevices.length} old tokens`);
  }

  return userDoc;
};

