import express from "express";
import { loginAsHOD } from "../controllers/hod/loginAsHOD.js";
import {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
} from "../controllers/hod/announcementController.js";
import {
  getHODDashboardStats,
  getDepartmentPerformance,
  getSectionWiseAttendance,
  getStudentAttendanceBySection,
  getAvailableSections,
} from "../controllers/hod/hodDashboardController.js";
import {
  getDepartmentFaculty,
  getDepartmentStudents,
  getFacultyAssignments,
  assignFacultyToSection,
  removeFacultyAssignment,
  getFacultySections,
  getHODInfo,
} from "../controllers/hod/hodAssignmentController.js";
import { checkauth, requireRole } from "../middlewares/authCheck.js";
import uploadAnnouncement from "../middlewares/uploadAnnouncement.js";
import uploadClubImage from "../middlewares/uploadClubImage.js";
import {
  createClub,
  getDepartmentClubs,
  updateClubAssignments,
  deleteClub,
  searchFaculty,
  searchStudents,
} from "../controllers/hod/clubController.js";

const router = express.Router();

// Public routes
router.post("/login", loginAsHOD);

// HOD Info route (requires auth but accessible for HOD)
router.get("/info", checkauth, getHODInfo);

// Protected routes - require HOD authentication
router.use(checkauth);
router.use(requireRole("hod"));

// Dashboard routes
router.get("/dashboard/stats", getHODDashboardStats);
router.get("/dashboard/department-performance", getDepartmentPerformance);
router.get("/dashboard/sections", getAvailableSections);
router.get("/dashboard/attendance/section-wise", getSectionWiseAttendance);
router.get("/dashboard/attendance/students", getStudentAttendanceBySection);

// Faculty Assignment routes
router.get("/faculty", getDepartmentFaculty);
router.get("/students", getDepartmentStudents);
router.get("/assignments", getFacultyAssignments);
router.post("/assign", assignFacultyToSection);
router.delete("/assign", removeFacultyAssignment);
router.get("/faculty/:facultyId/sections", getFacultySections);

// Announcement routes
router.post("/announcements", uploadAnnouncement.single("image"), createAnnouncement);
router.get("/announcements", getAnnouncements);
router.get("/announcements/:id", getAnnouncementById);
router.put("/announcements/:id", uploadAnnouncement.single("image"), updateAnnouncement);
router.delete("/announcements/:id", deleteAnnouncement);

// Club routes
router.post("/clubs", uploadClubImage.single("image"), createClub);
router.get("/clubs", getDepartmentClubs);
router.put("/clubs/:clubId/assign", updateClubAssignments);
router.delete("/clubs/:clubId", deleteClub);
router.get("/clubs/search/faculty", searchFaculty);
router.get("/clubs/search/students", searchStudents);

export default router;

