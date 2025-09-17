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
    let arrayField = '';
    const verificationData = {
      verifiedBy: facultyId,
      date: new Date(),
      status: status,
      remarks: remarks || ''
    };

    // Update the specific achievement based on type
    switch (achievementType) {
      case 'certification':
        arrayField = 'certifications';
        updateQuery = {
          $set: {
            'certifications.$[elem].verification': verificationData
          }
        };
        break;
      case 'workshop':
        arrayField = 'workshops';
        updateQuery = {
          $set: {
            'workshops.$[elem].verification': verificationData
          }
        };
        break;
      case 'club':
        arrayField = 'clubsJoined';
        updateQuery = {
          $set: {
            'clubsJoined.$[elem].verification': verificationData
          }
        };
        break;
      case 'project':
        arrayField = 'projects';
        updateQuery = {
          $set: {
            'projects.$[elem].verification': verificationData
          }
        };
        break;
      default:
        return res.status(400).json({ error: "Invalid achievement type" });
    }

    let result = await StudentDetails.updateOne(
      { studentid, facultyid: facultyId },
      updateQuery,
      { arrayFilters: [{ 'elem._id': achievementId }] }
    );

    if (result.modifiedCount === 0) {
      // Fallback: treat achievementId as index if subdocuments lacked _id previously
      const asIndex = Number.isInteger(Number(achievementId)) ? Number(achievementId) : NaN;
      if (!Number.isNaN(asIndex)) {
        const pathMap = {
          certifications: `certifications.${asIndex}.verification`,
          workshops: `workshops.${asIndex}.verification`,
          clubsJoined: `clubsJoined.${asIndex}.verification`,
          projects: `projects.${asIndex}.verification`,
        };
        const path = pathMap[arrayField];
        if (path) {
          result = await StudentDetails.updateOne(
            { studentid, facultyid: facultyId },
            { $set: { [path]: verificationData } }
          );
        }
      }
    }

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

      let field = '';
      switch (achievement.type) {
        case 'certifications':
        case 'certification':
          field = 'certifications';
          break;
        case 'workshops':
        case 'workshop':
          field = 'workshops';
          break;
        case 'clubsJoined':
        case 'club':
          field = 'clubsJoined';
          break;
        case 'projects':
        case 'project':
          field = 'projects';
          break;
        default:
          continue;
      }

      updateOperations.push({
        update: {
          $set: { [`${field}.$[elem].verification`]: verificationData }
        },
        filter: { 'elem._id': achievement.id }
      });
      results.push({
        type: achievement.type,
        id: achievement.id,
        status: achievement.status
      });
    }

    // Execute all updates
    for (const operation of updateOperations) {
      let bulkResult = await StudentDetails.updateOne(
        { studentid, facultyid: facultyId },
        operation.update,
        { arrayFilters: [operation.filter] }
      );
      if (bulkResult.modifiedCount === 0) {
        // Fallback to index if id missing
        const idVal = operation.filter['elem._id'];
        const asIndex = Number.isInteger(Number(idVal)) ? Number(idVal) : NaN;
        if (!Number.isNaN(asIndex)) {
          const fieldName = Object.keys(operation.update.$set)[0].split('.$[')[0];
          const path = `${fieldName}.${asIndex}.verification`;
          bulkResult = await StudentDetails.updateOne(
            { studentid, facultyid: facultyId },
            { $set: { [path]: operation.update.$set[Object.keys(operation.update.$set)[0]] } }
          );
        }
      }
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

// Backfill: sync existing approved/rejected pendingApprovals into verification fields
const backfillStudentVerifications = async (req, res) => {
  try {
    const { studentid } = req.params;
    const facultyId = req.user.facultyid;

    if (!facultyId) {
      return res.status(401).json({ error: "Faculty ID not found in token" });
    }

    const student = await StudentDetails.findOne({ studentid, facultyid: facultyId });
    if (!student) {
      return res.status(404).json({ error: "Student not found or not under your supervision" });
    }

    let updated = 0;
    const approvals = student.pendingApprovals || [];
    for (const appr of approvals) {
      if (!['approved', 'rejected'].includes((appr.status || '').toLowerCase())) continue;
      const verificationData = {
        verifiedBy: appr.reviewedBy || facultyId,
        date: appr.reviewedOn || new Date(),
        status: appr.status === 'approved' ? 'verified' : 'rejected',
        remarks: appr.message || ''
      };
      if (appr.type === 'certificate') {
        const idx = student.certifications.findIndex(c => c.title === appr.description);
        if (idx !== -1) { student.certifications[idx].verification = verificationData; updated++; }
      } else if (appr.type === 'workshop') {
        const idx = student.workshops.findIndex(w => w.title === appr.description);
        if (idx !== -1) { student.workshops[idx].verification = verificationData; updated++; }
      } else if (appr.type === 'club') {
        const idx = student.clubsJoined.findIndex(c => c.name === appr.description);
        if (idx !== -1) { student.clubsJoined[idx].verification = verificationData; updated++; }
      } else if (appr.type === 'project') {
        const idx = student.projects.findIndex(p => p.title === appr.description);
        if (idx !== -1) { student.projects[idx].verification = verificationData; updated++; }
      }
    }

    await student.save();
    res.json({ success: true, updated });
  } catch (error) {
    console.error('Error in backfill verifications:', error);
    res.status(500).json({ error: error.message });
  }
};

export { verifyAchievement, getStudentAchievementsForReview, bulkVerifyAchievements, backfillStudentVerifications };
