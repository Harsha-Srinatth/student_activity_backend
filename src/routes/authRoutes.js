import express from "express";
//import { generateOtp, saveOtp, verifyOtp } from "../utils/otpHelper.js";
import { enqueueFacultyRegistration ,enqueueStudentRegistration} from "../controllers/authController.js";
import { loginAsStudent } from "../controllers/student/loginAsStudent.js";
import { loginAsFaculty } from "../controllers/faculty/loginAsFaculty.js";
import  student_Dashboard_Details from "../controllers/student/student_Dash.js";
import faculty_Dashboard_Details from "../controllers/faculty/faculty_Dashboard_Details.js"
import { checkauth , requireRole } from "../middlewares/authCheck.js";
import studentDocUpload from "../controllers/student/S_Doc_Up.js";
import { getPendingApprovals, handleApproval, getStudentDetails, bulkApproval } from "../controllers/faculty/faculty_approve.js";
import { getFacultyActivities, getFacultyMetrics } from "../controllers/faculty/faculty_activities.js";
import upload from "../middlewares/upload.js"
const router = express.Router();

// POST 
// router.post("/otp/send", async (req, res) => {
//   const { mobile } = req.body;
//   if (!mobile) return res.status(400).json({ success: false, message: "Mobile required" });

//   const otp = generateOtp();
//   await saveOtp(mobile, otp);

//   // instead of sending SMS, just log it (for hackathon)
//   console.log(`OTP for ${mobile}: ${otp}`);

//   res.json({ success: true, message: "OTP generated (check server console)" });
// });

// // POST
// router.post("/otp/verify", async (req, res) => {
//   const { mobile, otp } = req.body;
//   if (!mobile || !otp) return res.status(400).json({ success: false, message: "Mobile & OTP required" });

//   const valid = await verifyOtp(mobile, otp);
//   if (!valid) return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

//   res.json({ success: true, message: "OTP verified ✅" });
// });

//registration process
router.post("/register/faculty", enqueueFacultyRegistration);
router.post("/register/student", enqueueStudentRegistration);

//login process
router.post("/login/as/student", loginAsStudent);
router.post("/login/as/faculty", loginAsFaculty);

//student Docs Upload
router.post(
  "/upload/:studentid",
  checkauth,
  requireRole("student"),
  upload.single("image"),
  studentDocUpload
);

//student dashboard overview 
router.get("/student/home",checkauth,requireRole("student"),student_Dashboard_Details);
router.get("/faculty/home",checkauth,requireRole("faculty"),faculty_Dashboard_Details)

//faculty approval routes,
router.get("/faculty/pending-approvals", checkauth, requireRole("faculty"), getPendingApprovals);
router.get("/faculty/student/:studentid", checkauth, requireRole("faculty"), getStudentDetails);
router.post("/faculty/approve/:studentid/:approvalId", checkauth, requireRole("faculty"), handleApproval);
router.post("/faculty/bulk-approve/:studentid", checkauth, requireRole("faculty"), bulkApproval);

//faculty activities and metrics routes,
router.get("/faculty/activities", checkauth, requireRole("faculty"), getFacultyActivities);
router.get("/faculty/metrics", checkauth, requireRole("faculty"), getFacultyMetrics);




export default router;
