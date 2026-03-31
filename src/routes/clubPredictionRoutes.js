import express from "express";
import { checkauth, requireRole } from "../middlewares/authCheck.js";
import predictClubJoiners from "../controllers/hod/clubPredictionController.js";

const router = express.Router();

router.use(checkauth);

// Allow either hod or faculty to call the prediction endpoint
const requireHodOrFaculty = (req, res, next) => {
  const role = req.user?.role;
  if (role !== "hod" && role !== "faculty") {
    return res.status(403).json({ message: "Forbidden: HOD or Faculty only" });
  }
  next();
};

/**
 * POST /api/club/predict-joiners
 * Accessible by hod and faculty roles.
 * Scores all students in the college against the club questionnaire
 * and returns a predicted joiner count with top 10 students.
 */
router.post("/predict-joiners", requireHodOrFaculty, predictClubJoiners);

export default router;
