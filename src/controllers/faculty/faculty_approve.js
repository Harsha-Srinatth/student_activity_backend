import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";
import { saveApprovalToFaculty, buildApprovalData, getFacultyName } from "../../utils/facultyApprovalHelper.js";
import { calculateFacultyStats } from "./faculty_Dashboard_Details.js";
import { getMaxValues, computeWeightedPoints, updateMaxValuesIfNeeded } from "../../services/studentMaxValues.js";
import {
  emitApprovalUpdate,
  emitFacultyStatsUpdate,
  emitUserNotification,
  emitStudentDashboardDataUpdate
} from "../../utils/socketEmitter.js";

// Map approval type to student schema array name
const TYPE_TO_ARRAY = {
  certificate: 'certifications',
  workshop: 'workshops',
  club: 'clubsJoined',
  internship: 'internships',
  project: 'projects',
  other: 'others',
};

/** Find achievement by achievementId in the correct array; return the subdoc or null */
const findAchievementById = (student, type, achievementId) => {
  const arrayName = TYPE_TO_ARRAY[type];
  if (!arrayName || !student[arrayName]) return null;
  const idStr = String(achievementId);
  const item = student[arrayName].find(doc => doc._id && String(doc._id) === idStr);
  return item || null;
};

/** Apply approved points to student: co-curricular → coCurricularPoints, extra-curricular → extraCurricularPoints; project type also adds to projectsPoints */
const applyPointsToStudent = (student, type, categoryType, points) => {
  if (!points || points <= 0) return;
  const p = Number(points);
  if (type === 'project') {
    student.projectsPoints = (student.projectsPoints || 0) + p;
  }
  if (categoryType === 'co-curricular') {
    student.coCurricularPoints = (student.coCurricularPoints || 0) + p;
  } else if (categoryType === 'extra-curricular') {
    student.extraCurricularPoints = (student.extraCurricularPoints || 0) + p;
  } else {
    // academic or other: add to co-curricular as fallback
    student.coCurricularPoints = (student.coCurricularPoints || 0) + p;
  }
};

// Get all students with pending approvals for the current faculty
const getPendingApprovals = async (req, res) => {
  try {
    // Get the current faculty ID from the authenticated request
    const currentFacultyId = req.user.facultyid;

    if (!currentFacultyId) {
      return res.status(401).json({ error: "Faculty ID not found in token" });
    }

    // Fetch all students for this faculty
    const students = await StudentDetails.find({
      facultyid: currentFacultyId,
    }).select('fullname studentid email mobileno collegeId dept programName certifications workshops clubsJoined internships projects others facultyid').lean();

    // Build pendingApprovals from verification status in each achievement type
    const buildPendingApprovals = (student) => {
      const pendingApprovals = [];

      // Helper to normalize status: "verified" -> "approved", keep others as-is
      // If verification object doesn't exist or status is missing/null, treat as pending
      const normalizeStatus = (verification) => {
        if (!verification || !verification.status) return 'pending';
        const status = verification.status;
        if (status === 'pending') return 'pending';
        if (status === 'verified') return 'approved';
        if (status === 'approved' || status === 'rejected') return status;
        return 'pending'; // default to pending for unknown statuses
      };

      const toId = (doc) => (doc._id != null ? String(doc._id) : null);

      // Certifications
      (student.certifications || []).forEach((cert) => {
        const status = normalizeStatus(cert.verification);
        if (status === 'pending') {
          pendingApprovals.push({
            achievementId: toId(cert),
            type: 'certificate',
            certificateType: cert.type,
            description: cert.title,
            status: 'pending',
            imageUrl: cert.imageUrl,
            requestedOn: cert.dateIssued || new Date(),
          });
        }
      });

      // Workshops
      (student.workshops || []).forEach((workshop) => {
        const status = normalizeStatus(workshop.verification);
        if (status === 'pending') {
          pendingApprovals.push({
            achievementId: toId(workshop),
            type: 'workshop',
            workshopType: workshop.type,
            description: workshop.title,
            status: 'pending',
            imageUrl: workshop.certificateUrl || workshop.imageUrl,
            requestedOn: workshop.date || new Date(),
          });
        }
      });

      // Clubs
      (student.clubsJoined || []).forEach((club) => {
        const status = normalizeStatus(club.verification);
        if (status === 'pending') {
          pendingApprovals.push({
            achievementId: toId(club),
            type: 'club',
            clubType: club.type,
            description: club.title || club.clubName,
            status: 'pending',
            imageUrl: club.imageUrl,
            requestedOn: club.joinedOn || new Date(),
          });
        }
      });

      // Internships
      (student.internships || []).forEach((internship) => {
        const status = normalizeStatus(internship.verification);
        if (status === 'pending') {
          pendingApprovals.push({
            achievementId: toId(internship),
            type: 'internship',
            internshipType: internship.type,
            description: `${internship.organization} - ${internship.role}`,
            status: 'pending',
            imageUrl: internship.imageUrl,
            requestedOn: internship.startDate || new Date(),
          });
        }
      });

      // Projects
      (student.projects || []).forEach((project) => {
        const status = normalizeStatus(project.verification);
        if (status === 'pending') {
          pendingApprovals.push({
            achievementId: toId(project),
            type: 'project',
            projectType: project.type,
            description: project.title,
            status: 'pending',
            imageUrl: project.imageUrl,
            requestedOn: new Date(),
          });
        }
      });

      // Others
      (student.others || []).forEach((other) => {
        const status = normalizeStatus(other.verification);
        if (status === 'pending') {
          pendingApprovals.push({
            achievementId: toId(other),
            type: 'other',
            otherType: other.type,
            description: other.title,
            status: 'pending',
            imageUrl: other.imageUrl,
            requestedOn: other.createdAt || new Date(),
          });
        }
      });

      return pendingApprovals;
    };

    // Filter students who have pending approvals and enrich with pendingApprovals array
    const enriched = students
      .map((student) => {
        const pendingApprovals = buildPendingApprovals(student);
        return {
          ...student,
          pendingApprovals,
        };
      })
      .filter((student) => student.pendingApprovals.length > 0);

    return res.json(enriched);
  } catch (error) {
    console.error("Error fetching pending approvals:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Approve or reject a specific submission (use achievementId to identify the item)
const handleApproval = async (req, res) => {
  try {
    const { studentid } = req.params;
    const { action, message, type, achievementId, points } = req.body;
    const currentFacultyId = req.user.facultyid;

    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
    }
    if (!type || !TYPE_TO_ARRAY[type]) {
      return res.status(400).json({ message: 'Valid type is required (certificate, workshop, club, internship, project, other).' });
    }
    if (!achievementId) {
      return res.status(400).json({ message: 'achievementId is required to identify the submission.' });
    }
    // Points: required on approve, 0–50; ignored on reject
    const pointsVal = action === 'approve'
      ? (typeof points === 'number' ? points : Number(points))
      : 0;
    if (action === 'approve' && (Number.isNaN(pointsVal) || pointsVal < 0 || pointsVal > 50)) {
      return res.status(400).json({ message: 'Points must be a number between 0 and 50 when approving.' });
    }

    const student = await StudentDetails.findOne({
      studentid,
      facultyid: currentFacultyId,
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to your faculty' });
    }

    const achievement = findAchievementById(student, type, achievementId);
    if (!achievement) {
      return res.status(404).json({ message: 'Submission not found. Check achievementId and type.' });
    }
    if (achievement.verification?.status && achievement.verification.status !== 'pending') {
      return res.status(400).json({ message: 'This submission is already processed.' });
    }

    const facultyName = await getFacultyName(currentFacultyId);
    const status = action === 'approve' ? 'approved' : 'rejected';
    const verificationData = {
      verifiedBy: facultyName,
      date: new Date(),
      status,
      remarks: message || '',
      points: action === 'approve' ? pointsVal : 0,
    };

    achievement.verification = verificationData;

    if (action === 'approve' && pointsVal > 0) {
      const categoryType = achievement.type || 'co-curricular'; // co-curricular | extra-curricular | academic
      applyPointsToStudent(student, type, categoryType, pointsVal);
    }

    // Recompute weightedPoints when any of the 6 scoring fields change
    try {
      const maxValues = await getMaxValues();
      student.weightedPoints = computeWeightedPoints(student, maxValues);
    } catch (wpErr) {
      console.error("Error recomputing weightedPoints:", wpErr);
    }

    await student.save();

    try {
      await updateMaxValuesIfNeeded(student);
    } catch (maxErr) {
      console.error("Error updating max values cache:", maxErr);
    }
    // Refresh student from database to ensure we have the latest data
    // This ensures counts are calculated from the saved state
    const refreshedStudent = await StudentDetails.findOne({ studentid })
      .select('certifications workshops clubsJoined projects internships others')
      .lean();
    
    if (!refreshedStudent) {
      console.error('⚠️ Failed to refresh student after save, using in-memory student');
    }

    // Use refreshed student if available, otherwise use the saved student
    const studentForCounts = refreshedStudent || student.toObject();

    // Save approval to faculty using shared helper (includes points)
    try {
      const approvalData = await buildApprovalData(student, achievement, type, status, facultyName, message, pointsVal);
      await saveApprovalToFaculty(currentFacultyId, approvalData);
    } catch (facultyUpdateError) {
      console.error('Error updating faculty approvals:', facultyUpdateError.message);
    }

    const description = type === 'internship'
      ? `${achievement.organization} - ${achievement.role}`
      : (achievement.title || achievement.clubName || '');
    const approvalResponse = {
      type,
      description,
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewedOn: new Date(),
      reviewedBy: facultyName,
      message: message || '',
      points: action === 'approve' ? pointsVal : 0,
      imageUrl: achievement?.imageUrl || achievement?.certificateUrl,
    };

    // Emit real-time updates via Socket.IO
    try {
      // Use shared helper to calculate and emit dashboard updates
      // Pass already-fetched student data to avoid duplicate database query
      await emitStudentDashboardDataUpdate(studentid, { [studentid]: studentForCounts });
      
      // Also emit approval change notification with additional context
      emitApprovalUpdate(studentid, {
        // Send minimal change info instead of full arrays
        change: {
          type,
          description,
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewedBy: facultyName,
          reviewedOn: new Date(),
        },
      });

      // Emit notification to student
      emitUserNotification(studentid, {
        type: 'approval',
        title: `Submission ${action === 'approve' ? 'Approved' : 'Rejected'}`,
        message: `${type} "${description}" has been ${action === 'approve' ? 'approved' : 'rejected'} by ${facultyName}`,
        data: approvalResponse,
      });

      // Calculate and emit updated faculty stats in real-time
      try {
        // Calculate updated stats for the faculty using the same function as dashboard
        const facultyStats = await calculateFacultyStats(currentFacultyId);
        // Emit updated stats to faculty
        emitFacultyStatsUpdate(currentFacultyId, facultyStats);
      } catch (statsError) {
        console.error('Error calculating faculty stats:', statsError);
        // Fallback: just signal to refresh
        emitFacultyStatsUpdate(currentFacultyId, {
          pendingApprovals: null, // Signal to refresh
        });
      }
    } catch (socketError) {
      // Don't fail the request if socket emit fails
      console.error('Error emitting socket update:', socketError);
    } 
    const response = { 
      message: `Submission ${action}d successfully`,
      approval: approvalResponse
    };
    return res.json(response);

  } catch (error) {
      console.error('❌ Error handling approval:', error);
      console.error('Error stack:', error.stack);
    // Make sure we always send a response
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
  }
};

// Get detailed view of a specific student's submissions
const getStudentDetailsFrom = async (req, res) => {
  try {
    const { studentid } = req.params;
    const currentFacultyId = req.user.facultyid;

    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }

    const student = await StudentDetails.findOne({ 
      studentid, 
      facultyid: currentFacultyId // Ensure student belongs to current faculty
    }).select('fullname studentid email mobileno collegeId dept programName certifications workshops clubsJoined internships projects others facultyid').lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to your faculty' });
    }

    // Build pendingApprovals from verification status (same logic as getPendingApprovals)
    const normalizeStatus = (verification) => {
      if (!verification || !verification.status) return 'pending';
      const status = verification.status;
      if (status === 'pending') return 'pending';
      if (status === 'verified') return 'approved';
      if (status === 'approved' || status === 'rejected') return status;
      return 'pending';
    };

    const pendingApprovals = [];
    const toId = (doc) => (doc._id != null ? String(doc._id) : null);

    // Certifications
    (student.certifications || []).forEach((cert) => {
      const status = normalizeStatus(cert.verification);
      if (status === 'pending') {
        pendingApprovals.push({
          achievementId: toId(cert),
          type: 'certificate',
          description: cert.title,
          status: 'pending',
          imageUrl: cert.imageUrl,
          requestedOn: cert.dateIssued || new Date(),
        });
      }
    });

    // Workshops
    (student.workshops || []).forEach((workshop) => {
      const status = normalizeStatus(workshop.verification);
      if (status === 'pending') {
        pendingApprovals.push({
          achievementId: toId(workshop),
          type: 'workshop',
          description: workshop.title,
          status: 'pending',
          imageUrl: workshop.certificateUrl || workshop.imageUrl,
          requestedOn: workshop.date || new Date(),
        });
      }
    });

    // Clubs
    (student.clubsJoined || []).forEach((club) => {
      const status = normalizeStatus(club.verification);
      if (status === 'pending') {
        pendingApprovals.push({
          achievementId: toId(club),
          type: 'club',
          description: club.title || club.clubName,
          status: 'pending',
          imageUrl: club.imageUrl,
          requestedOn: club.joinedOn || new Date(),
        });
      }
    });

    // Internships
    (student.internships || []).forEach((internship) => {
      const status = normalizeStatus(internship.verification);
      if (status === 'pending') {
        pendingApprovals.push({
          achievementId: toId(internship),
          type: 'internship',
          description: `${internship.organization} - ${internship.role}`,
          status: 'pending',
          imageUrl: internship.imageUrl,
          requestedOn: internship.startDate || new Date(),
        });
      }
    });

    // Projects
    (student.projects || []).forEach((project) => {
      const status = normalizeStatus(project.verification);
      if (status === 'pending') {
        pendingApprovals.push({
          achievementId: toId(project),
          type: 'project',
          description: project.title,
          status: 'pending',
          imageUrl: project.imageUrl,
          requestedOn: new Date(),
        });
      }
    });

    // Others
    (student.others || []).forEach((other) => {
      const status = normalizeStatus(other.verification);
      if (status === 'pending') {
        pendingApprovals.push({
          achievementId: toId(other),
          type: 'other',
          description: other.title,
          status: 'pending',
          imageUrl: other.imageUrl,
          requestedOn: other.createdAt || new Date(),
        });
      }
    });

    res.json({
      ...student,
      pendingApprovals,
    });
  } catch (error) {
    console.error('Error fetching student details:', error);
    res.status(500).json({ error: error.message });
  }
};

// Bulk approve/reject multiple submissions (each item: { type, achievementId, points? })
const bulkApproval = async (req, res) => {
  try {
    const { studentid } = req.params;
    const { approvals, action, message } = req.body; // approvals: [{ type, achievementId, points? }, ...]
    const currentFacultyId = req.user.facultyid;

    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
    }
    if (!Array.isArray(approvals) || approvals.length === 0) {
      return res.status(400).json({ message: 'Approvals array is required. Each item should have { type, achievementId } and optionally points (0–50) when approving.' });
    }

    const student = await StudentDetails.findOne({
      studentid,
      facultyid: currentFacultyId,
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to your faculty' });
    }

    const facultyName = await getFacultyName(currentFacultyId);
    const status = action === 'approve' ? 'approved' : 'rejected';
    let updatedCount = 0;
    const approvalRecords = [];

    for (const item of approvals) {
      const { type, achievementId, points: itemPoints } = item;
      if (!type || !achievementId || !TYPE_TO_ARRAY[type]) continue;

      const achievement = findAchievementById(student, type, achievementId);
      if (!achievement || (achievement.verification?.status && achievement.verification.status !== 'pending')) continue;

      const pointsVal = action === 'approve'
        ? Math.min(50, Math.max(0, Number(itemPoints) || 0))
        : 0;

      achievement.verification = {
        verifiedBy: facultyName,
        date: new Date(),
        status,
        remarks: message || '',
        points: pointsVal,
      };

      if (action === 'approve' && pointsVal > 0) {
        const categoryType = achievement.type || 'co-curricular';
        applyPointsToStudent(student, type, categoryType, pointsVal);
      }

      updatedCount++;
      try {
        const approvalData = await buildApprovalData(student, achievement, type, status, facultyName, message, pointsVal);
        approvalRecords.push(approvalData);
      } catch (err) {
        console.warn('Could not build approval data for', type, achievementId, err.message);
      }
    }

    await student.save();

    // Refresh student from database to ensure we have the latest data
    const refreshedStudent = await StudentDetails.findOne({ studentid })
      .select('certifications workshops clubsJoined projects internships others')
      .lean();
    
    if (!refreshedStudent) {
      console.error('⚠️ Failed to refresh student after bulk save, using in-memory student');
    }

    // Use refreshed student if available, otherwise use the saved student
    const studentForCounts = refreshedStudent || student.toObject();

    // Save all approvals to faculty using helper
    if (approvalRecords.length > 0) {
      for (const approvalData of approvalRecords) {
        try {
          await saveApprovalToFaculty(currentFacultyId, approvalData);
        } catch (error) {
          console.error(`Failed to save approval for ${approvalData.type}: ${approvalData.description}`, error.message);
        }
      }
    }

    // Emit real-time updates via Socket.IO
    try {
      // Use centralized function to calculate and emit dashboard updates
      // This avoids code duplication and ensures consistency
      await emitStudentDashboardDataUpdate(studentid, { [studentid]: studentForCounts });
      
      // Calculate counts for approval update notification
      const certs = studentForCounts.certifications || [];
      const workshops = studentForCounts.workshops || [];
      const clubs = studentForCounts.clubsJoined || [];
      const projects = studentForCounts.projects || [];
      const internships = studentForCounts.internships || [];
      const others = studentForCounts.others || [];
      
      const pendingCount = certs.filter(c => c.verification?.status === 'pending').length +
                          workshops.filter(w => w.verification?.status === 'pending').length +
                          clubs.filter(c => c.verification?.status === 'pending').length +
                          projects.filter(p => p.verification?.status === 'pending').length +
                          internships.filter(i => i.verification?.status === 'pending').length +
                          others.filter(o => o.verification?.status === 'pending').length;
      
      const approvedCount = certs.filter(c => c.verification?.status === 'approved').length +
                           workshops.filter(w => w.verification?.status === 'approved').length +
                           clubs.filter(c => c.verification?.status === 'approved').length +
                           projects.filter(p => p.verification?.status === 'approved').length +
                           internships.filter(i => i.verification?.status === 'approved').length +
                           others.filter(o => o.verification?.status === 'approved').length;
      
      const rejectedCount = certs.filter(c => c.verification?.status === 'rejected').length +
                           workshops.filter(w => w.verification?.status === 'rejected').length +
                           clubs.filter(c => c.verification?.status === 'rejected').length +
                           projects.filter(p => p.verification?.status === 'rejected').length +
                           internships.filter(i => i.verification?.status === 'rejected').length +
                           others.filter(o => o.verification?.status === 'rejected').length;
      
      // Emit approval update notification
      emitApprovalUpdate(studentid, {
        counts: {
          pendingCount,
          approvedCount,
          rejectedCount,
        },
      });
      // Emit notification to student
      emitUserNotification(studentid, {
        type: 'approval',
        title: `Bulk ${action === 'approve' ? 'Approval' : 'Rejection'}`,
        message: `${updatedCount} submission(s) have been ${action === 'approve' ? 'approved' : 'rejected'} by ${facultyName}`,
      });

      // Calculate and emit updated faculty stats in real-time
      try {
        const facultyStats = await calculateFacultyStats(currentFacultyId);
        emitFacultyStatsUpdate(currentFacultyId, facultyStats);
      } catch (statsError) {
        console.error('Error calculating faculty stats:', statsError);
        // Fallback: just signal to refresh
        emitFacultyStatsUpdate(currentFacultyId, {
          pendingApprovals: null, // Signal to refresh
        });
      }
    } catch (socketError) {
      // Don't fail the request if socket emit fails
      console.error('Error emitting socket update:', socketError);
    }

    res.json({ 
      message: `${updatedCount} submission(s) ${action}d successfully`,
      updatedCount: updatedCount
    });

  } catch (error) {
    console.error('Error handling bulk approval:', error);
    res.status(500).json({ error: error.message });
  }
};

export { getPendingApprovals, handleApproval, getStudentDetailsFrom, bulkApproval };