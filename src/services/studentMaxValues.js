/**
 * Student max values for professional stars calculation.
 * Uses 6 fields (no sgpa): cgpa, teachingPoints, projectsPoints, problemSolvingRank, extraCurricularPoints, coCurricularPoints.
 * Max values are cached in Redis (key: student:maxValues) to reduce DB pressure.
 * When a student updates any scoring field, call updateMaxValuesIfNeeded(updatedStudent) so Redis max is updated if this student beats the current max.
 */
import StudentDetails from "../models/student/studentDetails.js";
import { redisGet, redisSet } from "../utils/redis.js";

const REDIS_KEY = "student:maxValues";

/** Aggregate result keys (from $group) mapped to schema field names */
const MAX_KEYS = {
  cgpa: "maxCGPA",
  teachingPoints: "maxTeaching",
  projectsPoints: "maxProjects",
  problemSolvingRank: "maxProblemSolving",
  extraCurricularPoints: "maxExtra",
  coCurricularPoints: "maxCo",
};

const STAR_FIELDS = Object.keys(MAX_KEYS);

/**
 * Get max value for each of the 6 star fields across all students.
 * Tries Redis first; on miss runs MongoDB aggregate and caches in Redis.
 * @returns {Promise<{ maxCGPA: number, maxTeaching: number, maxProjects: number, maxProblemSolving: number, maxExtra: number, maxCo: number }>}
 */
export async function getMaxValues() {
  const cached = await redisGet(REDIS_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // invalid JSON, fall through to aggregate
    }
  }

  const maxValues = await StudentDetails.aggregate([
    {
      $group: {
        _id: null,
        maxCGPA: { $max: "$cgpa" },
        maxProjects: { $max: "$projectsPoints" },
        maxProblemSolving: { $max: "$problemSolvingRank" },
        maxTeaching: { $max: "$teachingPoints" },
        maxExtra: { $max: "$extraCurricularPoints" },
        maxCo: { $max: "$coCurricularPoints" },
      },
    },
  ]);

  const result = maxValues[0]
    ? {
        maxCGPA: Number(maxValues[0].maxCGPA) || 0,
        maxTeaching: Number(maxValues[0].maxTeaching) || 0,
        maxProjects: Number(maxValues[0].maxProjects) || 0,
        maxProblemSolving: Number(maxValues[0].maxProblemSolving) || 0,
        maxExtra: Number(maxValues[0].maxExtra) || 0,
        maxCo: Number(maxValues[0].maxCo) || 0,
      }
    : {
        maxCGPA: 0,
        maxTeaching: 0,
        maxProjects: 0,
        maxProblemSolving: 0,
        maxExtra: 0,
        maxCo: 0,
      };

  await redisSet(REDIS_KEY, JSON.stringify(result));
  return result;
}

/**
 * Normalized contribution for one field (0–1). For problemSolvingRank, lower rank = better so use (maxRank - rank) / maxRank.
 */
function normalizedContribution(field, studentVal, maxVal) {
  const denom = maxVal > 0 ? maxVal : 1;
  if (field === "problemSolvingRank") {
    return Math.max(0, (maxVal - studentVal) / denom);
  }
  return studentVal / denom;
}

/**
 * Compute weighted points (0–1) for a student from the 6 fields. Equal weight 16.67% each.
 * Formula: (cgpa/maxCGPA + projects/maxProjects + (maxRank - problemRank)/maxRank + teaching/maxTeaching + extra/maxExtra + co/maxCo) / 6
 * @param {object} student - Student doc with cgpa, teachingPoints, projectsPoints, problemSolvingRank, extraCurricularPoints, coCurricularPoints
 * @param {object} maxValues - Result from getMaxValues()
 * @returns {number} Weighted points in [0, 1]
 */
export function computeWeightedPoints(student, maxValues) {
  if (!maxValues) return 0;
  let sum = 0;
  for (const field of STAR_FIELDS) {
    const maxKey = MAX_KEYS[field];
    const maxVal = maxValues[maxKey];
    const studentVal = Number(student[field]) || 0;
    sum += normalizedContribution(field, studentVal, maxVal);
  }
  const weighted = sum / STAR_FIELDS.length;
  return Math.min(1, Math.max(0, Math.round(weighted * 1e6) / 1e6));
}

/**
 * Compute professional stars (0–10) for a student from the 6 fields.
 * Same normalization as weightedPoints: problem-solving uses (maxRank - problemRank) / maxRank.
 * @param {object} student - Student doc with cgpa, teachingPoints, projectsPoints, problemSolvingRank, extraCurricularPoints, coCurricularPoints
 * @param {object} maxValues - Result from getMaxValues()
 * @returns {number} Stars out of 10 (0–10)
 */
export function computeStars(student, maxValues) {
  if (!maxValues) return 0;
  let sum = 0;
  for (const field of STAR_FIELDS) {
    const maxKey = MAX_KEYS[field];
    const maxVal = maxValues[maxKey];
    const studentVal = Number(student[field]) || 0;
    sum += normalizedContribution(field, studentVal, maxVal);
  }
  const avg = sum / STAR_FIELDS.length;
  const stars = Math.min(10, Math.round(avg * 10 * 100) / 100);
  return stars;
}

/**
 * After a student's scoring fields are updated: if any new value is greater than the current max in Redis, update Redis.
 * Call this after save/update of a student document that may have changed any of the 6 star fields.
 * No need to recalculate all students; stars are computed dynamically on profile load.
 * @param {object} student - Updated student doc (plain object or mongoose doc) with the 6 fields
 */
export async function updateMaxValuesIfNeeded(student) {
  if (!student) return;
  const cached = await redisGet(REDIS_KEY);
  let current = {
    maxCGPA: 0,
    maxTeaching: 0,
    maxProjects: 0,
    maxProblemSolving: 0,
    maxExtra: 0,
    maxCo: 0,
  };
  if (cached) {
    try {
      current = { ...current, ...JSON.parse(cached) };
    } catch {
      return;
    }
  }

  const updates = {
    maxCGPA: Math.max(current.maxCGPA, Number(student.cgpa) || 0),
    maxTeaching: Math.max(current.maxTeaching, Number(student.teachingPoints) || 0),
    maxProjects: Math.max(current.maxProjects, Number(student.projectsPoints) || 0),
    maxProblemSolving: Math.max(current.maxProblemSolving, Number(student.problemSolvingRank) || 0),
    maxExtra: Math.max(current.maxExtra, Number(student.extraCurricularPoints) || 0),
    maxCo: Math.max(current.maxCo, Number(student.coCurricularPoints) || 0),
  };

  const changed = Object.keys(updates).some((k) => updates[k] !== current[k]);
  if (changed) {
    await redisSet(REDIS_KEY, JSON.stringify(updates));
  }
}
