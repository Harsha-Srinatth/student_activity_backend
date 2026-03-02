/**
 * GET /api/students/leaderboard
 * Query: ?year=&week= (optional) for past week. If omitted, uses current ISO week.
 * Returns weekly top 30 snapshot. For current week: creates snapshot if missing.
 *
 * GET /api/students/leaderboard/weeks
 * Returns list of { year, weekNumber, createdAt } for the college for "Past Leaderboard history".
 */
import StudentDetails from "../../../models/student/studentDetails.js";
import WeeklyLeaderboard from "../../../models/student/WeeklyLeaderboard.js";
import { getISOWeekYearAndWeek, parseYearWeekQuery } from "../../../utils/weekUtils.js";

const LEADERBOARD_LIMIT = 30;
const TOP_SELECT =
  "studentid fullname programName image.url cgpa teachingPoints projectsPoints problemSolvingRank extraCurricularPoints coCurricularPoints weightedPoints";

function toSnapshotStudent(s) {
  return {
    studentid: s.studentid,
    fullname: s.fullname,
    programName: s.programName ?? "",
    image: s.image ?? { url: "" },
    profilePic: s.image?.url || null,
    teachingPoints: s.teachingPoints ?? 0,
    projectsPoints: s.projectsPoints ?? 0,
    problemSolvingRank: s.problemSolvingRank ?? 0,
    extraCurricularPoints: s.extraCurricularPoints ?? 0,
    coCurricularPoints: s.coCurricularPoints ?? 0,
    weightedPoints: s.weightedPoints ?? 0,
  };
}

/**
 * GET /api/students/leaderboard?year=&week=
 */
export const getWeeklyLeaderboard = async (req, res) => {
  try {
    const collegeId = req.user?.collegeId;
    if (!collegeId) {
      return res.status(400).json({ success: false, message: "College context required." });
    }

    const { year: yearParam, week: weekParam } = req.query;
    const parsed = parseYearWeekQuery(yearParam, weekParam);
    const isPastWeek = parsed != null;
    const { year, weekNumber } = isPastWeek ? parsed : getISOWeekYearAndWeek();

    let doc = await WeeklyLeaderboard.findOne({ collegeId, year, weekNumber }).lean();

    if (!doc) {
      if (isPastWeek) {
        return res.status(404).json({
          success: false,
          message: "No snapshot found for this week.",
          data: [],
        });
      }
      // Current week: create snapshot from live top 30
      const list = await StudentDetails.find({ collegeId })
        .sort({ weightedPoints: -1 })
        .limit(LEADERBOARD_LIMIT)
        .select(TOP_SELECT)
        .lean();

      const students = list.map(toSnapshotStudent);
      doc = await WeeklyLeaderboard.create({
        collegeId,
        year,
        weekNumber,
        students,
      });
    }

    const students = (doc.students || []).map((s) => ({
      ...s,
      profilePic: s.image?.url || null,
    }));

    return res.status(200).json({
      success: true,
      data: students,
      meta: { year: doc.year, weekNumber: doc.weekNumber, createdAt: doc.createdAt },
    });
  } catch (err) {
    console.error("[getWeeklyLeaderboard] Error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch weekly leaderboard." });
  }
};

/**
 * GET /api/students/leaderboard/weeks
 */
export const getLeaderboardWeeks = async (req, res) => {
  try {
    const collegeId = req.user?.collegeId;
    if (!collegeId) {
      return res.status(400).json({ success: false, message: "College context required." });
    }

    const list = await WeeklyLeaderboard.find({ collegeId })
      .sort({ year: -1, weekNumber: -1 })
      .select("year weekNumber createdAt")
      .lean();

    const weeks = list.map((w) => ({
      year: w.year,
      weekNumber: w.weekNumber,
      createdAt: w.createdAt,
    }));

    return res.status(200).json({ success: true, data: weeks });
  } catch (err) {
    console.error("[getLeaderboardWeeks] Error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch leaderboard weeks." });
  }
};
