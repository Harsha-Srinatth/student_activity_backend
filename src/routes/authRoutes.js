import express from "express";
//import { generateOtp, saveOtp, verifyOtp } from "../utils/otpHelper.js";
import { enqueueFacultyRegistration ,enqueueStudentRegistration} from "../controllers/authController.js";
import { loginAsStudent } from "../controllers/student/loginAsStudent.js";
import { loginAsFaculty } from "../controllers/faculty/loginAsFaculty.js";
import { checkauth } from "../middlewares/authCheck.js";
import studentDocUpload from "../controllers/student/S_Doc_Up.js";
import { getPendingApprovals, handleApproval, getStudentDetails, bulkApproval } from "../controllers/faculty/faculty_approve.js";
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
router.post("/upload/:studentid", checkauth, upload.single("image"), studentDocUpload)

//student dashboard overview 
// router.get("/student/home" , checkauth ,  );

//faculty approval routes
router.get("/faculty/pending-approvals", checkauth, getPendingApprovals);
router.get("/faculty/student/:studentid", checkauth, getStudentDetails);
router.post("/faculty/approve/:studentid/:approvalId", checkauth, handleApproval);
router.post("/faculty/bulk-approve/:studentid", checkauth, bulkApproval);



export default router;
