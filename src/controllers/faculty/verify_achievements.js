import StudentDetails from "../../models/student/studentDetails.js";
import { saveApprovalToFaculty, buildApprovalData, getFacultyName } from "../../utils/facultyApprovalHelper.js";
import { 
  emitStudentDashboardDataUpdate,
  emitApprovalUpdate,
  emitUserNotification,
  emitFacultyStatsUpdate,
  emitFacultyPendingApprovalsUpdate
} from "../../utils/socketEmitter.js";
import { calculateFacultyStats } from "./faculty_Dashboard_Details.js";
import { sendNotificationToStudent, sendNotificationToFaculty } from "../../utils/firebaseNotification.js";

// Verify a specific achievement (certification, workshop, club, project)
const verifyAchievement = async (req, res) => {
  try {
    const { studentid, achievementType, achievementId } = req.params;
    const { status, remarks } = req.body; // status: 'approved' or 'rejected'
    const facultyId = req.user.facultyid;

    if (!facultyId) {
      return res.status(401).json({ error: "Faculty ID not found in token" });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
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

    // Record the approval in faculty's approvalsGiven array
    // Declare updatedStudent in broader scope so it can be used later
    let updatedStudent = null;
    try {
      // Re-fetch student to get updated achievement data
      updatedStudent = await StudentDetails.findOne({ studentid, facultyid: facultyId })
        .select('studentid fullname collegeId certifications workshops clubsJoined projects internships others')
        .lean();
      
      if (updatedStudent) {
        // Find the achievement that was just updated
        let achievement = null;
        const type = achievementType === 'certification' ? 'certificate' : achievementType;
        
        if (achievementType === 'certification') {
          achievement = (updatedStudent.certifications || []).find(c => c._id?.toString() === achievementId);
        } else if (achievementType === 'workshop') {
          achievement = (updatedStudent.workshops || []).find(w => w._id?.toString() === achievementId);
        } else if (achievementType === 'club') {
          achievement = (updatedStudent.clubsJoined || []).find(c => c._id?.toString() === achievementId);
        } else if (achievementType === 'project') {
          achievement = (updatedStudent.projects || []).find(p => p._id?.toString() === achievementId);
        }

        if (achievement) {
          const facultyName = await getFacultyName(facultyId);
          const approvalData = await buildApprovalData(
            updatedStudent,
            achievement,
            type,
            status,
            facultyName,
            remarks
          );
          await saveApprovalToFaculty(facultyId, approvalData);
        }
      }
    } catch (facultyUpdateError) {
      // Log error but don't fail the main operation - student is already saved
      console.error('Error updating faculty approvals:', facultyUpdateError.message);
    }

    // Emit real-time updates
    try {
      const facultyName = await getFacultyName(facultyId);
      
      // Update student dashboard in real-time
      await emitStudentDashboardDataUpdate(studentid);
      
      // Notify student via socket
      emitUserNotification(studentid, {
        type: 'achievement_verified',
        title: `Achievement ${status === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your ${achievementType} has been ${status} by ${facultyName}`,
        data: { achievementType, status, remarks }
      });

      // Send push notification to student
      try {
        const achievementTypeDisplay = achievementType === 'certification' ? 'certificate' : achievementType;
        await sendNotificationToStudent(
          studentid,
          status === 'approved' ? `Achievement Approved ✅` : `Achievement Rejected ❌`,
          `Your ${achievementTypeDisplay} has been ${status} by ${facultyName}${remarks ? `. Remarks: ${remarks}` : ''}`,
          {
            type: "achievement_verified",
            achievementType: achievementType,
            status: status,
            remarks: remarks || "",
            timestamp: new Date().toISOString(),
          }
        );
      } catch (notifError) {
        console.error(`Error sending push notification to student ${studentid}:`, notifError);
      }

      // Send notification to faculty about the action taken
      // Use student.fullname from the original fetch (line 29) - student is in scope here
      // If updatedStudent is available, prefer it, otherwise use original student
      try {
        // student is defined at line 29 and is in scope here
        // updatedStudent is now in scope (declared above)
        const studentName = (updatedStudent?.fullname) || student.fullname;
        await sendNotificationToFaculty(
          facultyId,
          "Action Completed ✓",
          `You ${status} ${studentName}'s ${achievementType === 'certification' ? 'certificate' : achievementType}`,
          {
            type: "approval_action",
            studentid: studentid,
            achievementType: achievementType,
            status: status,
            timestamp: new Date().toISOString(),
          }
        );
      } catch (notifError) {
        console.error(`Error sending push notification to faculty ${facultyId}:`, notifError);
      }
      
      // Update faculty stats and pending approvals
      const facultyStats = await calculateFacultyStats(facultyId);
      emitFacultyStatsUpdate(facultyId, facultyStats);
      
      // Refresh faculty pending approvals list
      const students = await StudentDetails.find({ facultyid: facultyId })
        .select('certifications workshops clubsJoined projects internships others')
        .lean();
      
      // Build pending approvals list
      const pendingApprovals = [];
      students.forEach(student => {
        const normalizeStatus = (v) => !v || !v.status || v.status === 'pending' ? 'pending' : v.status;
        [...(student.certifications || [])].forEach(c => {
          if (normalizeStatus(c.verification) === 'pending') {
            pendingApprovals.push({ studentid: student.studentid, type: 'certificate', description: c.title });
          }
        });
        // Similar for other types...
      });
      
      emitFacultyPendingApprovalsUpdate(facultyId, pendingApprovals);
    } catch (socketError) {
      console.error('Error emitting real-time updates:', socketError);
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
      approved: {
        certifications: (student.certifications || []).filter(cert => 
          cert.verification?.status === 'approved' || cert.verification?.status === 'verified'
        ),
        workshops: (student.workshops || []).filter(workshop => 
          workshop.verification?.status === 'approved' || workshop.verification?.status === 'verified'
        ),
        clubs: (student.clubsJoined || []).filter(club => 
          club.verification?.status === 'approved' || club.verification?.status === 'verified'
        ),
        projects: (student.projects || []).filter(project => 
          project.verification?.status === 'approved' || project.verification?.status === 'verified'
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
        status: appr.status === 'approved' ? 'approved' : 'rejected',
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
