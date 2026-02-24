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
  socketManager.registerSocket(socket.id, socket.userId, socket.userRole);
  
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

  // ---- Doubt Feature: join/leave rooms ----
  socket.on('doubt:joinCollege', (collegeId) => {
    if (collegeId) {
      socket.join(`college:${collegeId}`);
      console.log(`📚 Socket ${socket.id} joined college room: college:${collegeId}`);
    }
  });

  socket.on('doubt:leaveCollege', (collegeId) => {
    if (collegeId) {
      socket.leave(`college:${collegeId}`);
      console.log(`📚 Socket ${socket.id} left college room: college:${collegeId}`);
    }
  });

  socket.on('doubt:joinDoubt', (doubtId) => {
    if (doubtId) {
      socket.join(`doubt:${doubtId}`);
      console.log(`💬 Socket ${socket.id} joined doubt room: doubt:${doubtId}`);
    }
  });

  socket.on('doubt:leaveDoubt', (doubtId) => {
    if (doubtId) {
      socket.leave(`doubt:${doubtId}`);
      console.log(`💬 Socket ${socket.id} left doubt room: doubt:${doubtId}`);
    }
  });

  // ---- Skill Exchange Course: join/leave room for real-time content ----
  socket.on('course:joinCourse', (courseId) => {
    if (courseId) {
      socket.join(`course:${courseId}`);
      console.log(`📖 Socket ${socket.id} joined course room: course:${courseId}`);
    }
  });

  socket.on('course:leaveCourse', (courseId) => {
    if (courseId) {
      socket.leave(`course:${courseId}`);
      console.log(`📖 Socket ${socket.id} left course room: course:${courseId}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id} (Reason: ${reason})`);
    // Unregister socket from manager
    socketManager.unregisterSocket(socket.id, socket.userRole);
  });
  
  // Handle errors
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
};

/**
 * Emit real-time update to specific user
 * Uses SocketManager for efficient socket lookup
 */
export const emitToUser = (io, userId, role, event, data) => {
  if (!io || !userId || !role) {
    console.warn('emitToUser: Missing required parameters', { userId, role });
    return false;
  }
  
  // Use SocketManager for efficient emission
  const emitted = socketManager.emitToUser(io, userId, role, event, data);
  
  // Also emit to room for backward compatibility
  io.to(`user:${userId}`).emit(event, data);
  
  return emitted;
};

/**
 * Emit real-time update to all users of a specific role
 * Uses SocketManager for efficient socket lookup
 */
export const emitToRole = (io, role, event, data) => {
  if (!io || !role) {
    console.warn('emitToRole: Missing required parameters', { role });
    return 0;
  }

  // Validate role - "both" is not a valid role
  if (role === "both") {
    console.error(`❌ [SOCKET] Invalid role "both" passed to emitToRole. This should be expanded to ["student", "faculty"] before calling. Event: ${event}`);
    // Automatically expand "both" to student and faculty as a safety net
    let totalCount = 0;
    totalCount += socketManager.emitToRole(io, 'student', event, data);
    io.to(`role:student`).emit(event, data);
    totalCount += socketManager.emitToRole(io, 'faculty', event, data);
    io.to(`role:faculty`).emit(event, data);
    return totalCount;
  }

  // Validate role is one of the valid roles
  const validRoles = ['student', 'faculty', 'hod', 'admin'];
  if (!validRoles.includes(role)) {
    console.error(`❌ [SOCKET] Invalid role "${role}" passed to emitToRole. Valid roles are: ${validRoles.join(', ')}. Event: ${event}`);
    return 0;
  }
  
  // Use SocketManager for efficient emission
  const socketCount = socketManager.emitToRole(io, role, event, data);
  
  // Also emit to room for backward compatibility
  io.to(`role:${role}`).emit(event, data);
  
  return socketCount;
};

/**
 * Emit real-time update to all connected clients
 */
export const emitToAll = (io, event, data) => {
  if (!io) {
    console.warn('emitToAll: Socket.IO instance not provided');
    return;
  }
  io.to('global').emit(event, data);
};

/**
 * Helper to emit dashboard updates
 * Uses SocketManager for efficient emission
 */
export const emitDashboardUpdate = (io, userId, role, updateType, data) => {
  if (!io) {
    console.warn('emitDashboardUpdate: Socket.IO instance not provided');
    return;
  }

  // Update specific user using SocketManager
  if (userId && role) {
    socketManager.emitToUser(io, userId, role, `dashboard:${updateType}`, data);
    // Also emit to room for backward compatibility
    io.to(`user:${userId}`).emit(`dashboard:${updateType}`, data);
  }
  
  // Update all users of the same role if needed
  if (role) {
    socketManager.emitToRole(io, role, `dashboard:${updateType}:${role}`, data);
    // Also emit to room for backward compatibility
    io.to(`role:${role}`).emit(`dashboard:${updateType}:${role}`, data);
  }
};

/**
 * Helper to emit notification
 * Uses SocketManager for efficient emission
 */
export const emitNotification = (io, userId, role, notification) => {
  if (!io || !userId || !role) {
    console.warn('emitNotification: Missing required parameters', { userId, role });
    return false;
  }
  
  const notificationData = {
    ...notification,
    id: notification.id || Date.now().toString(),
    timestamp: notification.timestamp || Date.now(),
  };
  
  const emitted = socketManager.emitToUser(io, userId, role, 'notification', notificationData);
  // Also emit to room for backward compatibility
  io.to(`user:${userId}`).emit('notification', notificationData);
  
  return emitted;
};

/**
 * Helper to emit attendance update to specific students
 * Uses SocketManager for efficient emission
 */
export const emitAttendanceUpdateToStudents = (io, studentIds, attendanceData) => {
  if (!io) {
    console.warn('emitAttendanceUpdateToStudents: Socket.IO instance not provided');
    return;
  }

  // Handle both single student ID and array of student IDs
  const studentIdArray = Array.isArray(studentIds) ? studentIds : [studentIds];
  
  // Emit to each specific student who received attendance data
  studentIdArray.forEach((studentId) => {
    if (studentId) {
      socketManager.emitToUser(io, studentId, 'student', 'attendance:students', attendanceData);
      // Also emit to room for backward compatibility
      io.to(`user:${studentId}`).emit('attendance:students', attendanceData);
      console.log(`📤 Emitted attendance update to student ${studentId}`);
    }
  });
};

