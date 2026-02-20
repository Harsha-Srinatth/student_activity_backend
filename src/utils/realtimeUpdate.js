import socketManager from '../socket/socketManager.js';
import { emitToUser, emitToRole } from '../socket/socketHandlers.js';

/**
 * Unified Real-Time Update System
 * Updates data in backend first, then emits to connected clients only
 * Reduces unnecessary network traffic and ensures data consistency
 */

/**
 * Emit update to specific user if connected
 * Uses SocketManager for efficient checking and emission
 * @param {Object} io - Socket.IO instance
 * @param {string} userId - User ID
 * @param {string} role - User role
 * @param {string} event - Event name
 * @param {Object} data - Data to emit
 * @returns {boolean} - True if user is connected and update was sent
 */
export const emitToUserIfConnected = (io, userId, role, event, data) => {
  if (!io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return false;
  }

  if (!userId || !role) {
    console.warn('emitToUserIfConnected: Missing userId or role', { userId, role });
    return false;
  }

  // Validate role - "both" is not a valid role
  if (role === "both") {
    console.error(`❌ [SOCKET] Invalid role "both" passed to emitToUserIfConnected. Role should be "student" or "faculty", not "both". UserId: ${userId}, Event: ${event}`);
    return false;
  }

  // Validate role is one of the valid roles
  const validRoles = ['student', 'faculty', 'hod', 'admin'];
  if (!validRoles.includes(role)) {
    console.error(`❌ [SOCKET] Invalid role "${role}" passed to emitToUserIfConnected. Valid roles are: ${validRoles.join(', ')}. UserId: ${userId}, Event: ${event}`);
    return false;
  }

  if (!socketManager.isUserConnected(userId, role)) {
    console.log(`⚠️ User ${userId} (${role}) not connected, skipping emit: ${event}`);
    return false;
  }

  const emitted = socketManager.emitToUser(io, userId, role, event, data);
  if (emitted) {
    console.log(`✅ Emitted ${event} to user ${userId} (${role})`);
  }
  return emitted;
};

/**
 * Emit update to all users of a role if any are connected
 * @param {Object} io - Socket.IO instance
 * @param {string} role - Role name (student, faculty, hod)
 * @param {string} event - Event name
 * @param {Object} data - Data to emit
 * @returns {boolean} - True if any users of role are connected
 */
export const emitToRoleIfConnected = (io, role, event, data) => {
  if (!io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return false;
  }

  // Validate role - "both" is not a valid role, it should be expanded before calling this function
  if (role === "both") {
    console.error(`❌ [SOCKET] Invalid role "both" passed to emitToRoleIfConnected. This should be expanded to ["student", "faculty"] before calling. Event: ${event}`);
    // Automatically expand "both" to student and faculty as a safety net
    let emitted = false;
    if (socketManager.isRoleConnected('student')) {
      emitToRole(io, 'student', event, data);
      emitted = true;
    }
    if (socketManager.isRoleConnected('faculty')) {
      emitToRole(io, 'faculty', event, data);
      emitted = true;
    }
    return emitted;
  }

  // Validate role is one of the valid roles
  const validRoles = ['student', 'faculty', 'hod', 'admin'];
  if (!validRoles.includes(role)) {
    console.error(`❌ [SOCKET] Invalid role "${role}" passed to emitToRoleIfConnected. Valid roles are: ${validRoles.join(', ')}. Event: ${event}`);
    return false;
  }

  if (!socketManager.isRoleConnected(role)) {
    console.log(`⚠️ No ${role} users connected, skipping emit: ${event}`);
    return false;
  }

  emitToRole(io, role, event, data);
  console.log(`✅ Emitted ${event} to role ${role}`);
  return true;
};

/**
 * Emit dashboard update to user (student/faculty/hod)
 * Uses SocketManager for efficient emission
 * @param {string} userId - User ID
 * @param {string} role - User role
 * @param {string} updateType - Type of update (counts, stats, approvals, etc.)
 * @param {Object} data - Data to emit
 */
export const emitDashboardUpdate = (userId, role, updateType, data) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return false;
  }

  if (!userId || !role) {
    console.warn('emitDashboardUpdate: Missing userId or role', { userId, role });
    return false;
  }

  const event = `dashboard:${updateType}`;
  let emitted = false;

  // Emit to specific user if connected using SocketManager
  emitted = emitToUserIfConnected(global.io, userId, role, event, data);

  // Also emit to role if needed (for multi-user updates)
  if (role) {
    emitToRoleIfConnected(global.io, role, `${event}:${role}`, data);
  }

  return emitted;
};

/**
 * Emit student dashboard update
 */
export const emitStudentUpdate = (studentId, updateType, data) => {
  return emitDashboardUpdate(studentId, 'student', updateType, data);
};

/**
 * Emit faculty dashboard update
 */
export const emitFacultyUpdate = (facultyId, updateType, data) => {
  return emitDashboardUpdate(facultyId, 'faculty', updateType, data);
};

/**
 * Emit HOD dashboard update
 */
export const emitHODUpdate = (hodId, updateType, data) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return false;
  }

  if (!hodId) {
    console.warn('emitHODUpdate: hodId is required');
    return false;
  }

  const event = `dashboard:hod:${updateType}`;
  let emitted = false;

  // Emit to specific user if connected (role is 'hod')
  emitted = emitToUserIfConnected(global.io, hodId, 'hod', event, data);

  // Also emit to role if needed
  emitToRoleIfConnected(global.io, 'hod', `${event}:hod`, data);

  return emitted;
};

/**
 * Emit notification to user if connected
 * Uses SocketManager for efficient emission
 * @param {string} userId - User ID
 * @param {string} role - User role
 * @param {Object} notification - Notification data
 */
export const emitNotification = (userId, role, notification) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return false;
  }

  if (!userId || !role) {
    console.warn('emitNotification: Missing userId or role', { userId, role });
    return false;
  }

  const notificationData = {
    ...notification,
    id: notification.id || Date.now().toString(),
    timestamp: notification.timestamp || Date.now(),
  };

  return emitToUserIfConnected(global.io, userId, role, 'notification', notificationData);
};

/**
 * Emit to multiple users if connected
 * Uses SocketManager for efficient emission
 * @param {Array} users - Array of {userId, role} objects or array of userIds (requires role param)
 * @param {string} event - Event name
 * @param {Object} data - Data to emit
 * @param {string} role - Role (required if users is array of userIds)
 */
export const emitToUsersIfConnected = (users, event, data, role = null) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return 0;
  }

  if (!Array.isArray(users) || users.length === 0) {
    return 0;
  }

  // Handle array of {userId, role} objects
  if (users[0] && typeof users[0] === 'object' && users[0].userId) {
    return socketManager.emitToUsers(global.io, users, event, data);
  }

  // Handle array of userIds (requires role parameter)
  if (!role) {
    console.warn('emitToUsersIfConnected: Role required when users is array of userIds');
    return 0;
  }

  const userObjects = users.map(userId => ({ userId, role }));
  return socketManager.emitToUsers(global.io, userObjects, event, data);
};

