import StudentDetails from "../../models/studentDetails.js";

// Verify a specific achievement (certification, workshop, club, project)
const verifyAchievement = async (req, res) => {
  try {
    const { studentid, achievementType, achievementId } = req.params;
    const { status, remarks } = req.body; // status: 'verified' or 'rejected'
    const facultyId = req.user.facultyid;

    if (!facultyId) {
      return res.status(401).json({ error: "Faculty ID not found in token" });
    }

    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Status must be 'verified' or 'rejected'" });
    }

    // Find the student
    const student = await StudentDetails.findOne({ studentid, facultyid: facultyId });
    if (!student) {
      return res.status(404).json({ error: "Student not found or not under your supervision" });
    }

    let updateQuery = {};
    const verificationData = {
      verifiedBy: facultyId,
      date: new Date(),
      status: status,
      remarks: remarks || ''
    };

    // Update the specific achievement based on type
    switch (achievementType) {
      case 'certification':
        updateQuery = {
          $set: {
            [`certifications.${achievementId}.verification`]: verificationData
          }
        };
        break;
      case 'workshop':
        updateQuery = {
          $set: {
            [`workshops.${achievementId}.verification`]: verificationData
          }
        };
        break;
      case 'club':
        updateQuery = {
          $set: {
            [`clubsJoined.${achievementId}.verification`]: verificationData
          }
        };
        break;
      case 'project':
        updateQuery = {
          $set: {
            [`projects.${achievementId}.verification`]: verificationData
          }
        };
        break;
      default:
        return res.status(400).json({ error: "Invalid achievement type" });
    }

    const result = await StudentDetails.updateOne(
      { studentid, facultyid: facultyId },
      updateQuery
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Achievement not found or already processed" });
    }

    res.json({
      success: true,
      message: `Achievement ${status} successfully`,
      verification: verificationData
    });

  } catch (error) {
    console.error("Error verifying achievement:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all achievements for a specific student (for faculty review)
const getStudentAchievementsForReview = async (req, res) => {
  try {
    const { studentid } = req.params;
    const facultyId = req.user.facultyid;

    if (!facultyId) {
      return res.status(401).json({ error: "Faculty ID not found in token" });
    }

    const student = await StudentDetails.findOne({ 
      studentid, 
      facultyid: facultyId 
    }).select('studentid fullname certifications workshops clubsJoined projects');

    if (!student) {
      return res.status(404).json({ error: "Student not found or not under your supervision" });
    }

    // Organize achievements by status
    const achievements = {
      pending: {
        certifications: (student.certifications || []).filter(cert => 
          !cert.verification || cert.verification.status === 'pending'
        ),
        workshops: (student.workshops || []).filter(workshop => 
          !workshop.verification || workshop.verification.status === 'pending'
        ),
        clubs: (student.clubsJoined || []).filter(club => 
          !club.verification || club.verification.status === 'pending'
        ),
        projects: (student.projects || []).filter(project => 
          !project.verification || project.verification.status === 'pending'
        )
      },
      verified: {
        certifications: (student.certifications || []).filter(cert => 
          cert.verification?.status === 'verified'
        ),
        workshops: (student.workshops || []).filter(workshop => 
          workshop.verification?.status === 'verified'
        ),
        clubs: (student.clubsJoined || []).filter(club => 
          club.verification?.status === 'verified'
        ),
        projects: (student.projects || []).filter(project => 
          project.verification?.status === 'verified'
        )
      },
      rejected: {
        certifications: (student.certifications || []).filter(cert => 
          cert.verification?.status === 'rejected'
        ),
        workshops: (student.workshops || []).filter(workshop => 
          workshop.verification?.status === 'rejected'
        ),
        clubs: (student.clubsJoined || []).filter(club => 
          club.verification?.status === 'rejected'
        ),
        projects: (student.projects || []).filter(project => 
          project.verification?.status === 'rejected'
        )
      }
    };

    res.json({
      success: true,
      student: {
        studentid: student.studentid,
        fullname: student.fullname
      },
      achievements
    });

  } catch (error) {
    console.error("Error fetching student achievements for review:", error);
    res.status(500).json({ error: error.message });
  }
};

// Bulk verify multiple achievements
const bulkVerifyAchievements = async (req, res) => {
  try {
    const { studentid } = req.params;
    const { achievements } = req.body; // Array of {type, id, status, remarks}
    const facultyId = req.user.facultyid;

    if (!facultyId) {
      return res.status(401).json({ error: "Faculty ID not found in token" });
    }

    const student = await StudentDetails.findOne({ studentid, facultyid: facultyId });
    if (!student) {
      return res.status(404).json({ error: "Student not found or not under your supervision" });
    }

    const updateOperations = [];
    const results = [];

    for (const achievement of achievements) {
      const verificationData = {
        verifiedBy: facultyId,
        date: new Date(),
        status: achievement.status,
        remarks: achievement.remarks || ''
      };

      const updateQuery = {
        $set: {
          [`${achievement.type}.${achievement.id}.verification`]: verificationData
        }
      };

      updateOperations.push(updateQuery);
      results.push({
        type: achievement.type,
        id: achievement.id,
        status: achievement.status
      });
    }

    // Execute all updates
    for (const operation of updateOperations) {
      await StudentDetails.updateOne(
        { studentid, facultyid: facultyId },
        operation
      );
    }

    res.json({
      success: true,
      message: `Bulk verification completed for ${results.length} achievements`,
      results
    });

  } catch (error) {
    console.error("Error in bulk verification:", error);
    res.status(500).json({ error: error.message });
  }
};

export { verifyAchievement, getStudentAchievementsForReview, bulkVerifyAchievements };
