import StudentDetails from "../../models/student/studentDetails.js";

/**
 * GET /student/attendance
 * Returns attendance stats for the logged-in student
 * Optimized: Single aggregation query calculates stats in database
 */
export const getStudentAttendance = async (req, res) => {
  try {
    const { studentid } = req.user || {};
    if (!studentid) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Single aggregation query to calculate attendance stats
    const result = await StudentDetails.aggregate([
      { $match: { studentid } },
      {
        $project: {
          studentid: 1,
          semester: 1,
          totalClasses: { $size: { $ifNull: ["$attendance", []] } },
          presentClasses: {
            $size: {
              $filter: {
                input: { $ifNull: ["$attendance", []] },
                as: "entry",
                cond: { $eq: ["$$entry.present", true] }
              }
            }
          }
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    const student = result[0];
    const totalClasses = student.totalClasses || 0;
    const presentClasses = student.presentClasses || 0;
    const absentClasses = Math.max(0, totalClasses - presentClasses);
    const percentage = totalClasses > 0
      ? Math.round((presentClasses / totalClasses) * 100)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        studentid: student.studentid,
        semester: student.semester,
        totalClasses,
        presentClasses,
        absentClasses,
        attendancePercentage: percentage,
      },
    });
  } catch (error) {
    console.error("getStudentAttendance error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export default getStudentAttendance;
