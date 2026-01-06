import express from "express";
import { checkauth, requireRole } from "../middlewares/authCheck.js";
import upload from "../middlewares/upload.js";

// Faculty Controllers
import faculty_Dashboard_Details from "../controllers/faculty/faculty_Dashboard_Details.js";
import AddProfileF from "../controllers/faculty/AddProfileF.js";
import updateFacultySettings from "../controllers/faculty/update_settings.js";
import { getPendingApprovals, handleApproval, getStudentDetailsFrom, bulkApproval } from "../controllers/faculty/faculty_approve.js";
import { verifyAchievement, getStudentAchievementsForReview, bulkVerifyAchievements, backfillStudentVerifications } from "../controllers/faculty/verify_achievements.js";
import { getFacultyActivities, getFacultyMetrics } from "../controllers/faculty/faculty_activities.js";
import { getStudentsByFaculty, getStudentCountByFaculty, getStudentDetails, getAllFaculty } from "../controllers/faculty/faculty_students.js";
import { searchStudents } from "../controllers/faculty/searchStudents.js";
import { submitAttendance } from "../controllers/faculty/faculty_attendance.js";
import { bulkUpsertMidMarks, getResults } from "../controllers/faculty/faculty_marks.js";
import { getCurriculumBySemester } from "../controllers/faculty/faculty_curriculum.js";
import {
  getAllPendingLeaveReq,
  processLeaveReq,
  getFacultyLeaveStats,
  getFacultyProfile
} from '../controllers/faculty/leaveRequests.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(checkauth);

// Profile Management
router.post("/upload-profile-img", requireRole("faculty"), upload.single("facultyprofilePhoto"), AddProfileF);
router.get("/profile", requireRole("faculty"), getFacultyProfile);
router.put("/settings", requireRole("faculty"), updateFacultySettings);

// Dashboard & Overview
router.get("/home", requireRole("faculty"), faculty_Dashboard_Details);
router.get("/dashboard-stats", requireRole("faculty"), getFacultyLeaveStats);
router.get("/activities", requireRole("faculty"), getFacultyActivities);
router.get("/metrics", requireRole("faculty"), getFacultyMetrics);

// Student Management
router.get("/students", requireRole("faculty"), getStudentsByFaculty);
router.get("/students/count", requireRole("faculty"), getStudentCountByFaculty);
router.get("/student-details/:studentid", requireRole("faculty"), getStudentDetails);
router.get("/student/:studentid", requireRole("faculty"), getStudentDetailsFrom);
router.get("/search", requireRole("faculty"), searchStudents);
router.get("/all", getAllFaculty);

// Approval Management
router.get("/pending-approvals", requireRole("faculty"), getPendingApprovals);
router.post("/approve/:studentid", requireRole("faculty"), handleApproval);
router.post("/approve/:studentid/:approvalId", requireRole("faculty"), handleApproval);
router.post("/approve/:studentid/:approvalId/:extra", requireRole("faculty"), handleApproval);
router.post("/bulk-approve/:studentid", requireRole("faculty"), bulkApproval);

// Achievement Verification
router.get("/student/:studentid/achievements", requireRole("faculty"), getStudentAchievementsForReview);
router.post("/student/:studentid/verify/:achievementType/:achievementId", requireRole("faculty"), verifyAchievement);
router.post("/student/:studentid/bulk-verify", requireRole("faculty"), bulkVerifyAchievements);
router.post("/student/:studentid/backfill-verifications", requireRole("faculty"), backfillStudentVerifications);

// Academic Management
router.post("/attendance", requireRole("faculty"), submitAttendance);
router.get("/curriculum", getCurriculumBySemester);
router.post("/marks/bulk", requireRole("faculty"), bulkUpsertMidMarks);
router.get("/results", getResults);

// Leave Request Management
router.get("/leave-requests", requireRole("faculty"), getAllPendingLeaveReq);
router.put("/leave-requests/:studentid/:requestId", requireRole("faculty"), processLeaveReq);

export default router;

