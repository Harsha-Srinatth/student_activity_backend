/**
 * POST /api/students/compare
 * Body: { studentId: string, targetStudentId: string }
 * Returns: summary, suggestions (rule-based), and points snapshots for both students.
 * Both students must belong to the same college (collegeId from req.user).
 */
import StudentDetails from "../../../models/student/studentDetails.js";

const FIELDS = [
  { key: "teachingPoints", label: "Teaching Points" },
  { key: "projectsPoints", label: "Projects Points" },
  { key: "problemSolvingRank", label: "Problem Solving Rank" },
  { key: "extraCurricularPoints", label: "Extra Curricular Points" },
  { key: "coCurricularPoints", label: "Co-Curricular Points" },
  { key: "weightedPoints", label: "Weighted Points" },
];

const RULES = {
  teachingPoints: "Tutor peers, lead study groups, or mentor juniors to earn teaching points.",
  projectsPoints: "Take on new group or solo projects — even mini-projects qualify for points.",
  problemSolvingRank: "Practice on LeetCode, HackerRank, or Codeforces to improve your rank.",
  extraCurricularPoints: "Join clubs, attend workshops, or volunteer at college events.",
  coCurricularPoints: "Participate in hackathons, competitions, or seminars for co-curricular credit.",
  weightedPoints: "Improve across multiple categories — weighted points reflect your overall score.",
};

export const compareStudents = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { studentId, targetStudentId } = req.body;

    if (!studentId || !targetStudentId) {
      return res.status(400).json({
        success: false,
        message: "Both studentId and targetStudentId are required.",
      });
    }

    if (studentId === targetStudentId) {
      return res.status(400).json({
        success: false,
        message: "Cannot compare a student with themselves.",
      });
    }

    const [studentA, studentB] = await Promise.all([
      StudentDetails.findOne({ studentid: studentId, collegeId })
        .select("studentid fullname teachingPoints projectsPoints problemSolvingRank extraCurricularPoints coCurricularPoints weightedPoints")
        .lean(),
      StudentDetails.findOne({ studentid: targetStudentId, collegeId })
        .select("studentid fullname teachingPoints projectsPoints problemSolvingRank extraCurricularPoints coCurricularPoints weightedPoints")
        .lean(),
    ]);

    if (!studentA) {
      return res.status(404).json({ success: false, message: "Your profile not found." });
    }
    if (!studentB) {
      return res.status(404).json({ success: false, message: "Target student not found." });
    }

    const snapshot = (student) =>
      FIELDS.reduce((acc, { key }) => {
        acc[key] = student[key] ?? 0;
        return acc;
      }, {});

    const snapshotA = snapshot(studentA);
    const snapshotB = snapshot(studentB);

    const gaps = FIELDS.map(({ key, label }) => ({
      area: label,
      key,
      myVal: snapshotA[key],
      peerVal: snapshotB[key],
      delta: (snapshotB[key] ?? 0) - (snapshotA[key] ?? 0),
    }));

    const behind = gaps.filter((g) => g.delta > 0).sort((a, b) => b.delta - a.delta);

    const suggestions = behind.slice(0, 5).map((g) => ({
      area: g.area,
      suggestion: RULES[g.key] ?? `Increase your ${g.area.toLowerCase()} to close the ${g.delta}-point gap.`,
      targetDelta: g.delta,
    }));

    const summary =
      behind.length === 0
        ? `Great work! You're ahead of ${studentB.fullname} in all tracked categories. Keep it up!`
        : `You have room to grow in ${behind.length} area${behind.length > 1 ? "s" : ""} compared to ${studentB.fullname}. Focusing on ${behind[0].area} (gap: ${behind[0].delta} pts) will have the highest impact on your Weighted Points.`;

    return res.status(200).json({
      success: true,
      data: {
        summary,
        suggestions,
        studentA: snapshotA,
        studentB: snapshotB,
      },
    });
  } catch (err) {
    console.error("[compare] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error during comparison.",
    });
  }
};
