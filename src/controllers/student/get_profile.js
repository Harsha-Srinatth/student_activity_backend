import StudentDetails from "../../models/studentDetails.js";
import FacultyDetails from "../../models/facultyDetails.js";
import CollegeSchema from "../../models/collegeSchema.js";

/**
 * GET /student/profile
 * Returns basic profile info for the logged-in student
 * Optimized: Single aggregation query, only fetches needed fields
 */
const getStudentProfile = async (req, res) => {
  try {
    const { studentid } = req.user || {};
    if (!studentid) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Single aggregation query to get student + college + faculty in one go
    const result = await StudentDetails.aggregate([
      { $match: { studentid } },
      {
        $lookup: {
          from: "colleges", // MongoDB collection name (usually pluralized)
          localField: "collegeId",
          foreignField: "collegeId",
          as: "college"
        }
      },
      {
        $lookup: {
          from: "faculties", // MongoDB collection name
          localField: "facultyid",
          foreignField: "facultyid",
          as: "faculty"
        }
      },
      {
        $project: {
          fullname: 1,
          email: 1,
          username: 1,
          mobileno: 1,
          programName: 1,
          dept: 1,
          studentid: 1,
          facultyid: 1,
          "image.url": 1,
          collegeName: { $arrayElemAt: ["$college.collegeName", 0] },
          facultyName: { $arrayElemAt: ["$faculty.fullname", 0] },
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    const student = result[0];

    // If lookup didn't work, fallback to separate queries (for compatibility)
    let collegeName = student.collegeName;
    let facultyName = student.facultyName;

    if (!collegeName) {
      const college = await CollegeSchema.findOne({ collegeId: student.collegeId })
        .select('collegeName')
        .lean();
      collegeName = college?.collegeName || null;
    }

    if (!facultyName && student.facultyid) {
      const faculty = await FacultyDetails.findOne({ facultyid: student.facultyid })
        .select('fullname')
        .lean();
      facultyName = faculty?.fullname || null;
    }

    const profile = {
      fullname: student.fullname,
      email: student.email,
      username: student.username,
      mobileno: student.mobileno,
      programName: student.programName,
      dept: student.dept,
      branch: student.dept, // Alias
      collegeName: collegeName,
      studentid: student.studentid,
      facultyName: facultyName,
      facultyid: student.facultyid || null,
      profilePic: student.image?.url && student.image.url.length > 0
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
