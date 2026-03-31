import { spawn }    from "child_process";
import path         from "path";
import { fileURLToPath } from "url";
import StudentDetails    from "../../models/student/studentDetails.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Path to club_predict.py at the backend root (same pattern as placementController)
const PREDICT_SCRIPT = path.resolve(__dirname, "..", "..", "..", "club_predict.py");
const PYTHON_CMD     = process.platform === "win32" ? "python" : "python3";

/**
 * Spawn club_predict.py and return parsed JSON result.
 * Payload is sent as JSON to stdin — same pattern as placementController.
 */
function runClubPredict(payload) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_CMD, [PREDICT_SCRIPT]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed.error) {
          reject(new Error(parsed.error));
        } else {
          resolve(parsed);
        }
      } catch {
        reject(
          new Error(
            `Python exited with code ${code}. stderr: ${stderr.slice(0, 400)}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start Python: ${err.message}`));
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

/**
 * POST /club/predict-joiners
 *
 * HOD fills a questionnaire before creating a club.
 * Node fetches students → sends features to Python → Python runs
 * club_prediction_model.pkl → returns predicted joiner count + top 10.
 *
 * Required body: { title, clubType, collegeId }
 * Optional body: {
 *   description, activityType, meetingFrequency, timeCommitment,
 *   membershipFee, minCgpa, targetSemester, targetDept
 * }
 */
const predictClubJoiners = async (req, res) => {
  try {
    const {
      title, description,
      clubType, activityType,
      meetingFrequency, timeCommitment,
      membershipFee, minCgpa,
      targetSemester, targetDept,
    } = req.body;

    // collegeId comes from the authenticated HOD's JWT — no need to send it from the form
    const collegeId = req.user?.collegeId;

    // ── Validation ────────────────────────────────────────────────────────
    if (!title || !clubType) {
      return res.status(400).json({
        message: "title and clubType are required",
      });
    }

    if (!collegeId) {
      return res.status(400).json({
        message: "Could not determine collegeId from your session. Please log in again.",
      });
    }

    const VALID_TYPES = ["co-curricular", "extra-curricular", "academic"];
    if (!VALID_TYPES.includes(clubType)) {
      return res.status(400).json({
        message: `clubType must be one of: ${VALID_TYPES.join(", ")}`,
      });
    }

    // ── Fetch students from MongoDB ───────────────────────────────────────
    const query = { collegeId, role: "student" };
    if (targetDept && targetDept !== "all") query.dept = targetDept;

    // Apply semester filter in MongoDB before sending to Python
    if (targetSemester && targetSemester !== "all") {
      const [lo, hi] = targetSemester.split("-").map(Number);
      // semester is stored as a string like "3" — cast and filter
      query.$expr = {
        $and: [
          { $gte: [{ $toInt: "$semester" }, lo] },
          { $lte: [{ $toInt: "$semester" }, hi] },
        ],
      };
    }

    const rawStudents = await StudentDetails.find(query, {
      studentid: 1, fullname: 1, dept: 1, semester: 1,
      cgpa: 1, coCurricularPoints: 1, extraCurricularPoints: 1,
      problemSolvingRank: 1,
      certifications: 1, workshops: 1, internships: 1,
      projects: 1, "image.url": 1,
    }).lean();

    if (!rawStudents || rawStudents.length === 0) {
      return res.status(200).json({
        predictedStudents: 0, confidence: 0,
        topStudents: [], totalStudentsFetched: 0,
        breakdown: { eligible: 0, likelyToJoin: 0, unlikely: 0 },
        clubInfo: { title, description, clubType, activityType },
      });
    }

    // ── Build student feature objects for Python ──────────────────────────
    // Field names must match train_club_model.py exactly:
    // cgpa, projects, workshops, certifications, internships,
    // coPoints, extraPoints, rank, semester, dept

    const students = rawStudents.map((s) => ({
      studentid    : s.studentid,
      fullname     : s.fullname,
      dept         : s.dept          || "OTHER",
      semester     : s.semester      || "0",
      profileImage : s.image?.url    || null,
      // Feature columns
      cgpa         : s.cgpa                   || 0,
      projects     : (s.projects      || []).length,
      workshops    : (s.workshops     || []).length,
      certifications: (s.certifications || []).length,
      internships  : (s.internships   || []).length,
      coPoints     : s.coCurricularPoints    || 0,
      extraPoints  : s.extraCurricularPoints || 0,
      rank         : s.problemSolvingRank    || 0,
    }));

    // ── Build club payload ────────────────────────────────────────────────
    const club = {
      clubType        : clubType,
      activityType    : activityType     || "technical",
      meetingFrequency: meetingFrequency || "weekly",
      timeCommitment  : timeCommitment   || "medium",
      membershipFee   : membershipFee    || "free",
      minCgpa         : parseFloat(minCgpa) || 0,
    };

    // ── Call Python script ────────────────────────────────────────────────
    const prediction = await runClubPredict({ students, club });

    return res.status(200).json({
      predictedStudents    : prediction.predictedStudents,
      confidence           : prediction.confidence,
      topStudents          : prediction.topStudents || [],
      totalStudentsFetched : rawStudents.length,
      breakdown            : prediction.breakdown || {},
      clubInfo             : { title, description, clubType, activityType },
    });
  } catch (error) {
    console.error("Club prediction error:", error.message);
    return res.status(500).json({
      message: `Prediction failed: ${error.message}`,
    });
  }
};

export default predictClubJoiners;
