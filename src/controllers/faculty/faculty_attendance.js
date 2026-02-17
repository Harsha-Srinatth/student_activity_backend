import StudentDetails from "../../models/student/studentDetails.js";
import { emitAttendanceUpdate, emitStudentDashboardDataUpdate } from "../../utils/socketEmitter.js";
import { sendNotificationsToStudents } from "../../utils/firebaseNotification.js";

export const submitAttendance = async (req, res) => {
  try {
    const facultyId = req.user?.facultyid || req.user?.facultyId || req.user?.id;
    if (!facultyId) return res.status(401).json({ message: "Faculty id missing in token" });

    const { date, period, entries } = req.body || {};
    if (!date || !period || !Array.isArray(entries)) {
      return res.status(400).json({ message: "date, period, entries are required" });
    }

    const attendanceDate = new Date(date);
    if (Number.isNaN(attendanceDate.getTime())) {
      return res.status(400).json({ message: "Invalid date" });
    }

    const tasks = entries.map(async (e) => {
      const { studentId, present } = e || {};
      if (!studentId) return null;

      // Ensure faculty owns/advises the student
      const student = await StudentDetails.findOne({ studentid: studentId, facultyid: facultyId }).select("studentid attendance");
      if (!student) return null;

      // Remove any existing record for same date+period
      await StudentDetails.updateOne(
        { studentid: studentId },
        {
          $pull: {
            attendance: { date: attendanceDate, period: Number(period) },
          },
        }
      );

      // Push the new entry
      await StudentDetails.updateOne(
        { studentid: studentId },
        {
          $push: {
            attendance: {
              date: attendanceDate,
              period: Number(period),
              present: Boolean(present),
              markedByFacultyId: String(facultyId),
            },
          },
        }
      );

      return studentId;
    });

    const results = await Promise.all(tasks);
    const updatedStudentIds = results.filter(Boolean);
    const updated = updatedStudentIds.length;
    
    // Emit real-time attendance update to affected students
    if (updatedStudentIds.length > 0) {
      const attendanceData = {
        date: attendanceDate.toISOString(), // Convert to ISO string for proper serialization
        period: Number(period),
        updated: true,
        timestamp: new Date().toISOString(),
      };
      emitAttendanceUpdate(updatedStudentIds, attendanceData);
      
      // Also emit dashboard updates (counts and approvals) so components refresh
      // This ensures RecentActivities, RejectedApprovals, etc. show updated data
      try {
        await emitStudentDashboardDataUpdate(updatedStudentIds);
      } catch (error) {
        // Don't fail the request if dashboard update fails
        console.error('Error emitting dashboard updates:', error.message);
      }
      
      // Send FCM push notifications to affected students
      try {
        await sendNotificationsToStudents(
          updatedStudentIds,
          "Attendance Updated 📊",
          `Your attendance for period ${period} has been marked`,
          {
            type: "attendance_updated",
            date: attendanceDate.toISOString(),
            period: period.toString(),
            timestamp: new Date().toISOString(),
          }
        );
      } catch (notifError) {
        console.error('Error sending attendance notifications:', notifError);
      }
    }
    
    return res.json({ success: true, updated });
  } catch (err) {
    req.log?.error({ err }, "submitAttendance failed");
    return res.status(500).json({ message: "Failed to submit attendance" });
  }
};


