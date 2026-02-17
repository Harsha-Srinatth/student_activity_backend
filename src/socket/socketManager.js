/**
 * Socket Manager
 * Tracks all connected sockets by role and user ID
 * Provides efficient way to emit updates to specific users/roles
 */

class SocketManager {
  constructor() {
    // Map of role -> Set of socket IDs
    this.roleSockets = new Map();
    // Map of userId -> Set of socket IDs (user can have multiple connections)
    this.userSockets = new Map();
    // Map of socketId -> { userId, role }
    this.socketInfo = new Map();
  }

  /**
   * Register a new socket connection
   */
  registerSocket(socketId, userId, role) {
    if (!socketId || !userId || !role) {
      console.warn('Invalid socket registration:', { socketId, userId, role });
      return;
    }

    // Store socket info
    this.socketInfo.set(socketId, { userId, role });

    // Add to role-based tracking
    if (!this.roleSockets.has(role)) {
      this.roleSockets.set(role, new Set());
    }
    this.roleSockets.get(role).add(socketId);

    // Add to user-based tracking
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socketId);

    console.log(`✅ Socket registered: ${socketId} (User: ${userId}, Role: ${role})`);
    console.log(`📊 Active connections - Role: ${role} (${this.roleSockets.get(role).size}), User: ${userId} (${this.userSockets.get(userId).size})`);
  }

  /**
   * Unregister a socket connection
   */
  unregisterSocket(socketId) {
    const info = this.socketInfo.get(socketId);
    if (!info) {
      return;
    }

    const { userId, role } = info;

    // Remove from role-based tracking
    if (this.roleSockets.has(role)) {
      this.roleSockets.get(role).delete(socketId);
      if (this.roleSockets.get(role).size === 0) {
        this.roleSockets.delete(role);
      }
    }

    // Remove from user-based tracking
    if (this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(socketId);
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
      }
    }

    // Remove socket info
    this.socketInfo.delete(socketId);

    console.log(`❌ Socket unregistered: ${socketId} (User: ${userId}, Role: ${role})`);
  }

  /**
   * Get all socket IDs for a specific role
   */
  getSocketsByRole(role) {
    return Array.from(this.roleSockets.get(role) || []);
  }

  /**
   * Get all socket IDs for a specific user
   */
  getSocketsByUser(userId) {
    return Array.from(this.userSockets.get(userId) || []);
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId) {
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }

  /**
   * Check if any user of a role is connected
   */
  isRoleConnected(role) {
    return this.roleSockets.has(role) && this.roleSockets.get(role).size > 0;
  }

  /**
   * Get connection stats
   */
  getStats() {
    const stats = {
      totalSockets: this.socketInfo.size,
      byRole: {},
      byUser: {},
    };

    // Count by role
    this.roleSockets.forEach((sockets, role) => {
      stats.byRole[role] = sockets.size;
    });

    // Count by user (only show users with connections)
    this.userSockets.forEach((sockets, userId) => {
      stats.byUser[userId] = sockets.size;
    });

    return stats;
  }

  /**
   * Clear all registrations (useful for testing or cleanup)
   */
  clear() {
    this.roleSockets.clear();
    this.userSockets.clear();
    this.socketInfo.clear();
  }
}

// Export singleton instance
const socketManager = new SocketManager();
export default socketManager;

