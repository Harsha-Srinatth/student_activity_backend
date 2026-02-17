import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";
import { saveApprovalToFaculty, buildApprovalData, getFacultyName } from "../../utils/facultyApprovalHelper.js";
import { calculateFacultyStats } from "./faculty_Dashboard_Details.js";
import { 
  emitApprovalUpdate, 
  emitStudentCountsUpdate, 
  emitFacultyPendingApprovalsUpdate,
  emitFacultyStatsUpdate,
  emitUserNotification,
  emitStudentDashboardDataUpdate
} from "../../utils/socketEmitter.js";

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

      // Certifications
      (student.certifications || []).forEach((cert) => {
        const status = normalizeStatus(cert.verification);
        if (status === 'pending') {
          pendingApprovals.push({
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
            type: 'other',
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

// Approve or reject a specific submission
const handleApproval = async (req, res) => {
  try {
    const { studentid } = req.params;
    const { action, message, type, description } = req.body;
    const currentFacultyId = req.user.facultyid;

    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
    }

    if (!type || !description) {
      return res.status(400).json({ message: 'Type and description are required.' });
    }

    const student = await StudentDetails.findOne({ 
      studentid,
      facultyid: currentFacultyId // Ensure student belongs to current faculty
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to your faculty' });
    }

    // Get faculty name
    const facultyName = await getFacultyName(currentFacultyId);

    // Find and update the achievement by type and description
    const status = action === 'approve' ? 'approved' : 'rejected';
    const verificationData = {
      verifiedBy: facultyName,
      date: new Date(),
      status: status,
      remarks: message || ''
    };

    // Helper to find and update achievement
    // IMPORTANT: Find the PENDING one, not just the first match (there may be duplicates)
    const findAndUpdateAchievement = () => {
      if (type === 'certificate') {  
        // Find the FIRST pending certificate with matching title
        const idx = student.certifications.findIndex(c => 
          c.title === description && 
          (!c.verification || c.verification.status === 'pending')
        );
        
        if (idx !== -1) {
          const cert = student.certifications[idx];
          const currentStatus = cert.verification?.status;
          student.certifications[idx].verification = verificationData;
          return student.certifications[idx];
        } else {
          // Check if certificate exists but is already processed
          const existingIdx = student.certifications.findIndex(c => c.title === description);
          if (existingIdx !== -1) {
            const existingStatus = student.certifications[existingIdx].verification?.status;
          } else {
          }
        }
      } else if (type === 'workshop') {
        // Find the FIRST pending workshop with matching title
        const idx = student.workshops.findIndex(w => 
          w.title === description && 
          (!w.verification || w.verification.status === 'pending')
        );
        if (idx !== -1) {
          student.workshops[idx].verification = verificationData;
          return student.workshops[idx];
        }
      } else if (type === 'club') {
        // Find the FIRST pending club with matching title
        const idx = student.clubsJoined.findIndex(c => 
          (c.title === description || c.clubName === description) && 
          (!c.verification || c.verification.status === 'pending')
        );
        if (idx !== -1) {
          student.clubsJoined[idx].verification = verificationData;
          return student.clubsJoined[idx];
        }
      } else if (type === 'internship') {
        // Find the FIRST pending internship with matching description
        const idx = student.internships.findIndex(i => 
          `${i.organization} - ${i.role}` === description && 
          (!i.verification || i.verification.status === 'pending')
        );
        if (idx !== -1) {
          student.internships[idx].verification = verificationData;
          return student.internships[idx];
        }
      } else if (type === 'project') {
        // Find the FIRST pending project with matching title
        const idx = student.projects.findIndex(p => 
          p.title === description && 
          (!p.verification || p.verification.status === 'pending')
        );
        if (idx !== -1) {
          student.projects[idx].verification = verificationData;
          return student.projects[idx];
        }
      } else if (type === 'other') {
        // Find the FIRST pending other achievement with matching title
        const idx = student.others.findIndex(o => 
          o.title === description && 
          (!o.verification || o.verification.status === 'pending')
        );
        if (idx !== -1) {
          student.others[idx].verification = verificationData;
          return student.others[idx];
        }
      }
      return null;
    };

    const achievement = findAndUpdateAchievement();
    if (!achievement) {
      return res.status(404).json({ message: 'Pending approval not found or already processed' });
    }
    await student.save();
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

    // Save approval to faculty using shared helper
    try {
      const approvalData = await buildApprovalData(student, achievement, type, status, facultyName, message);
      await saveApprovalToFaculty(currentFacultyId, approvalData);
    } catch (facultyUpdateError) {
      // Log error but don't fail the main operation - student is already saved
      console.error('Error updating faculty approvals:', facultyUpdateError.message);
    }

    // Build approval response object for consistency
    const approvalResponse = {
      type: type,
      description: description,
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewedOn: new Date(),
      reviewedBy: facultyName,
      message: message || '',
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

    // Certifications
    (student.certifications || []).forEach((cert) => {
      const status = normalizeStatus(cert.verification);
      if (status === 'pending') {
        pendingApprovals.push({
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

// Bulk approve/reject multiple submissions
const bulkApproval = async (req, res) => {
  try {
    const { studentid } = req.params;
    const { approvals, action, message } = req.body; // approvals: [{type, description}, ...]
    const currentFacultyId = req.user.facultyid;

    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
    }

    if (!Array.isArray(approvals) || approvals.length === 0) {
      return res.status(400).json({ message: 'Approvals array is required. Each approval should have {type, description}' });
    }

    const student = await StudentDetails.findOne({ 
      studentid,
      facultyid: currentFacultyId // Ensure student belongs to current faculty
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to your faculty' });
    }

    const facultyName = await getFacultyName(currentFacultyId);
    const status = action === 'approve' ? 'approved' : 'rejected';
    const verificationData = {
      verifiedBy: facultyName,
      date: new Date(),
      status: status,
      remarks: message || ''
    };

    let updatedCount = 0;
    const approvalRecords = [];

    // Helper to find and update achievement
    const findAndUpdateAchievement = (type, description) => {
      if (type === 'certificate') {
        const idx = student.certifications.findIndex(c => c.title === description);
        if (idx !== -1 && (!student.certifications[idx].verification || student.certifications[idx].verification.status === 'pending')) {
          student.certifications[idx].verification = verificationData;
          return student.certifications[idx];
        }
      } else if (type === 'workshop') {
        const idx = student.workshops.findIndex(w => w.title === description);
        if (idx !== -1 && (!student.workshops[idx].verification || student.workshops[idx].verification.status === 'pending')) {
          student.workshops[idx].verification = verificationData;
          return student.workshops[idx];
        }
      } else if (type === 'club') {
        const idx = student.clubsJoined.findIndex(c => (c.title === description || c.clubName === description));
        if (idx !== -1 && (!student.clubsJoined[idx].verification || student.clubsJoined[idx].verification.status === 'pending')) {
          student.clubsJoined[idx].verification = verificationData;
          return student.clubsJoined[idx];
        }
      } else if (type === 'internship') {
        const idx = student.internships.findIndex(i => `${i.organization} - ${i.role}` === description);
        if (idx !== -1 && (!student.internships[idx].verification || student.internships[idx].verification.status === 'pending')) {
          student.internships[idx].verification = verificationData;
          return student.internships[idx];
        }
      } else if (type === 'project') {
        const idx = student.projects.findIndex(p => p.title === description);
        if (idx !== -1 && (!student.projects[idx].verification || student.projects[idx].verification.status === 'pending')) {
          student.projects[idx].verification = verificationData;
          return student.projects[idx];
        }
      } else if (type === 'other') {
        const idx = student.others.findIndex(o => o.title === description);
        if (idx !== -1 && (!student.others[idx].verification || student.others[idx].verification.status === 'pending')) {
          student.others[idx].verification = verificationData;
          return student.others[idx];
        }
      }
      return null;
    };

    // Update multiple approvals
    for (const { type, description } of approvals) {
      if (!type || !description) continue;

      const achievement = findAndUpdateAchievement(type, description);
      if (achievement) {
        updatedCount++;
        try {
          const approvalData = await buildApprovalData(student, achievement, type, status, facultyName, message);
          approvalRecords.push(approvalData);
        } catch (error) {
          console.warn(`⚠️ Could not build approval data for ${type}: ${description}`, error.message);
        }
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