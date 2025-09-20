import express from "express";
//import { generateOtp, saveOtp, verifyOtp } from "../utils/otpHelper.js";
import { enqueueFacultyRegistration ,enqueueStudentRegistration} from "../controllers/authController.js";
import { loginAsStudent } from "../controllers/student/loginAsStudent.js";
import { loginAsFaculty } from "../controllers/faculty/loginAsFaculty.js";
import  student_Dashboard_Details, { getAllStudentApprovals } from "../controllers/student/student_Dash.js";
import getStudentAchievements from "../controllers/student/student_achievements.js";
import faculty_Dashboard_Details from "../controllers/faculty/faculty_Dashboard_Details.js"
import { checkauth , requireRole } from "../middlewares/authCheck.js";
import studentDocUpload from "../controllers/student/S_Doc_Up.js";
import AddProfile from "../controllers/student/AddProfile.js";
import AddProfileF from "../controllers/faculty/AddProfileF.js";
import updateStudentSettings from "../controllers/student/update_settings.js";
import updateFacultySettings from "../controllers/faculty/update_settings.js";
import { generateStudentPortfolioPDF } from "../controllers/student/download_pdf.js";
import getStudentProfile from "../controllers/student/get_profile.js";
import { getPendingApprovals, handleApproval, getStudentDetailsFrom, bulkApproval } from "../controllers/faculty/faculty_approve.js";
import { verifyAchievement, getStudentAchievementsForReview, bulkVerifyAchievements, backfillStudentVerifications } from "../controllers/faculty/verify_achievements.js";
import { getFacultyActivities, getFacultyMetrics } from "../controllers/faculty/faculty_activities.js";
import { getStudentsByFaculty, getStudentCountByFaculty, getStudentDetails, getAllFaculty } from "../controllers/faculty/faculty_students.js";
import upload from "../middlewares/upload.js";
import { searchStudents } from "../controllers/faculty/searchStudents.js";
import { submitAttendance } from "../controllers/faculty/faculty_attendance.js";
import { bulkUpsertMidMarks, getResults } from "../controllers/faculty/faculty_marks.js";
import { getCurriculumBySemester } from "../controllers/faculty/faculty_curriculum.js";
import getStudentAttendance from "../controllers/student/student_attendance.js";
import { getEnrollments, enrollInClub } from "../controllers/student/clubEnrollment.js";
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
  "/upload/student/Docs",
  checkauth,
  requireRole("student"),
  upload.single("image"),
  studentDocUpload
);
//upload student profile 
router.post("/student/upload-profile-img",
  checkauth,
  requireRole("student"),
  upload.single("studentprofilePhoto"),
  AddProfile);

//upload faculty profile
router.post("/faculty/upload-profile-img",
  checkauth,
  requireRole("faculty"),
  upload.single("facultyprofilePhoto"),
  AddProfileF
);

// settings update routes
router.put("/student/settings",
  checkauth,
  requireRole("student"),
  updateStudentSettings
);

router.put("/faculty/settings",
  checkauth,
  requireRole("faculty"),
  updateFacultySettings
);

//student dashboard overview 
router.get("/student/home",checkauth,requireRole("student"),student_Dashboard_Details);
router.get("/student/achievements",checkauth,requireRole("student"),getStudentAchievements);
router.get("/student/profile", checkauth, requireRole("student"), getStudentProfile);
router.get("/student/attendance", checkauth, requireRole("student"), getStudentAttendance);
router.get("/faculty/home",checkauth,requireRole("faculty"),faculty_Dashboard_Details)

//faculty approval routes,
router.get("/faculty/pending-approvals", checkauth, requireRole("faculty"), getPendingApprovals);
router.get("/faculty/student/:studentid", checkauth, requireRole("faculty"), getStudentDetailsFrom);
router.post("/faculty/approve/:studentid", checkauth, requireRole("faculty"), handleApproval);
// backward compatibility: accept old path with approvalId or trailing segment
router.post("/faculty/approve/:studentid/:approvalId", checkauth, requireRole("faculty"), handleApproval);
router.post("/faculty/approve/:studentid/:approvalId/:extra", checkauth, requireRole("faculty"), handleApproval);
router.post("/faculty/bulk-approve/:studentid", checkauth, requireRole("faculty"), bulkApproval);

//faculty activities and metrics routes,
router.get("/faculty/activities", checkauth, requireRole("faculty"), getFacultyActivities);
router.get("/faculty/metrics", checkauth, requireRole("faculty"), getFacultyMetrics);

//faculty students routes
router.get("/faculty/students", checkauth, requireRole("faculty"), getStudentsByFaculty);
router.get("/faculty/students/count", checkauth, requireRole("faculty"), getStudentCountByFaculty);
router.get("/faculty/student-details/:studentid", checkauth, requireRole("faculty"), getStudentDetails);
router.get("/faculty/all", checkauth, getAllFaculty);

//faculty search for students
router.get("/faculty/search",checkauth,requireRole("faculty"),searchStudents);
 
//generate pdf for student portfolio
router.get("/student/:studentid/portfolio-pdf",checkauth,requireRole("student"),generateStudentPortfolioPDF);

//faculty achievement verification routes
router.get("/faculty/student/:studentid/achievements", checkauth, requireRole("faculty"), getStudentAchievementsForReview);
router.post("/faculty/student/:studentid/verify/:achievementType/:achievementId", checkauth, requireRole("faculty"), verifyAchievement);
router.post("/faculty/student/:studentid/bulk-verify", checkauth, requireRole("faculty"), bulkVerifyAchievements);
// one-time sync route to backfill verification fields
router.post("/faculty/student/:studentid/backfill-verifications", checkauth, requireRole("faculty"), backfillStudentVerifications);

router.get("/student/all-approvals", checkauth, requireRole("student"), getAllStudentApprovals);

// New academic & attendance routes
router.post("/api/attendance", checkauth, requireRole("faculty"), submitAttendance);
router.get("/api/curriculum", checkauth, getCurriculumBySemester);
router.post("/api/marks/bulk", checkauth, requireRole("faculty"), bulkUpsertMidMarks);
router.get("/api/results", checkauth, getResults);

//entrolments 
router.post("/api/enrollments", checkauth, requireRole("student"), enrollInClub);
router.get("/api/enrollments/alreadyenrolled", checkauth, requireRole("student"), getEnrollments);


export default router;
