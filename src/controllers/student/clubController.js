import ClubDetail from "../../models/shared/clubSchema.js";
import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";

/**
 * GET all available clubs
 */
export const getAllClubs = async (req, res) => {
  try {
    const clubs = await ClubDetail.find({}).lean();
    
    // Populate faculty coordinator and student head details
    const clubsWithDetails = await Promise.all(
      clubs.map(async (club) => {
        let facultyCoordinatorDetails = null;
        let studentHeadDetails = null;

        if (club.facultyCoordinator) {
          const faculty = await FacultyDetails.findOne({ 
            facultyid: club.facultyCoordinator 
          })
            .select("facultyid fullname email designation")
            .lean();
          facultyCoordinatorDetails = faculty;
        }

        if (club.studentHead) {
          const student = await StudentDetails.findOne({ 
            studentid: club.studentHead 
          })
            .select("studentid fullname email programName semester")
            .lean();
          studentHeadDetails = student;
        }

        return {
          ...club,
          facultyCoordinatorDetails,
          studentHeadDetails,
          memberCount: club.members?.length || 0,
        };
      })
    );
    
    return res.json({
      ok: true,
      clubs: clubsWithDetails || []
    });
  } catch (err) {
    console.error("getAllClubs error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * GET club members by clubId
 * Returns only: studentid, fullname, role, mobileno (for fast retrieval)
 */
export const getClubMembers = async (req, res) => {
  try {
    const { clubId } = req.params;
    
    if (!clubId) {
      return res.status(400).json({ 
        ok: false, 
        message: "Club ID is required" 
      });
    }

    // Get club to find member studentids
    const club = await ClubDetail.findOne({ clubId }).lean();
    
    if (!club) {
      return res.status(404).json({ 
        ok: false, 
        message: "Club not found" 
      });
    }

    // Extract studentids from members array
    const studentIds = club.members?.map(m => m.studentid) || [];

    if (studentIds.length === 0) {
      return res.json({
        ok: true,
        members: []
      });
    }

    // Fetch only required fields: studentid, fullname, mobileno
    // Also get role from clubEnrollments
    const students = await StudentDetails.find(
      { studentid: { $in: studentIds } },
      { studentid: 1, fullname: 1, mobileno: 1, clubEnrollments: 1 }
    ).lean();

    // Map students with their role in this club
    const members = students.map(student => {
      const enrollment = student.clubEnrollments?.find(
        e => e.clubId === clubId
      );
      
      return {
        studentid: student.studentid,
        fullname: student.fullname,
        mobileno: student.mobileno,
        role: enrollment?.role || "member"
      };
    });

    // Define role priority order (lower number = higher priority)
    const rolePriority = {
      "president": 1,
      "vice-president": 2,
      "head": 3,
      "co-ordinator": 4,
      "secretary": 5,
      "member": 6,
      "other": 7
    };

    // Sort members by role priority
    const sortedMembers = members.sort((a, b) => {
      const priorityA = rolePriority[a.role] || 99;
      const priorityB = rolePriority[b.role] || 99;
      
      // If same priority, sort alphabetically by name
      if (priorityA === priorityB) {
        return (a.fullname || "").localeCompare(b.fullname || "");
      }
      
      return priorityA - priorityB;
    });

    return res.json({
      ok: true,
      members: sortedMembers
    });
  } catch (err) {
    console.error("getClubMembers error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

