// src/controllers/faculty/faculty_students.js
import StudentDetails from "../../models/studentDetails.js";

// Get all students under a specific faculty
export const getStudentsByFaculty = async (req, res) => {
  try {
    const facultyid = req.user.facultyid;
    
    if (!facultyid) {
      return res.status(400).json({ message: "Faculty ID not found in token" });
    }

    // Get students with the specified faculty ID
    const students = await StudentDetails.find({ facultyid })
      .select('studentid fullname username email image programName semester dateofjoin')
      .sort({ dateofjoin: -1 }); // Sort by newest first

    // Get total count
    const totalCount = students.length;

    res.json({
      success: true,
      totalCount,
      students
    });
  } catch (error) {
    console.error("Error fetching students by faculty:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch students",
      error: error.message 
    });
  }
};

// Get student count only (for dashboard stats)
export const getStudentCountByFaculty = async (req, res) => {
  try {
    const facultyid = req.user.facultyid;
    
    if (!facultyid) {
      return res.status(400).json({ message: "Faculty ID not found in token" });
    }

    // Get only the count
    const count = await StudentDetails.countDocuments({ facultyid });

    res.json({
      success: true,
      totalCount: count
    });
  } catch (error) {
    console.error("Error fetching student count:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch student count",
      error: error.message 
    });
  }
};

// Get detailed student information by student ID
export const getStudentDetails = async (req, res) => {
  try {
    const { studentid } = req.params;
    
    if (!studentid) {
      return res.status(400).json({ message: "Student ID is required" });
    }

    const student = await StudentDetails.findOne({ studentid })
      .select('-password') // Exclude password
      .populate('certifications')
      .populate('workshops')
      .populate('clubsJoined');

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: "Student not found" 
      });
    }

    res.json({
      success: true,
      student
    });
  } catch (error) {
    console.error("Error fetching student details:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch student details",
      error: error.message 
    });
  }
};
