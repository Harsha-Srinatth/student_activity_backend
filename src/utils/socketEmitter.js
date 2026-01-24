import { emitToUser, emitToRole, emitDashboardUpdate, emitNotification, emitAttendanceUpdateToStudents } from '../socket/socketHandlers.js';
import StudentDetails from '../models/student/studentDetails.js';

/**
 * Helper functions to emit socket events from controllers
 * Use these functions in your controllers to send real-time updates
 */

/**
 * Emit student dashboard update
 */
export const emitStudentDashboardUpdate = (studentId, updateType, data) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  emitDashboardUpdate(global.io, studentId, 'student', updateType, data);
};

/**
 * Emit faculty dashboard update
 */
export const emitFacultyDashboardUpdate = (facultyId, updateType, data) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  emitDashboardUpdate(global.io, facultyId, 'faculty', updateType, data);
};

/**
 * Emit approval update to student
 * Optimized to send only once
 */
export const emitApprovalUpdate = (studentId, approvalData) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  // Send combined update in one event instead of multiple
  emitToUser(global.io, studentId, 'dashboard:approvals', approvalData);
};

/**
 * Emit counts update to student
 * Optimized to send only once
 */
export const emitStudentCountsUpdate = (studentId, counts) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  console.log(`📤 Emitting counts update to student ${studentId}:`, counts);
  console.log(`📤 Emitting to room: user:${studentId}`);
  
  // Send only counts update (single event)
  emitToUser(global.io, studentId, 'dashboard:counts', counts);
  
  // Also log which rooms exist (for debugging)
  const rooms = global.io.sockets.adapter.rooms;
  const targetRoom = `user:${studentId}`;
  if (rooms.has(targetRoom)) {
    const room = rooms.get(targetRoom);
    console.log(`✅ Room ${targetRoom} exists with ${room.size} socket(s)`);
  } else {
    console.warn(`⚠️ Room ${targetRoom} does not exist - student may not be connected`);
  }
};

/**
 * Emit stats update to faculty
 * Optimized to send only once
 */
export const emitFacultyStatsUpdate = (facultyId, stats) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  console.log(`📤 Emitting faculty stats update to faculty ${facultyId}:`, stats);
  // Send stats update (single event)
  emitToUser(global.io, facultyId, 'dashboard:stats', stats);
  
  // Also log which rooms exist (for debugging)
  const rooms = global.io.sockets.adapter.rooms;
  const targetRoom = `user:${facultyId}`;
  if (rooms.has(targetRoom)) {
    const room = rooms.get(targetRoom);
    console.log(`✅ Room ${targetRoom} exists with ${room.size} socket(s)`);
  } else {
    console.warn(`⚠️ Room ${targetRoom} does not exist - faculty may not be connected`);
  }
};

/**
 * Emit pending approvals update to faculty
 * Optimized to send only once
 */
export const emitFacultyPendingApprovalsUpdate = (facultyId, pendingApprovals) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  // Send only pending approvals update (single event)
  emitToUser(global.io, facultyId, 'dashboard:pendingApprovals', pendingApprovals);
};

/**
 * Emit notification to user
 */
export const emitUserNotification = (userId, notification) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  emitNotification(global.io, userId, {
    ...notification,
    id: notification.id || Date.now().toString(),
    timestamp: notification.timestamp || Date.now(),
  });
};

/**
 * Emit announcement update
 */
export const emitAnnouncementUpdate = (role, announcementData) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  if (role) {
    emitToRole(global.io, role, 'dashboard:announcements', announcementData);
  } else {
    // Emit to all if no role specified
    emitToRole(global.io, 'student', 'dashboard:announcements', announcementData);
    emitToRole(global.io, 'faculty', 'dashboard:announcements', announcementData);
  }
};

/**
 * Emit attendance update to specific students
 * @param {string|string[]} studentIds - Single student ID or array of student IDs
 * @param {Object} attendanceData - Attendance data to send (should include date, period, present status, etc.)
 */
export const emitAttendanceUpdate = (studentIds, attendanceData) => {
  if (!global.io) {
    console.warn('Socket.IO not initialized, skipping emit');
    return;
  }

  emitAttendanceUpdateToStudents(global.io, studentIds, attendanceData);
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

