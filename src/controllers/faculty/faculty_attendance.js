import StudentDetails from "../../models/student/studentDetails.js";

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
    const updated = results.filter(Boolean).length;
    return res.json({ success: true, updated });
  } catch (err) {
    req.log?.error({ err }, "submitAttendance failed");
    return res.status(500).json({ message: "Failed to submit attendance" });
  }
};


