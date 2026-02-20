/**
 * Socket Manager
 * Tracks all connected sockets by role and user ID
 * Provides efficient way to emit updates to specific users/roles
 * Uses bidirectional mapping: socketId -> userId AND userId -> Set of socketIds
 */

class SocketManager {
  constructor() {
    // Map of socketId -> userId (for quick lookup of user from socket)
    this.socketToUser = new Map();
    // Map of socketId -> role (for quick lookup of role from socket)
    this.socketToRole = new Map();
    
    // Map of userId -> Set of socketIds (for efficient user lookup)
    this.studentSockets = new Map(); // studentId -> Set of socketIds
    this.facultySockets = new Map(); // facultyId -> Set of socketIds
    this.hodSockets = new Map();     // hodId -> Set of socketIds
    this.adminSockets = new Map();   // adminId -> Set of socketIds
  }

  /**
   * Get the role-specific map based on role string
   */
  _getRoleMap(role) {
    switch(role) {
      case 'student': return this.studentSockets;
      case 'faculty': return this.facultySockets;
      case 'hod': return this.hodSockets;
      case 'admin': return this.adminSockets;
      default: return null;
    }
  }

  /**
   * Register a new socket connection
   */
  registerSocket(socketId, userId, role) {
    if (!socketId || !userId || !role) {
      console.warn('Invalid socket registration:', { socketId, userId, role });
      return;
    }

    const roleMap = this._getRoleMap(role);
    if (!roleMap) {
      console.warn('Invalid role:', role);
      return;
    }

    // Store socketId -> userId mapping
    this.socketToUser.set(socketId, userId);
    // Store socketId -> role mapping
    this.socketToRole.set(socketId, role);

    // Add socketId to user's set
    if (!roleMap.has(userId)) {
      roleMap.set(userId, new Set());
    }
    roleMap.get(userId).add(socketId);

    console.log(`✅ Socket registered: ${socketId} (User: ${userId}, Role: ${role})`);
  }

  /**
   * Unregister a socket connection
   */
  unregisterSocket(socketId, role) {
    if (!socketId) {
      console.warn('Invalid socket unregistration: socketId is required');
      return;
    }

    // Get userId and role from stored mappings if not provided
    const userId = this.socketToUser.get(socketId);
    const actualRole = role || this.socketToRole.get(socketId);

    if (!userId || !actualRole) {
      console.warn(`Socket ${socketId} not found in registry`);
      return;
    }

    const roleMap = this._getRoleMap(actualRole);
    if (!roleMap) {
      console.warn('Invalid role:', actualRole);
      return;
    }

    // Remove socketId from user's set
    const userSocketSet = roleMap.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      // Remove user entry if no more sockets
      if (userSocketSet.size === 0) {
        roleMap.delete(userId);
      }
    }

    // Remove from bidirectional mappings
    this.socketToUser.delete(socketId);
    this.socketToRole.delete(socketId);

    console.log(`❌ Socket unregistered: ${socketId} (User: ${userId}, Role: ${actualRole})`);
  }

  /**
   * Get all socket IDs for a specific user
   * @param {string} userId - User ID
   * @param {string} role - User role
   * @returns {string[]} Array of socket IDs
   */
  getSocketIds(userId, role) {
    if (!userId || !role) {
      return [];
    }

    const roleMap = this._getRoleMap(role);
    if (!roleMap) {
      return [];
    }

    const socketSet = roleMap.get(userId);
    return socketSet ? Array.from(socketSet) : [];
  }

  /**
   * Get userId from socketId
   * @param {string} socketId - Socket ID
   * @returns {string|null} User ID or null
   */
  getUserId(socketId) {
    return this.socketToUser.get(socketId) || null;
  }

  /**
   * Get role from socketId
   * @param {string} socketId - Socket ID
   * @returns {string|null} Role or null
   */
  getRole(socketId) {
    return this.socketToRole.get(socketId) || null;
  }

  /**
   * Check if user is connected
   * @param {string} userId - User ID
   * @param {string} role - User role
   * @returns {boolean} True if user has at least one connected socket
   */
  isUserConnected(userId, role) {
    if (!userId || !role) {
      return false;
    }

    const roleMap = this._getRoleMap(role);
    if (!roleMap) {
      return false;
    }

    const socketSet = roleMap.get(userId);
    return socketSet ? socketSet.size > 0 : false;
  }

  /**
   * Check if any users of a role are connected
   * @param {string} role - Role to check
   * @returns {boolean} True if at least one user of this role is connected
   */
  isRoleConnected(role) {
    const roleMap = this._getRoleMap(role);
    if (!roleMap) {
      return false;
    }
    return roleMap.size > 0;
  }

  /**
   * Get all socket IDs for a role
   * @param {string} role - Role name
   * @returns {string[]} Array of all socket IDs for this role
   */
  getAllSocketIdsForRole(role) {
    const roleMap = this._getRoleMap(role);
    if (!roleMap) {
      return [];
    }

    const allSocketIds = [];
    for (const socketSet of roleMap.values()) {
      allSocketIds.push(...Array.from(socketSet));
    }
    return allSocketIds;
  }

  /**
   * Emit to a specific user using their socketIds
   * @param {Object} io - Socket.IO instance
   * @param {string} userId - User ID
   * @param {string} role - User role
   * @param {string} event - Event name
   * @param {Object} data - Data to emit
   * @returns {boolean} True if emitted successfully
   */
  emitToUser(io, userId, role, event, data) {
    if (!io || !userId || !role) {
      return false;
    }

    const socketIds = this.getSocketIds(userId, role);
    if (socketIds.length === 0) {
      return false;
    }

    socketIds.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });

    return true;
  }

  /**
   * Emit to all users of a specific role
   * @param {Object} io - Socket.IO instance
   * @param {string} role - Role name
   * @param {string} event - Event name
   * @param {Object} data - Data to emit
   * @returns {number} Number of sockets emitted to
   */
  emitToRole(io, role, event, data) {
    if (!io || !role) {
      return 0;
    }

    const socketIds = this.getAllSocketIdsForRole(role);
    if (socketIds.length === 0) {
      return 0;
    }

    socketIds.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });

    return socketIds.length;
  }

  /**
   * Emit to multiple users
   * @param {Object} io - Socket.IO instance
   * @param {Array} users - Array of {userId, role} objects
   * @param {string} event - Event name
   * @param {Object} data - Data to emit
   * @returns {number} Number of users successfully emitted to
   */
  emitToUsers(io, users, event, data) {
    if (!io || !Array.isArray(users)) {
      return 0;
    }

    let emittedCount = 0;
    users.forEach((user) => {
      // Handle both {userId, role} objects and plain objects
      const userId = user.userId || user;
      const role = user.role;
      
      if (userId && role) {
        if (this.emitToUser(io, userId, role, event, data)) {
          emittedCount++;
        }
      } else {
        console.warn('emitToUsers: Invalid user object, missing userId or role', user);
      }
    });

    return emittedCount;
  }

  /**
   * Get connection stats
   */
  getStats() {
    // Count unique users per role
    const studentUsers = this.studentSockets.size;
    const facultyUsers = this.facultySockets.size;
    const hodUsers = this.hodSockets.size;
    const adminUsers = this.adminSockets.size;

    // Count total sockets
    const totalSockets = this.socketToUser.size;

    return {
      totalSockets,
      totalUsers: studentUsers + facultyUsers + hodUsers + adminUsers,
      studentUsers,
      studentSockets: this._countSocketsInMap(this.studentSockets),
      facultyUsers,
      facultySockets: this._countSocketsInMap(this.facultySockets),
      hodUsers,
      hodSockets: this._countSocketsInMap(this.hodSockets),
      adminUsers,
      adminSockets: this._countSocketsInMap(this.adminSockets),
    };
  }

  /**
   * Helper to count total sockets in a role map
   */
  _countSocketsInMap(roleMap) {
    let count = 0;
    for (const socketSet of roleMap.values()) {
      count += socketSet.size;
    }
    return count;
  }

  /**
   * Clear all registrations (useful for testing or cleanup)
   */
  clear() {
    this.socketToUser.clear();
    this.socketToRole.clear();
    this.studentSockets.clear();
    this.facultySockets.clear();
    this.hodSockets.clear();
    this.adminSockets.clear();
  }
}

// Export singleton instance
const socketManager = new SocketManager();
export default socketManager;

