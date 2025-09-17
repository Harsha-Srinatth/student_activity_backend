import StudentDetails from "../../models/studentDetails.js";
import FacultyDetails from "../../models/facultyDetails.js";

// GET /student/profile
// Returns basic profile info for the logged-in student
const getStudentProfile = async (req, res) => {
  try {
    const { studentid } = req.user || {};
    if (!studentid) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const student = await StudentDetails.findOne(
      { studentid },
      {
        _id: 0,
        studentid: 1,
        fullname: 1,
        email: 1,
        username: 1,
        mobileno: 1,
        programName: 1,
        dept: 1,
        institution: 1,
        image: 1,
        facultyid: 1,
      }
    ).lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // fetch faculty name by facultyid if present
     let facultyName = null;
    if (student?.facultyid) {
      const faculty = await FacultyDetails.findOne(
        { facultyid: student.facultyid },
        { fullname: 1, facultyid: 1 }
      ).lean();
      facultyName = faculty?.fullname || null;
    }

    const profile = {
      fullname: student.fullname,
      email: student.email,
      username: student.username,
      mobileno: student.mobileno,
      programName: student.programName,
      dept: student.dept,
      branch: student.dept,
      institution: student.institution,
      studentid: student.studentid,
      facultyName: facultyName,
      facultyid: student.facultyid || null,
      profilePic:
        student?.image?.url && student.image.url.length > 0
          ? student.image.url
          : "https://api.dicebear.com/7.x/avataaars/svg?seed=student",
    };

    return res.status(200).json({ success: true, data: profile });
  } catch (error) {
    console.error("getStudentProfile error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export default getStudentProfile;


