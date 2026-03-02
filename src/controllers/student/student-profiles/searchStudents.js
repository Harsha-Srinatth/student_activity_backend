import StudentDetails from "../../../models/student/studentDetails.js";

export const searchStudents = async (req, res) => {
  const { collegeId } = req.user;
  const { username, fullname, studentId } = req.query;

  const hasQuery = [username, fullname, studentId].some((v) => v != null && String(v).trim() !== "");
  if (!hasQuery) {
    return res.status(400).json({ error: "Username or fullname or studentId query is required" });
  }

  try {
    const orConditions = [];
    if (username != null && String(username).trim() !== "") {
      orConditions.push({ collegeId, username: { $regex: String(username).trim(), $options: "i" } });
    }
    if (fullname != null && String(fullname).trim() !== "") {
      orConditions.push({ collegeId, fullname: { $regex: String(fullname).trim(), $options: "i" } });
    }
    if (studentId != null && String(studentId).trim() !== "") {
      orConditions.push({ collegeId, studentid: { $regex: String(studentId).trim(), $options: "i" } });
    }
    const queryObj = orConditions.length > 0 ? { $or: orConditions } : { collegeId };

    const students = await StudentDetails.find(queryObj)
      .select("username image.url fullname studentid teachingPoints projectsPoints problemSolvingRank extraCurricularPoints coCurricularPoints weightedPoints programName dept")
      .lean();
    return res.status(200).json({ success: true, data: students });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "server error" });
  }
};