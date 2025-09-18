import StudentDetails from "../../models/studentDetails.js";

// GET /student/attendance
// Returns attendance stats for the logged-in student
export const getStudentAttendance = async (req, res) => {
  try {
    const { studentid } = req.user || {};
    if (!studentid) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const student = await StudentDetails.findOne(
      { studentid },
      { attendance: 1, semester: 1, studentid: 1 }
    ).lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const totalClasses = Array.isArray(student.attendance)
      ? student.attendance.length
      : 0;
    const presentClasses = totalClasses > 0
      ? student.attendance.filter((e) => e?.present === true).length
      : 0;
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


