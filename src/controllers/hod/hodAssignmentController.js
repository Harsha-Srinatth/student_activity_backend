import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";
import HOD from "../../models/Hod/hodDetails.js";
import { 
  emitUserNotification, 
  emitFacultyStatsUpdate 
} from "../../utils/socketEmitter.js";
import { 
  emitToUsersIfConnected,
  emitHODUpdate 
} from "../../utils/realtimeUpdate.js";
import { calculateFacultyStats } from "../faculty/faculty_Dashboard_Details.js";
import { sendNotificationToFaculty, sendNotificationsToStudents } from "../../utils/firebaseNotification.js";

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
      .select("facultyid fullname email dept designation mobile sectionsAssigned subjects")
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
        subjects: f.subjects || [], // Include subjects array
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
 * Get students in HOD's department grouped by sections (programName)
 */
export const getDepartmentStudents = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    
    // Get students in HOD's specific department only
    const students = await StudentDetails.find({ 
      collegeId,
      dept: department // Filter by HOD's department
    })
      .select("studentid fullname email dept semester programName")
      .sort("programName semester fullname")
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
          section: s.programName || "UNASSIGNED", // Use programName as section identifier
          programName: s.programName || "UNASSIGNED",
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
      dept: department // Filter by HOD's department
    })
      .select("studentid programName semester")
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
        section: s.programName || "UNASSIGNED", // Use programName as section
        programName: s.programName || "UNASSIGNED",
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

    // Get all students in the specified section (programName) within HOD's department
    const students = await StudentDetails.find({
      collegeId,
      dept: department, // Filter by HOD's department
      programName: section // Use programName as section identifier
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

    // Update students' facultyid field (using programName as section)
    const updateResult = await StudentDetails.updateMany(
      {
        collegeId,
        dept: department, // Filter by HOD's department
        programName: section // Use programName as section identifier
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

    // Emit real-time updates
    try {
      const studentIds = students.map(s => s.studentid);
      
      // Notify faculty via socket
      emitUserNotification(facultyId, {
        type: 'faculty_assigned',
        title: 'New Section Assignment',
        message: `You have been assigned to section ${section} with ${updateResult.modifiedCount} students`,
        data: { section, studentsCount: updateResult.modifiedCount }
      });
      
      // FCM push notification to faculty
      try {
        await sendNotificationToFaculty(
          facultyId,
          "New Section Assignment 📚",
          `You have been assigned to section ${section} with ${updateResult.modifiedCount} students`,
          {
            type: "faculty_assigned",
            section: section,
            studentsCount: updateResult.modifiedCount,
            timestamp: new Date().toISOString(),
          }
        );
      } catch (notifError) {
        console.error(`Error sending push notification to faculty ${facultyId}:`, notifError);
      }
      
      // Update faculty stats
      const facultyStats = await calculateFacultyStats(facultyId);
      emitFacultyStatsUpdate(facultyId, facultyStats);
      
      // Notify all affected students via socket
      emitToUsersIfConnected(studentIds, 'faculty_assigned', {
        type: 'faculty_assigned',
        message: `Your faculty has been updated`,
        facultyId,
        section
      }, 'student'); // Role parameter required for array of userIds
      
      // FCM push notifications to students
      try {
        await sendNotificationsToStudents(
          studentIds,
          "Faculty Assignment Updated 👨‍🏫",
          `Your faculty mentor has been updated for section ${section}`,
          {
            type: "faculty_assigned",
            facultyId: facultyId,
            section: section,
            timestamp: new Date().toISOString(),
          }
        );
      } catch (notifError) {
        console.error('Error sending push notifications to students:', notifError);
      }
      
      // Update HOD dashboard stats
      emitHODUpdate(req.user.hodId, 'stats', { refresh: true });
    } catch (socketError) {
      console.error('Error emitting real-time updates:', socketError);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully assigned faculty to ${updateResult.modifiedCount} students in section ${section}`,
      data: {
        facultyId: facultyId,
        facultyid: facultyId,
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

    // Also get sections from students for verification (using programName)
    const studentSections = await StudentDetails.distinct("programName", {
      facultyid: facultyId,
      collegeId,
      dept: department, // Filter by HOD's department
      programName: { $exists: true, $ne: null }
    });

    const allStudentSections = studentSections.filter(s => s); // Remove null/undefined

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
 * Remove faculty assignment from a section
 */
export const removeFacultyAssignment = async (req, res) => {
  try {
    const { facultyId, section } = req.body;
    const { collegeId, department } = req.user;

    if (!facultyId || !section) {
      return res.status(400).json({ message: "Faculty ID and section are required" });
    }

    if (!department) {
      return res.status(400).json({ message: "Department information is missing" });
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

    // Remove assignment from faculty's sectionsAssigned array
    const assignmentIndex = faculty.sectionsAssigned.findIndex(
      (assignment) => assignment.section === section
    );

    if (assignmentIndex === -1) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    faculty.sectionsAssigned.splice(assignmentIndex, 1);
    await faculty.save();

    // Remove facultyid from students in this section (using programName as section)
    const updateResult = await StudentDetails.updateMany(
      {
        collegeId,
        dept: department, // Filter by HOD's department
        facultyid: facultyId,
        programName: section // Use programName as section identifier
      },
      {
        $unset: { facultyid: "" }
      }
    );

    return res.status(200).json({
      success: true,
      message: `Successfully removed faculty assignment from section ${section}`,
      data: {
        facultyId: facultyId,
        section,
        studentsUpdated: updateResult.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Remove faculty assignment error:", error);
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
      .select("hodId fullname email collegeId department fcmDevices")
      .lean();

    if (!hod) {
      return res.status(404).json({ message: "HOD not found" });
    }

    // Return first token from fcmDevices (or null if no tokens)
    const fcmToken = (hod.fcmDevices && hod.fcmDevices.length > 0) 
      ? hod.fcmDevices[0].token 
      : null;

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
          fcmToken: fcmToken,
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

