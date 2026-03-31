import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import StudentDetails from "../../models/student/studentDetails.js";
import { redisGet, redisSet } from "../../utils/redis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to predict.py at the backend root
const PREDICT_SCRIPT = path.resolve(__dirname, "..", "..", "..", "predict.py");

// On Windows use "python"; on Linux/Mac prefer "python3"
const PYTHON_CMD = process.platform === "win32" ? "python" : "python3";

/**
 * Spawn the Python prediction script and return the parsed JSON result.
 * Features are piped via stdin as JSON.
 * @param {object} features
 * @returns {Promise<object>}
 */
function runPythonPredict(features) {
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
            `Python exited with code ${code}. stderr: ${stderr.slice(0, 300)}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start Python: ${err.message}`));
    });

    // Send features as JSON to stdin
    proc.stdin.write(JSON.stringify(features));
    proc.stdin.end();
  });
}

/**
 * GET /student/placement-prediction
 * Runs ML model against logged-in student's data and returns tier prediction.
 *
 * Feature → Student field mapping:
 *   cgpa              ← student.cgpa
 *   project_score     ← student.projectsPoints
 *   sports_score      ← student.extraCurricularPoints
 *   internships       ← student.internships.length
 *   certifications    ← student.certifications.length
 *   workshops         ← student.workshops.length
 *   clubs             ← student.clubsJoined.length
 *   problemSolvingRank← student.problemSolvingRank
 *   extraPoints       ← student.extraCurricularPoints
 *   coPoints          ← student.coCurricularPoints
 *   attendance        ← computed from student.attendance array (present/total * 100)
 */
export const getPlacementPrediction = async (req, res) => {
  try {
    const studentId = req.user.studentId || req.user.studentid;
    if (!studentId) return res.status(401).json({ message: "Unauthorized" });

    // Redis cache: re-predict only when student data changes (TTL 30 min)
    const cacheKey = `placement:pred:${studentId}`;
    const cached = await redisGet(cacheKey);
    if (cached) {
      return res.status(200).json(JSON.parse(cached));
    }

    // Fetch all fields required to build feature vector
    // Model features (in training order):
    //   cgpa, teachingPoints, projectsPoints, problemSolvingRank,
    //   extraCurricularPoints, coCurricularPoints, certifications,
    //   internships, attendance
    const student = await StudentDetails.findOne({ studentid: studentId })
      .select(
        "cgpa teachingPoints projectsPoints problemSolvingRank " +
        "extraCurricularPoints coCurricularPoints " +
        "certifications internships attendance"
      )
      .lean();

    if (!student) return res.status(404).json({ message: "Student not found" });

    // Attendance percentage
    const totalPeriods = student.attendance?.length || 0;
    const presentPeriods =
      student.attendance?.filter((a) => a.present).length || 0;
    const attendancePct =
      totalPeriods > 0
        ? Math.round((presentPeriods / totalPeriods) * 100)
        : 75;

    const features = {
      cgpa:                   student.cgpa                   || 0,
      teachingPoints:         student.teachingPoints         || 0,
      projectsPoints:         student.projectsPoints         || 0,
      problemSolvingRank:     student.problemSolvingRank     || 0,
      extraCurricularPoints:  student.extraCurricularPoints  || 0,
      coCurricularPoints:     student.coCurricularPoints     || 0,
      certifications:         student.certifications?.length || 0,
      internships:            student.internships?.length    || 0,
      attendance:             attendancePct,
    };

    const prediction = await runPythonPredict(features);

    const payload = { prediction, inputFeatures: features };

    // Cache for 30 minutes
    await redisSet(cacheKey, JSON.stringify(payload), { EX: 1800 });

    return res.status(200).json(payload);
  } catch (error) {
    console.error("Placement prediction error:", error.message);
    return res
      .status(500)
      .json({ message: `Prediction failed: ${error.message}` });
  }
};
