import jwt from "jsonwebtoken";
import socketManager from "./socketManager.js";

/**
 * Socket event handlers for real-time updates
 */

/**
 * Authenticate socket connection
 */
export const handleSocketAuth = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    
    if (!token) {
      return next(new Error("Authentication token required"));
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;
    
    const decoded = jwt.verify(cleanToken, process.env.MY_SECRET_KEY);
    
    // Attach user info to socket
    // Handle both camelCase and lowercase field names
    socket.userId = decoded.studentId || decoded.studentid || decoded.facultyId || decoded.facultyid || decoded.hodId || decoded.hodid || decoded.adminId || decoded.adminid;
    socket.userRole = decoded.role;
    socket.user = decoded;
    
    console.log(`🔐 Socket authenticated - UserId: ${socket.userId}, Role: ${socket.userRole}`);
    
    next();
  } catch (error) {
    console.error("Socket authentication error:", error.message);
    next(new Error("Authentication failed"));
  }
};

/**
 * Handle socket connection
 */
export const handleConnection = (socket, io) => {
  console.log(`Socket connected: ${socket.id} (User: ${socket.userId}, Role: ${socket.userRole})`);
  
  // Register socket in manager
  if (socket.userId && socket.userRole) {
    socketManager.registerSocket(socket.id, socket.userId, socket.userRole);
  }
  
  // Join user-specific room
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }
  
  // Join role-specific room
  if (socket.userRole) {
    socket.join(`role:${socket.userRole}`);
  }
  
  // Join global room for broadcast updates
  socket.join('global');
  
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id} (Reason: ${reason})`);
    // Unregister socket from manager
    socketManager.unregisterSocket(socket.id);
  });
  
  // Handle errors
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
};

/**
 * Emit real-time update to specific user
 */
export const emitToUser = (io, userId, event, data) => {
  io.to(`user:${userId}`).emit(event, data);
};

/**
 * Emit real-time update to all users of a specific role
 */
export const emitToRole = (io, role, event, data) => {
  io.to(`role:${role}`).emit(event, data);
};

/**
 * Emit real-time update to all connected clients
 */
export const emitToAll = (io, event, data) => {
  io.to('global').emit(event, data);
};

/**
 * Helper to emit dashboard updates
 */
export const emitDashboardUpdate = (io, userId, role, updateType, data) => {
  // Update specific user
  if (userId) {
    emitToUser(io, userId, `dashboard:${updateType}`, data);
  }
  
  // Update all users of the same role if needed
  if (role) {
    emitToRole(io, role, `dashboard:${updateType}:${role}`, data);
  }
};
/**
 * Helper to emit notification
 */
export const emitNotification = (io, userId, notification) => {
  emitToUser(io, userId, 'notification', notification);
};
/**
 * Helper to emit attendance update to specific students
 */
export const emitAttendanceUpdateToStudents = (io, studentIds, attendanceData) => {
  // Handle both single student ID and array of student IDs
  const studentIdArray = Array.isArray(studentIds) ? studentIds : [studentIds];
  
  // Emit to each specific student who received attendance data
  studentIdArray.forEach((studentId) => {
    if (studentId) {
      emitToUser(io, studentId, 'attendance:students', attendanceData);
      console.log(`📤 Emitted attendance update to student ${studentId}`);
    }
  });
};

