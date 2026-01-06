import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";
import CollegeSchema from "../../models/shared/collegeSchema.js";

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
          from: "colleges", // Use actual collection name
          localField: "collegeId",
          foreignField: "collegeId",
          as: "college"
        }
      },
      {
        $lookup: {
          from: "faculties", // Use actual collection name
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
          collegeName: { 
            $let: {
              vars: { firstCollege: { $arrayElemAt: ["$college", 0] } },
              in: { $ifNull: ["$$firstCollege.collegeName", null] }
            }
          },
          facultyName: { 
            $let: {
              vars: { firstFaculty: { $arrayElemAt: ["$faculty", 0] } },
              in: { $ifNull: ["$$firstFaculty.fullname", null] }
            }
          },
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    const student = result[0];

    const profile = {
      fullname: student.fullname,
      email: student.email,
      username: student.username,
      mobileno: student.mobileno,
      programName: student.programName,
      dept: student.dept,
      branch: student.dept, // Alias
      collegeName: student.collegeName,
      studentid: student.studentid,
      facultyName: student.facultyName,
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
