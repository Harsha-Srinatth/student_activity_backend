import express from "express";
import { enqueueFacultyRegistration, enqueueStudentRegistration } from "../controllers/authController.js";
import { loginAsStudent } from "../controllers/student/loginAsStudent.js";
import { loginAsFaculty } from "../controllers/faculty/loginAsFaculty.js";
import { sendOtp, verifyOtpController } from "../controllers/otpController.js";

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

export default router;
