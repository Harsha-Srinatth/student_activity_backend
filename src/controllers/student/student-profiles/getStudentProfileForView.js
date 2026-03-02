import StudentDetails from "../../../models/student/studentDetails.js";
import { getMaxValues, computeStars } from "../../../services/studentMaxValues.js";

/**
 * GET profile of a student for viewing by another user (student/faculty/hod).
 * When viewer is own profile: also include email, mobileno, username, dateofjoin.
 * All viewers (students viewing others, faculty, HOD) see: basic info, Skills, Extra curricular, points, and professional stars.
 * Professional stars (0–10) are computed from 6 fields vs DB max values (cached in Redis).
 */
export const getStudentProfileForView = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const viewerStudentId = req.user.studentid || null;
    const { studentId } = req.params;

    if (!studentId) {
      return res.status(400).json({ error: "studentId is required" });
    }

    const student = await StudentDetails.findOne({ studentid: studentId, collegeId })
      .select("fullname image studentid programName dept username email mobileno dateofjoin certifications workshops clubsJoined internships projects others cgpa teachingPoints projectsPoints problemSolvingRank extraCurricularPoints coCurricularPoints weightedPoints")
      .lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const isOwnProfile = viewerStudentId && studentId === viewerStudentId;
    const isStudentViewingOther = viewerStudentId && !isOwnProfile;

    const profile = {
      fullname: student.fullname,
      studentid: student.studentid,
      programName: student.programName,
      dept: student.dept,
      profilePic: student.image?.url && student.image.url.length > 0 ? student.image.url : null,
      // Leave space for backend to add more fields later
    };

    if (isOwnProfile) {
      profile.email = student.email;
      profile.mobileno = student.mobileno;
      profile.username = student.username;
      profile.dateofjoin = student.dateofjoin;
    }

    profile.skillsSection = {
      certifications: (student.certifications || []).map((c) => ({ title: c.title, type: c.type })),
      workshops: (student.workshops || []).map((w) => ({ title: w.title, type: w.type })),
      projects: (student.projects || []).map((p) => ({ title: p.title, type: p.type })),
    };

    profile.extraCurricularSection = {
      clubs: (student.clubsJoined || []).map((c) => ({ clubName: c.clubName, title: c.title })),
      internships: (student.internships || []).map((i) => ({ organization: i.organization, role: i.role })),
      others: (student.others || []).map((o) => ({ title: o.title })),
    };

      profile.teachingPoints = student.teachingPoints ?? 0;
      profile.projectsPoints = student.projectsPoints ?? 0;
      profile.problemSolvingRank = student.problemSolvingRank ?? 0;
      profile.extraCurricularPoints = student.extraCurricularPoints ?? 0;
      profile.coCurricularPoints = student.coCurricularPoints ?? 0;
      profile.weightedPoints = student.weightedPoints ?? 0;


    // Professional stars (0–10): average of (studentValue/maxValue) for 6 fields; max values from Redis or DB aggregate
    try {
      const maxValues = await getMaxValues();
      profile.stars = computeStars(student, maxValues);
    } catch (e) {
      profile.stars = 0;
    }

    return res.status(200).json({ success: true, data: profile });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "server error" });
  }
};
