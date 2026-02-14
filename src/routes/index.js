import express from "express";
import authRoutes from "./authRoutes.js";
import studentRoutes from "./studentRoutes.js";
import facultyRoutes from "./facultyRoutes.js";
import adminRoutes from "./adminRoutes.js";
import hodRoutes from "./hodRoutes.js";

const router = express.Router();

// Mount route modules
// IMPORTANT: More specific routes (like /faculty, /student) must come BEFORE catch-all routes (like /)
// This ensures /faculty/home matches facultyRoutes, not authRoutes /faculty/:facultyId
router.use("/student", studentRoutes);
router.use("/faculty", facultyRoutes);
router.use("/admin", adminRoutes);
router.use("/hod", hodRoutes);
router.use("/", authRoutes); // Auth routes last to avoid catching /faculty/*, /student/*, etc.

// Shared API routes (for backward compatibility with /api prefix)
import { checkauth, requireRole } from "../middlewares/authCheck.js";
import { getCurriculumBySemester } from "../controllers/faculty/faculty_curriculum.js";
import { getResults } from "../controllers/faculty/faculty_marks.js";
import { getClubsJoined, enrollInClub } from "../controllers/student/clubEnrollment.js";
import { getAllClubs, getClubMembers } from "../controllers/student/clubController.js";
import { submitAttendance } from "../controllers/faculty/faculty_attendance.js";
import { bulkUpsertMidMarks } from "../controllers/faculty/faculty_marks.js";
import { studentReqForLeave, studentLeaveRequests, getSpecificLeaveReqDetails } from '../controllers/student/leaveReq.js';

// Academic routes (shared between student and faculty)
router.get("/api/curriculum", checkauth, getCurriculumBySemester);
router.get("/api/results", checkauth, getResults);

// Student routes (for backward compatibility with /api prefix)
router.post("/api/enrollments", checkauth, requireRole("student"), enrollInClub);
router.get("/api/enrollments/alreadyenrolled", checkauth, requireRole("student"), getClubsJoined);
router.get("/api/clubs", checkauth, getAllClubs);
router.get("/api/clubs/:clubId/members", checkauth, requireRole("student"), getClubMembers);
router.post("/leave/submit", checkauth, requireRole("student"), studentReqForLeave);
router.get("/leave/student", checkauth, requireRole("student"), studentLeaveRequests);
router.get("/leave/details/:requestId", checkauth, requireRole("student"), getSpecificLeaveReqDetails);

// Faculty routes (for backward compatibility with /api prefix)
router.post("/api/attendance", checkauth, requireRole("faculty"), submitAttendance);
router.post("/api/marks/bulk", checkauth, requireRole("faculty"), bulkUpsertMidMarks);

export default router;

