import ClubDetail from "../../models/shared/clubSchema.js";
import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";

/**
 * Create a new club
 */
export const createClub = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    const { clubName, description, amounttojoin, facultyCoordinator, studentHead } = req.body;

    if (!clubName || !description || amounttojoin === undefined) {
      return res.status(400).json({ 
        ok: false, 
        message: "Club name, description, and amount to join are required" 
      });
    }

    // Generate unique clubId
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const clubId = `CLUB-${timestamp}-${randomStr}`;

    // Get image URL from uploaded file
    const imageUrl = req.file?.path || req.file?.secure_url || "";

    if (!imageUrl) {
      return res.status(400).json({ 
        ok: false, 
        message: "Club image is required" 
      });
    }

    // Verify faculty coordinator exists in same department if provided
    if (facultyCoordinator) {
      const faculty = await FacultyDetails.findOne({ 
        facultyid: facultyCoordinator,
        collegeId,
        dept: department
      });
      if (!faculty) {
        return res.status(400).json({ 
          ok: false, 
          message: "Faculty coordinator not found in your department" 
        });
      }
    }

    // Verify student head exists in same department if provided
    if (studentHead) {
      const student = await StudentDetails.findOne({ 
        studentid: studentHead,
        collegeId,
        dept: department
      });
      if (!student) {
        return res.status(400).json({ 
          ok: false, 
          message: "Student head not found in your department" 
        });
      }
    }

    // Create club with initial members array
    const initialMembers = studentHead ? [{ studentid: studentHead }] : [];
    
    const club = new ClubDetail({
      collegeId,
      clubDepartment: department,
      clubId,
      clubName,
      description,
      imageUrl,
      amounttojoin: Number(amounttojoin),
      members: initialMembers,
      facultyCoordinator: facultyCoordinator || null,
      studentHead: studentHead || null,
    });

    await club.save();

    // If student head is assigned, add to clubEnrollments with role "head"
    if (studentHead) {
      await StudentDetails.findOneAndUpdate(
        { studentid: studentHead },
        {
          $addToSet: {
            clubEnrollments: {
              clubId,
              role: "head",
              joinedOn: new Date(),
              amountPaid: 0,
            }
          }
        }
      );
    }

    return res.status(201).json({
      ok: true,
      message: "Club created successfully",
      club,
    });
  } catch (err) {
    console.error("createClub error:", err);
    if (err.code === 11000) {
      return res.status(400).json({ 
        ok: false, 
        message: "Club ID already exists" 
      });
    }
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * Get all clubs for HOD's department
 */
export const getDepartmentClubs = async (req, res) => {
  try {
    const { collegeId, department } = req.user;

    const clubs = await ClubDetail.find({ 
      collegeId,
      clubDepartment: department 
    })
      .sort({ createdAt: -1 })
      .lean();

    // Populate faculty coordinator and student head details
    const clubsWithDetails = await Promise.all(
      clubs.map(async (club) => {
        let facultyCoordinatorDetails = null;
        let studentHeadDetails = null;

        if (club.facultyCoordinator) {
          const faculty = await FacultyDetails.findOne({ 
            facultyid: club.facultyCoordinator 
          })
            .select("facultyid fullname email")
            .lean();
          facultyCoordinatorDetails = faculty;
        }

        if (club.studentHead) {
          const student = await StudentDetails.findOne({ 
            studentid: club.studentHead 
          })
            .select("studentid fullname email")
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
      clubs: clubsWithDetails,
    });
  } catch (err) {
    console.error("getDepartmentClubs error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * Update club assignments (faculty coordinator and student head)
 */
export const updateClubAssignments = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    const { clubId } = req.params;
    const { facultyCoordinator, studentHead } = req.body;

    // Verify club exists and belongs to HOD's department
    const club = await ClubDetail.findOne({ 
      clubId,
      collegeId,
      clubDepartment: department 
    });

    if (!club) {
      return res.status(404).json({ 
        ok: false, 
        message: "Club not found or you don't have permission to modify it" 
      });
    }

    const updateData = {};

    // Update faculty coordinator if provided
    if (facultyCoordinator !== undefined) {
      if (facultyCoordinator) {
        const faculty = await FacultyDetails.findOne({ 
          facultyid: facultyCoordinator,
          collegeId,
          dept: department
        });
        if (!faculty) {
          return res.status(400).json({ 
            ok: false, 
            message: "Faculty coordinator not found in your department" 
          });
        }
      }
      updateData.facultyCoordinator = facultyCoordinator || null;
    }

    // Update student head if provided
    if (studentHead !== undefined) {
      // Remove old head from clubEnrollments if exists
      if (club.studentHead && club.studentHead !== studentHead) {
        await StudentDetails.findOneAndUpdate(
          { studentid: club.studentHead },
          {
            $pull: {
              clubEnrollments: { clubId, role: "head" }
            }
          }
        );
      }

      if (studentHead) {
        const student = await StudentDetails.findOne({ 
          studentid: studentHead,
          collegeId,
          dept: department
        });
        if (!student) {
          return res.status(400).json({ 
            ok: false, 
            message: "Student head not found in your department" 
          });
        }

        // Add new head to clubEnrollments
        await StudentDetails.findOneAndUpdate(
          { studentid: studentHead },
          {
            $pull: { clubEnrollments: { clubId } }, // Remove any existing enrollment
            $push: {
              clubEnrollments: {
                clubId,
                role: "head",
                joinedOn: new Date(),
                amountPaid: 0,
              }
            }
          }
        );

        // Add student to club members if not already present
        await ClubDetail.findOneAndUpdate(
          { clubId },
          { $addToSet: { members: { studentid: studentHead } } }
        );
      }
      updateData.studentHead = studentHead || null;
    }

    // Update club
    const updatedClub = await ClubDetail.findOneAndUpdate(
      { clubId },
      { $set: updateData },
      { new: true }
    ).lean();

    return res.json({
      ok: true,
      message: "Club assignments updated successfully",
      club: updatedClub,
    });
  } catch (err) {
    console.error("updateClubAssignments error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * Delete a club
 */
export const deleteClub = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    const { clubId } = req.params;

    const club = await ClubDetail.findOne({ 
      clubId,
      collegeId,
      clubDepartment: department 
    });

    if (!club) {
      return res.status(404).json({ 
        ok: false, 
        message: "Club not found or you don't have permission to delete it" 
      });
    }

    // Remove club from all students' clubEnrollments
    await StudentDetails.updateMany(
      {},
      { $pull: { clubEnrollments: { clubId } } }
    );

    await ClubDetail.deleteOne({ clubId });

    return res.json({
      ok: true,
      message: "Club deleted successfully",
    });
  } catch (err) {
    console.error("deleteClub error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * Search faculty by facultyId
 */
export const searchFaculty = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    const { facultyId } = req.query;

    if (!facultyId) {
      return res.status(400).json({ 
        ok: false, 
        message: "Faculty ID is required" 
      });
    }

    const faculty = await FacultyDetails.find({
      facultyid: { $regex: facultyId, $options: "i" },
      collegeId,
      dept: department,
    })
      .select("facultyid fullname email designation")
      .limit(10)
      .lean();

    return res.json({
      ok: true,
      faculty: faculty.map(f => ({
        facultyid: f.facultyid,
        fullname: f.fullname,
        email: f.email,
        designation: f.designation || "Faculty",
      })),
    });
  } catch (err) {
    console.error("searchFaculty error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * Search students by studentId
 */
export const searchStudents = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    const { studentId } = req.query;

    if (!studentId) {
      return res.status(400).json({ 
        ok: false, 
        message: "Student ID is required" 
      });
    }

    const students = await StudentDetails.find({
      studentid: { $regex: studentId, $options: "i" },
      collegeId,
      dept: department,
    })
      .select("studentid fullname email programName semester")
      .limit(10)
      .lean();

    return res.json({
      ok: true,
      students: students.map(s => ({
        studentid: s.studentid,
        fullname: s.fullname,
        email: s.email,
        programName: s.programName,
        semester: s.semester,
      })),
    });
  } catch (err) {
    console.error("searchStudents error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

