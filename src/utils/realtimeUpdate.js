import socketManager from '../socket/socketManager.js';
import { emitToUser, emitToRole } from '../socket/socketHandlers.js';

/**
 * Unified Real-Time Update System
 * Updates data in backend first, then emits to connected clients only
 * Reduces unnecessary network traffic and ensures data consistency
 */

/**
 * Emit update to specific user if connected
 * @param {Object} io - Socket.IO instance
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {Object} data - Data to emit
 * @returns {boolean} - True if user is connected and update was sent
 */
export const emitToUserIfConnected = (io, userId, event, data) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return false;
  }

  if (!socketManager.isUserConnected(userId)) {
    console.log(`⚠️ User ${userId} not connected, skipping emit: ${event}`);
    return false;
  }

  emitToUser(io, userId, event, data);
  console.log(`✅ Emitted ${event} to user ${userId}`);
  return true;
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
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
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

  const event = `dashboard:${updateType}`;
  let emitted = false;

  // Emit to specific user if connected
  if (userId) {
    emitted = emitToUserIfConnected(global.io, userId, event, data);
  }

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

  const event = `dashboard:hod:${updateType}`;
  let emitted = false;

  // Emit to specific user if connected
  if (hodId) {
    emitted = emitToUserIfConnected(global.io, hodId, event, data);
  }

  // Also emit to role if needed
  emitToRoleIfConnected(global.io, 'hod', `${event}:hod`, data);

  return emitted;
};

/**
 * Emit notification to user if connected
 */
export const emitNotification = (userId, notification) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return false;
  }

  const notificationData = {
    ...notification,
    id: notification.id || Date.now().toString(),
    timestamp: notification.timestamp || Date.now(),
  };

  return emitToUserIfConnected(global.io, userId, 'notification', notificationData);
};

/**
 * Emit to multiple users if connected
 */
export const emitToUsersIfConnected = (userIds, event, data) => {
  if (!global.io || !Array.isArray(userIds)) {
    return 0;
  }

  let emittedCount = 0;
  userIds.forEach(userId => {
    if (emitToUserIfConnected(global.io, userId, event, data)) {
      emittedCount++;
    }
  });

  return emittedCount;
};

