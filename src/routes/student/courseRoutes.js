/**
 * Student course routes.
 * Mount at: app.use("/student/courses", courseRoutes);
 * Requires: auth middleware that sets req.user = { studentid, collegeId }
 *
 * In your main app (e.g. index.js or app.js):
 *   import courseRoutes from "./routes/student/courseRoutes.js";
 *   app.use("/student/courses", courseRoutes);
 *
 * Ensure your auth middleware path is correct below.
 */
import { Router } from "express";
import {
  getTeachingPoints,
  createCourse,
  joinCourse,
  getMyCourses,
  getJoinedCourses,
  getDiscoverableCourses,
  getCourseById,
  addCourseContent,
  deleteCourseContent,
} from "../../controllers/student/courseController.js";

// Use your existing student auth middleware – adjust the import path as needed
// e.g. import { auth } from "../../middleware/auth.js";
const auth = (req, res, next) => next(); // placeholder – replace with real auth

const router = Router();

router.get("/teaching-points", auth, getTeachingPoints);
router.post("/", auth, createCourse); // optional: add upload.single("coverImage") if using multer
router.post("/join", auth, joinCourse);
router.get("/my", auth, getMyCourses);
router.get("/joined", auth, getJoinedCourses);
router.get("/discover", auth, getDiscoverableCourses);
router.get("/:courseId", auth, getCourseById);
router.post("/:courseId/content", auth, addCourseContent); // optional: multer for file upload
router.delete("/:courseId/content/:contentId", auth, deleteCourseContent);

export default router;
