import express from "express";
import { getAnnouncementsForUser } from "../controllers/shared/getAnnouncements.js";
import { createClubAnnouncement, getMyClubs, updateClubAnnouncement, deleteClubAnnouncement } from "../controllers/shared/clubAnnouncementController.js";
import uploadAnnouncement from "../middlewares/uploadAnnouncement.js";
import { checkauth, requireRole } from "../middlewares/authCheck.js";
import upload from "../middlewares/upload.js";

// Student Controllers
import student_Dashboard_Details, { getAllStudentApprovals } from "../controllers/student/student_Dash.js";
import getStudentAchievements from "../controllers/student/student_achievements.js";
import studentDocUpload from "../controllers/student/S_Doc_Up.js";
import AddProfile from "../controllers/student/AddProfile.js";
import updateStudentSettings from "../controllers/student/update_settings.js";
import { generateStudentPortfolioPDF } from "../controllers/student/download_pdf.js";
import getStudentProfile from "../controllers/student/get_profile.js";
import getStudentAttendance from "../controllers/student/student_attendance.js";
import { getClubsJoined, enrollInClub } from "../controllers/student/clubEnrollment.js";
import { getAllClubs, getClubMembers } from "../controllers/student/clubController.js";
import { studentReqForLeave, studentLeaveRequests, getSpecificLeaveReqDetails } from '../controllers/student/leaveReq.js';
import {
  createCourse,
  joinCourse,
  getMyCourses,
  getJoinedCourses,
  getDiscoverableCourses,
  getCourseById,
  addCourseContent,
  deleteCourseContent,
} from "../controllers/student/courseController.js";
import uploadCourse from "../middlewares/uploadCourse.js";
import uploadCourseContent from "../middlewares/uploadCourseContent.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(checkauth);
router.use(requireRole("student"));

// Profile Management
router.post("/upload-profile-img", upload.single("studentprofilePhoto"), AddProfile);
router.get("/profile", getStudentProfile);
router.put("/profile/update", updateStudentSettings);

// Dashboard & Overview
router.get("/home", student_Dashboard_Details);
router.get("/achievements", getStudentAchievements);
router.get("/attendance", getStudentAttendance);
router.get("/all-approvals", getAllStudentApprovals);

// Document Management
router.post("/upload/Docs", upload.single("image"), studentDocUpload);
router.get("/portfolio-pdf", generateStudentPortfolioPDF);

// Club Enrollment
router.post("/enrollments", enrollInClub);
router.get("/enrollments/alreadyenrolled", getClubsJoined);
router.get("/clubs", getAllClubs);
router.get("/clubs/:clubId/members", getClubMembers);

// Leave Requests
router.post("/leave/submit", studentReqForLeave);
router.get("/leave/requests", studentLeaveRequests);
router.get("/leave/details/:requestId", getSpecificLeaveReqDetails);

// Doubts
import {
  getCollegeDoubts,
  createDoubt,
  getDoubtById,
  createReply,
  deleteDoubt,
  toggleSolvedDoubt,
} from "../controllers/student/doubtController.js";

router.get("/doubts", getCollegeDoubts);
router.post("/doubts", createDoubt);
router.get("/doubts/:doubtId", getDoubtById);
router.post("/doubts/:doubtId/replies", createReply);
router.delete("/doubts/:doubtId", deleteDoubt);
router.patch("/doubts/:doubtId/solve", toggleSolvedDoubt);

// Announcements
router.get("/announcements", getAnnouncementsForUser);
router.get("/clubs/my", getMyClubs);
router.post("/clubs/announcements", uploadAnnouncement.single("image"), createClubAnnouncement);
router.put("/clubs/announcements/:id", uploadAnnouncement.single("image"), updateClubAnnouncement);
router.delete("/clubs/announcements/:id", deleteClubAnnouncement);

// Skill Exchange / Courses
router.post("/courses", uploadCourse.single("coverImage"), createCourse);
router.post("/courses/join", joinCourse);
router.get("/courses/my", getMyCourses);
router.get("/courses/joined", getJoinedCourses);
router.get("/courses/discover", getDiscoverableCourses);
router.get("/courses/:courseId", getCourseById);
router.post("/courses/:courseId/content", uploadCourseContent.single("file"), addCourseContent);
router.delete("/courses/:courseId/content/:contentId", deleteCourseContent);

export default router;

