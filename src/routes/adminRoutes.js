import express from "express";
import { registerAdmin } from "../controllers/admin/registerAdmin.js";
import { loginAsAdmin } from "../controllers/admin/loginAsAdmin.js";
import {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
} from "../controllers/admin/announcementController.js";
import {
  getAdminDashboardStats,
  getDepartmentPerformance,
  getSectionWiseAttendance,
  getStudentAttendanceBySection,
} from "../controllers/admin/adminDashboardController.js";
import { checkauth, requireRole } from "../middlewares/authCheck.js";
import uploadAnnouncement from "../middlewares/uploadAnnouncement.js";

const router = express.Router();

// Public routes
router.post("/register", registerAdmin);
router.post("/login", loginAsAdmin);

// Protected routes - require admin authentication
router.use(checkauth);
router.use(requireRole("admin"));

// Dashboard routes
router.get("/dashboard/stats", getAdminDashboardStats);
router.get("/dashboard/department-performance", getDepartmentPerformance);
router.get("/dashboard/attendance/section-wise", getSectionWiseAttendance);
router.get("/dashboard/attendance/students", getStudentAttendanceBySection);

// Announcement routes
router.post("/announcements", uploadAnnouncement.single("image"), createAnnouncement);
router.get("/announcements", getAnnouncements);
router.get("/announcements/:id", getAnnouncementById);
router.put("/announcements/:id", uploadAnnouncement.single("image"), updateAnnouncement);
router.delete("/announcements/:id", deleteAnnouncement);

export default router;

