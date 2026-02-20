import { emitToUser, emitAttendanceUpdateToStudents } from '../socket/socketHandlers.js';
import { 
  emitStudentUpdate, 
  emitFacultyUpdate, 
  emitHODUpdate, 
  emitNotification,
  emitToUsersIfConnected,
  emitToRoleIfConnected
} from './realtimeUpdate.js';
import socketManager from '../socket/socketManager.js';
import StudentDetails from '../models/student/studentDetails.js';

/**
 * Unified Socket Emitter - Uses real-time update system
 * Only emits to connected users, reducing unnecessary network traffic
 */

/**
 * Emit student dashboard update (uses new system)
 */
export const emitStudentDashboardUpdate = (studentId, updateType, data) => {
  emitStudentUpdate(studentId, updateType, data);
};

/**
 * Emit faculty dashboard update (uses new system)
 */
export const emitFacultyDashboardUpdate = (facultyId, updateType, data) => {
  emitFacultyUpdate(facultyId, updateType, data);
};

/**
 * Emit HOD dashboard update (new)
 */
export const emitHODDashboardUpdate = (hodId, updateType, data) => {
  emitHODUpdate(hodId, updateType, data);
};

/**
 * Emit approval update to student
 */
export const emitApprovalUpdate = (studentId, approvalData) => {
  emitStudentUpdate(studentId, 'approvals', approvalData);
};

/**
 * Emit counts update to student
 */
export const emitStudentCountsUpdate = (studentId, counts) => {
  emitStudentUpdate(studentId, 'counts', counts);
};

/**
 * Emit stats update to faculty
 */
export const emitFacultyStatsUpdate = (facultyId, stats) => {
  emitFacultyUpdate(facultyId, 'stats', stats);
};

/**
 * Emit pending approvals update to faculty
 */
export const emitFacultyPendingApprovalsUpdate = (facultyId, pendingApprovals) => {
  emitFacultyUpdate(facultyId, 'pendingApprovals', pendingApprovals);
};

/**
 * Emit notification to user
 * Automatically determines role by checking SocketManager
 * @param {string} userId - User ID
 * @param {Object} notification - Notification data
 * @param {string} [role] - Optional role hint (student, faculty, hod, admin)
 */
export const emitUserNotification = (userId, notification, role = null) => {
  if (!userId) {
    console.warn('emitUserNotification: userId is required');
    return false;
  }

  // If role is provided, use it directly
  if (role) {
    return emitNotification(userId, role, notification);
  }

  // Try to determine role by checking which role map contains this user
  const roles = ['student', 'faculty', 'hod', 'admin'];
  for (const testRole of roles) {
    if (socketManager.isUserConnected(userId, testRole)) {
      return emitNotification(userId, testRole, notification);
    }
  }

  // If user is not connected, try to emit to all possible roles
  // This ensures notification is sent if user connects later via room-based emission
  // But we'll still use SocketManager for direct socket emission
  let emitted = false;
  for (const testRole of roles) {
    if (emitNotification(userId, testRole, notification)) {
      emitted = true;
    }
  }

  if (!emitted) {
    console.warn(`emitUserNotification: User ${userId} not found in any role, notification may not be delivered`);
  }

  return emitted;
};

/**
 * Emit announcement update to role(s)
 * Handles "both" by emitting to both "student" and "faculty" roles
 */
export const emitAnnouncementUpdate = (role, announcementData) => {
  if (!global.io) {
    console.warn('⚠️ [SOCKET] Socket.IO not initialized, skipping emit');
    return;
  }

  console.log(`📡 [SOCKET] Emitting announcement update to role: ${role || 'all'}`, {
    type: announcementData?.type,
    announcementId: announcementData?.announcement?._id || announcementData?.announcementId
  });

  if (role) {
    // Handle "both" role by emitting to both student and faculty
    if (role === "both") {
      emitToRoleIfConnected(global.io, 'student', 'dashboard:announcements', announcementData);
      emitToRoleIfConnected(global.io, 'faculty', 'dashboard:announcements', announcementData);
    } else {
      // Emit to specific role
      emitToRoleIfConnected(global.io, role, 'dashboard:announcements', announcementData);
    }
  } else {
    // Emit to all roles if no role specified
    emitToRoleIfConnected(global.io, 'student', 'dashboard:announcements', announcementData);
    emitToRoleIfConnected(global.io, 'faculty', 'dashboard:announcements', announcementData);
    emitToRoleIfConnected(global.io, 'hod', 'dashboard:announcements', announcementData);
  }
};

/**
 * Emit attendance update to specific students
 */
export const emitAttendanceUpdate = (studentIds, attendanceData) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  const studentIdArray = Array.isArray(studentIds) ? studentIds : [studentIds];
  emitToRoleIfConnected(global.io, 'student', 'attendance:students', attendanceData);
};

/**
 * Calculate student dashboard counts from student data
 * Shared calculation logic to avoid duplication
 * @param {Object} studentData - Student data with achievement arrays
 * @returns {Object} Calculated counts object
 */
const calculateStudentDashboardCounts = (studentData) => {
  const certs = studentData.certifications || [];
  const workshops = studentData.workshops || [];
  const clubs = studentData.clubsJoined || [];
  const projects = studentData.projects || [];
  const internships = studentData.internships || [];
  const others = studentData.others || [];

  const certificationsCount = certs.filter(c => c.verification?.status === 'approved').length;
  const workshopsCount = workshops.filter(w => w.verification?.status === 'approved').length;
  const clubsJoinedCount = clubs.filter(c => c.verification?.status === 'approved').length;
  const projectsCount = projects.filter(p => p.verification?.status === 'approved').length;
  const hackathonsCount = 0; // Add if hackathons are tracked separately
  
  const pendingCount = certs.filter(c => c.verification?.status === 'pending').length +
                      workshops.filter(w => w.verification?.status === 'pending').length +
                      clubs.filter(c => c.verification?.status === 'pending').length +
                      projects.filter(p => p.verification?.status === 'pending').length +
                      internships.filter(i => i.verification?.status === 'pending').length +
                      others.filter(o => o.verification?.status === 'pending').length;
  
  const approvedCount = certs.filter(c => c.verification?.status === 'approved').length +
                       workshops.filter(w => w.verification?.status === 'approved').length +
                       clubs.filter(c => c.verification?.status === 'approved').length +
                       projects.filter(p => p.verification?.status === 'approved').length +
                       internships.filter(i => i.verification?.status === 'approved').length +
                       others.filter(o => o.verification?.status === 'approved').length;
  
  const rejectedCount = certs.filter(c => c.verification?.status === 'rejected').length +
                       workshops.filter(w => w.verification?.status === 'rejected').length +
                       clubs.filter(c => c.verification?.status === 'rejected').length +
                       projects.filter(p => p.verification?.status === 'rejected').length +
                       internships.filter(i => i.verification?.status === 'rejected').length +
                       others.filter(o => o.verification?.status === 'rejected').length;

  return {
    certificationsCount,
    workshopsCount,
    clubsJoinedCount,
    projectsCount,
    hackathonsCount,
    pendingApprovalsCount: pendingCount,
    approvedCount,
    rejectedCount,
    pendingCount,
  };
};

/**
 * Calculate and emit student dashboard data (counts and approvals)
 * Shared helper function to avoid code duplication
 * Used by attendance controller, approval controller, etc.
 * 
 * @param {string|string[]} studentIds - Single student ID or array of student IDs
 * @param {Object|Object[]} [studentDataMap] - Optional: Map of studentId -> studentData to avoid re-fetching
 *                                             If provided, uses this data instead of fetching from DB
 *                                             Format: { studentId1: studentData1, studentId2: studentData2 }
 *                                             OR array: [studentData1, studentData2] (must match studentIds order)
 */
export const emitStudentDashboardDataUpdate = async (studentIds, studentDataMap = null) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  // Handle both single student ID and array of student IDs
  const studentIdArray = Array.isArray(studentIds) ? studentIds : [studentIds];
  
  // Process each student
  for (let i = 0; i < studentIdArray.length; i++) {
    const studentId = studentIdArray[i];
    if (!studentId) continue;

    try {
      let studentData;

      // Check if student data is already provided (avoid duplicate fetch)
      if (studentDataMap) {
        if (Array.isArray(studentDataMap)) {
          // Array format - use index
          studentData = studentDataMap[i];
        } else {
          // Object/map format - use studentId as key
          studentData = studentDataMap[studentId];
        }
      }

      // Fetch student data only if not provided
      if (!studentData) {
        studentData = await StudentDetails.findOne({ studentid: studentId })
          .select('certifications workshops clubsJoined projects internships others')
          .lean();

        if (!studentData) {
          console.warn(`Student ${studentId} not found, skipping dashboard update`);
          continue;
        }
      }

      // Calculate counts using shared function
      const countsToEmit = calculateStudentDashboardCounts(studentData);

      // Emit counts update
      emitStudentCountsUpdate(studentId, countsToEmit);
      
      // Emit approval update with counts (components will refresh their data)
      emitApprovalUpdate(studentId, {
        counts: {
          pendingCount: countsToEmit.pendingCount,
          approvedCount: countsToEmit.approvedCount,
          rejectedCount: countsToEmit.rejectedCount,
        },
      });

      console.log(`✅ Emitted dashboard update for student ${studentId}`);
    } catch (error) {
      // Don't fail the main operation if socket emit fails
      console.error(`Error emitting dashboard update for student ${studentId}:`, error.message);
    }
  }
};

