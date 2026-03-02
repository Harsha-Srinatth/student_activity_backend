/**
 * GET /api/students/top-ten
 * Returns top N students by weightedPoints for the authenticated user's collegeId.
 * Query: ?limit=10 (default) or up to 50 (e.g. 30 for "View All" leaderboard).
 */
import StudentDetails from "../../../models/student/studentDetails.js";

const TOP_SELECT =
  "studentid fullname programName image.url teachingPoints projectsPoints problemSolvingRank extraCurricularPoints coCurricularPoints weightedPoints";

export const getTopTenStudents = async (req, res) => {
  try {
    const collegeId = req.user?.collegeId;
    if (!collegeId) {
      return res.status(400).json({ success: false, message: "College context required." });
    }

    const limit = Math.min(50, Math.max(1, parseInt(req.query?.limit, 10) || 10));

    const list = await StudentDetails.find({ collegeId })
      .sort({ weightedPoints: -1 })
      .limit(limit)
      .select(TOP_SELECT)
      .lean();

    const data = list.map((s) => ({
      studentid: s.studentid,
      fullname: s.fullname,
      programName: s.programName,
      image: s.image,
      profilePic: s.image?.url || null,
      teachingPoints: s.teachingPoints ?? 0,
      projectsPoints: s.projectsPoints ?? 0,
      problemSolvingRank: s.problemSolvingRank ?? 0,
      extraCurricularPoints: s.extraCurricularPoints ?? 0,
      coCurricularPoints: s.coCurricularPoints ?? 0,
      weightedPoints: s.weightedPoints ?? 0,
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("[getTopTenStudents] Error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch top students." });
  }
};
