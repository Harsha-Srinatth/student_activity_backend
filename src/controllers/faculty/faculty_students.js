// src/controllers/faculty/faculty_students.js
import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";

// Get all students under a specific faculty
export const getStudentsByFaculty = async (req, res) => {
  try {
    const facultyid = req.user.facultyid;
    const { section, year } = req.query; // Get section (programName) and year filters
    
    if (!facultyid) {
      return res.status(400).json({ message: "Faculty ID not found in token" });
    }

    // Build query filter
    const query = { facultyid };
    
    // Filter by section (programName) if provided
    if (section && section !== 'all') {
      query.programName = section;
    }
    
    // Filter by year if provided (year 1 = semesters 1-2, year 2 = semesters 3-4, etc.)
    if (year && year !== 'all') {
      const yearNum = parseInt(year);
      if (!isNaN(yearNum) && yearNum >= 1 && yearNum <= 4) {
        const minSemester = (yearNum - 1) * 2 + 1;
        const maxSemester = yearNum * 2;
        query.semester = { $gte: minSemester, $lte: maxSemester };
      }
    }

    // Get students with the specified faculty ID, sorted by studentid
    const students = await StudentDetails.find(query)
      // include attendance so frontend can compute percentage
      .select('studentid fullname username email image programName semester dateofjoin collegeId mobileno dept attendance')
      .sort({ studentid: 1 }); // Sort by studentid in ascending order

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
// DEPRECATED: Use /faculty/home endpoint which includes totalStudents in stats
// Kept for backward compatibility but recommends using dashboard endpoint
export const getStudentCountByFaculty = async (req, res) => {
  try {
    const facultyid = req.user.facultyid;
    
    if (!facultyid) {
      return res.status(400).json({ message: "Faculty ID not found in token" });
    }

    // Get only the count - optimized query
    const count = await StudentDetails.countDocuments({ facultyid });

    res.json({
      success: true,
      totalCount: count,
      // Include deprecation notice
      _deprecated: "This endpoint is deprecated. Use /faculty/home endpoint which includes totalStudents in stats."
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

// Get all faculty (for faculty page, no merits)
export const getAllFaculty = async (req, res) => {
  try {
    // Only select basic details needed for the faculty page
    const facultyList = await FacultyDetails.find({})
      .select('facultyid fullname collegeId dept designation email mobile image');
    res.json({ success: true, faculty: facultyList });
  } catch (error) {
    console.error('Error fetching all faculty:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch faculty', error: error.message });
  }
};
