import express from "express";
import { enqueueFacultyRegistration, enqueueStudentRegistration } from "../controllers/authController.js";
import { loginAsStudent } from "../controllers/student/loginAsStudent.js";
import { loginAsFaculty } from "../controllers/faculty/loginAsFaculty.js";
import { sendOtp, verifyOtpController } from "../controllers/otpController.js";
import { getCollegeByCollegeId, searchColleges } from "../controllers/shared/collegeController.js";
import { getFacultyByFacultyId, searchFaculty } from "../controllers/shared/facultyController.js";

const router = express.Router();

// Registration routes
router.post("/register/faculty", enqueueFacultyRegistration);
router.post("/register/student", enqueueStudentRegistration);

// Login routes
router.post("/login/as/student", loginAsStudent);
router.post("/login/as/faculty", loginAsFaculty);

// OTP routes
router.post("/otp/send", sendOtp);
router.post("/otp/verify", verifyOtpController);

// College lookup routes (public)
router.get("/college/:collegeId", getCollegeByCollegeId);
router.get("/colleges/search", searchColleges);

// Faculty lookup routes (public)
// IMPORTANT: More specific routes must come before parameterized routes
router.get("/faculty/search", searchFaculty);
router.get("/faculty/:facultyId", getFacultyByFacultyId);

export default router;
