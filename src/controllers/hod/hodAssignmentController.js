import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";
import HOD from "../../models/Hod/hodDetails.js";

/**
 * Get faculty members in HOD's department
 */
export const getDepartmentFaculty = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    
    // Get all faculty in HOD's specific department
    const faculty = await FacultyDetails.find({ 
      collegeId,
      dept: department 
    })
      .select("facultyid fullname email dept designation mobile sectionsAssigned")
      .sort("fullname")
      .lean();

    return res.status(200).json({
      success: true,
      data: faculty.map(f => ({
        id: f.facultyid,
        facultyid: f.facultyid, // Ensure facultyid is always included
        name: f.fullname,
        fullname: f.fullname,
        email: f.email,
        department_id: f.dept,
        designation: f.designation || null,
        phone: f.mobile || null,
        sectionsAssigned: f.sectionsAssigned || [], // Include assigned sections
        assignedSectionsCount: (f.sectionsAssigned || []).length,
      })),
    });
  } catch (error) {
    console.error("Get department faculty error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get students in HOD's department grouped by sections
 */
export const getDepartmentStudents = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    
    // Get students in HOD's specific department
    const students = await StudentDetails.find({ 
      collegeId,
      dept: department 
    })
      .select("studentid fullname email dept semester section")
      .sort("section semester fullname")
      .lean();

    return res.status(200).json({
      success: true,
      data: students.map(s => {
        const semester = parseInt(s.semester) || 1;
        const year = Math.ceil(semester / 2);
        return {
          id: s.studentid,
          studentid: s.studentid,
          name: s.fullname,
          fullname: s.fullname,
          email: s.email,
          roll_number: s.studentid,
          department_id: s.dept,
          semester: semester,
          year: year,
          yearLabel: year === 1 ? '1st Year' : year === 2 ? '2nd Year' : year === 3 ? '3rd Year' : '4th Year',
          section: s.section || s.semester || "A",
        };
      }),
    });
  } catch (error) {
    console.error("Get department students error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get existing faculty assignments
 */
export const getFacultyAssignments = async (req, res) => {
  try {
    const { facultyId } = req.query;
    const { collegeId, department } = req.user;
    
    if (!facultyId) {
      return res.status(400).json({ message: "Faculty ID is required" });
    }

    // Get faculty with their assigned sections
    const faculty = await FacultyDetails.findOne({
      facultyid: facultyId,
      collegeId,
      dept: department
    }).select("sectionsAssigned").lean();

    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    // Get students assigned to this faculty in HOD's department
    const students = await StudentDetails.find({ 
      facultyid: facultyId,
      collegeId,
      dept: department
    })
      .select("studentid section semester")
      .lean();

    // Get sections from faculty's sectionsAssigned
    const assignedSections = (faculty.sectionsAssigned || []).map(assignment => assignment.section);

    return res.status(200).json({
      success: true,
      facultyId: facultyId, // Include facultyId in response
      data: students.map(s => ({
        student_id: s.studentid,
        faculty_id: facultyId, // Ensure faculty_id is included
        facultyid: facultyId, // Also include as facultyid for consistency
        section: s.section || s.semester,
      })),
      assignedSections: assignedSections,
      sectionDetails: faculty.sectionsAssigned || [],
    });
  } catch (error) {
    console.error("Get faculty assignments error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Assign faculty to a section
 */
export const assignFacultyToSection = async (req, res) => {
  try {
    const { facultyId, section, assignmentType, notes } = req.body;
    const { collegeId, department } = req.user;

    if (!facultyId || !section) {
      return res.status(400).json({ message: "Faculty ID and section are required" });
    }

    if (!department) {
      return res.status(400).json({ message: "Department information is missing" });
    }

    // Get all students in the specified section within HOD's department
    const students = await StudentDetails.find({
      collegeId,
      dept: department,
      $or: [
        { section: section },
        { semester: section }
      ]
    }).select("studentid");

    if (students.length === 0) {
      return res.status(404).json({ message: "No students found in this section" });
    }

    // Verify faculty exists and belongs to the same department
    const faculty = await FacultyDetails.findOne({ 
      facultyid: facultyId,
      collegeId,
      dept: department 
    });

    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found in your department" });
    }

    // Update students' facultyid field
    const updateResult = await StudentDetails.updateMany(
      {
        collegeId,
        dept: department,
        $or: [
          { section: section },
          { semester: section }
        ]
      },
      {
        $set: { facultyid: facultyId }
      }
    );

    // Update faculty's sectionsAssigned array
    // Check if section is already assigned to this faculty
    const existingAssignmentIndex = faculty.sectionsAssigned.findIndex(
      (assignment) => assignment.section === section
    );

    const assignmentData = {
      section: section,
      assignmentType: assignmentType || "Mentor",
      notes: notes || null,
      assignedBy: req.user.hodId,
      assignedAt: new Date()
    };

    if (existingAssignmentIndex >= 0) {
      // Update existing assignment
      faculty.sectionsAssigned[existingAssignmentIndex] = assignmentData;
    } else {
      // Add new assignment
      faculty.sectionsAssigned.push(assignmentData);
    }

    await faculty.save();

    return res.status(200).json({
      success: true,
      message: `Successfully assigned faculty to ${updateResult.modifiedCount} students in section ${section}`,
      data: {
        facultyId: facultyId, // Include facultyId
        facultyid: facultyId, // Also include as facultyid for consistency
        section,
        assignmentType: assignmentType || "Mentor",
        notes: notes || null,
        studentsAssigned: updateResult.modifiedCount,
        facultyAssignmentUpdated: true,
      },
    });
  } catch (error) {
    console.error("Assign faculty to section error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get sections assigned to a faculty member
 */
export const getFacultySections = async (req, res) => {
  try {
    const { facultyId } = req.params;
    const { collegeId, department } = req.user;
    
    if (!facultyId) {
      return res.status(400).json({ message: "Faculty ID is required" });
    }

    // Get faculty with their assigned sections
    const faculty = await FacultyDetails.findOne({
      facultyid: facultyId,
      collegeId,
      dept: department
    }).select("sectionsAssigned");

    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    // Return sections from faculty's sectionsAssigned array
    const assignedSections = faculty.sectionsAssigned || [];

    // Also get sections from students for verification
    const studentSections = await StudentDetails.distinct("section", {
      facultyid: facultyId,
      collegeId,
      dept: department,
      section: { $exists: true, $ne: null }
    });

    const semesterSections = await StudentDetails.distinct("semester", {
      facultyid: facultyId,
      collegeId,
      dept: department,
      section: { $exists: false },
      semester: { $exists: true, $ne: null }
    });

    const allStudentSections = [...new Set([...studentSections, ...semesterSections])];

    return res.status(200).json({
      success: true,
      facultyId: facultyId, // Include facultyId in response
      facultyid: facultyId, // Also include as facultyid for consistency
      data: assignedSections.map(assignment => ({
        section: assignment.section,
        assignmentType: assignment.assignmentType,
        notes: assignment.notes,
        assignedAt: assignment.assignedAt,
        assignedBy: assignment.assignedBy,
      })),
      // Also include student-based sections for reference
      studentBasedSections: allStudentSections,
    });
  } catch (error) {
    console.error("Get faculty sections error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get HOD information
 */
export const getHODInfo = async (req, res) => {
  try {
    const { hodId } = req.user;

    if (!hodId) {
      return res.status(400).json({ message: "HOD ID is required" });
    }

    const hod = await HOD.findOne({ hodId: hodId })
      .select("hodId fullname email collegeId department")
      .lean();

    if (!hod) {
      return res.status(404).json({ message: "HOD not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        hod: {
          id: hod.hodId,
          hodId: hod.hodId,
          name: hod.fullname,
          fullname: hod.fullname,
          email: hod.email,
          collegeId: hod.collegeId,
          department: {
            name: hod.department,
            code: hod.department.toUpperCase().substring(0, 3),
          },
        },
      },
    });
  } catch (error) {
    console.error("Get HOD info error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

