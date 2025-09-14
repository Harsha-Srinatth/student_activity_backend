import StudentDetails from "../../models/studentDetails.js";

// Get all students with pending approvals for the current faculty
const getPendingApprovals = async (req, res) => {
  try {
    // Get the current faculty ID from the authenticated request
    const currentFacultyId = req.user.facultyid;

    if (!currentFacultyId) {
      return res.status(401).json({ error: "Faculty ID not found in token" });
    }

    const students = await StudentDetails.aggregate([
      {
        $match: {
          facultyid: currentFacultyId,
          "pendingApprovals.status": "pending",
        },
      },
      {
        $project: {
          fullname: 1,
          studentid: 1,
          email: 1,
          institution: 1,
          dept: 1,
          programName: 1,
          certifications: 1,
          workshops: 1,
          clubsJoined: 1,
          internships: 1,
          projects: 1,
          facultyid: 1,
          pendingApprovals: {
            $filter: {
              input: "$pendingApprovals",
              as: "approval",
              cond: { $eq: ["$$approval.status", "pending"] },
            },
          },
        },
      },
    ]);

    res.json(students);
  } catch (error) {
    console.error("Error fetching pending approvals:", error);
    res.status(500).json({ error: error.message });
  }
};

// Approve or reject a specific submission
const handleApproval = async (req, res) => {
  try {
    const { studentid, approvalId } = req.params;
    const { action, message } = req.body;
    const currentFacultyId = req.user.facultyid;

    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
    }

    const student = await StudentDetails.findOne({ 
      studentid,
      facultyid: currentFacultyId // Ensure student belongs to current faculty
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to your faculty' });
    }

    // Find the pending approval
    const approvalIndex = student.pendingApprovals.findIndex(
      approval => approval._id?.toString() === approvalId || 
                 (approval.status === 'pending' && !approval._id)
    );

    if (approvalIndex === -1) {
      return res.status(404).json({ message: 'Pending approval not found' });
    }

    const approval = student.pendingApprovals[approvalIndex];
    
    // Update the approval status
    student.pendingApprovals[approvalIndex].status = action === 'approve' ? 'approved' : 'rejected';
    student.pendingApprovals[approvalIndex].reviewedOn = new Date();
    student.pendingApprovals[approvalIndex].reviewedBy = currentFacultyId; // or use faculty name if available
    student.pendingApprovals[approvalIndex].message = message || '';

    // If approved, ensure the submission is properly saved
    if (action === 'approve') {
      // The submission should already be saved in the respective array during upload
      // We just need to make sure it's marked as approved
      console.log(`Approved ${approval.type} submission: ${approval.description}`);
    }

    await student.save();

    // Update faculty statistics and track activity
    try {
      const FacultyDetails = (await import("../../models/facultyDetails.js")).default;
      
      // Record the approval in faculty's approvalsGiven array
      const approvalData = {
        studentid: student.studentid,
        studentName: student.fullname,
        type: approval.type,
        description: approval.description,
        status: action === 'approve' ? 'approved' : 'rejected',
        message: message || ''
      };

      await FacultyDetails.findOneAndUpdate(
        { facultyid: currentFacultyId },
        { 
          $push: { approvalsGiven: approvalData },
          $inc: { approvalsCount: 1 }
        }
      );

      // Add recent activity
      await FacultyDetails.findOneAndUpdate(
        { facultyid: currentFacultyId },
        { 
          $push: { 
            recentActivities: {
              studentid: student.studentid,
              studentName: student.fullname,
              action: action === 'approve' ? 'approved' : 'rejected',
              type: approval.type,
              description: approval.description,
              timestamp: new Date()
            }
          }
        }
      );

      // Invalidate cached stats to force refresh
      await FacultyDetails.findOneAndUpdate(
        { facultyid: currentFacultyId },
        { 
          $unset: { 
            'dashboardStats.totalStudents': 1,
            'dashboardStats.pendingApprovals': 1,
            'dashboardStats.approvedCertifications': 1,
            'dashboardStats.approvedWorkshops': 1,
            'dashboardStats.approvedClubs': 1
          }
        }
      );

    } catch (facultyUpdateError) {
      console.error('Error updating faculty statistics:', facultyUpdateError);
      // Don't fail the main operation if faculty stats update fails
    }

    res.json({ 
      message: `Submission ${action}d successfully`,
      approval: student.pendingApprovals[approvalIndex]
    });

  } catch (error) {
    console.error('Error handling approval:', error);
    res.status(500).json({ error: error.message });
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
    }).select('fullname studentid email mobileno institution dept programName pendingApprovals certifications workshops clubsJoined internships projects facultyid');

    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to your faculty' });
    }

    res.json(student);
  } catch (error) {
    console.error('Error fetching student details:', error);
    res.status(500).json({ error: error.message });
  }
};

// Bulk approve/reject multiple submissions
const bulkApproval = async (req, res) => {
  try {
    const { studentid } = req.params;
    const { approvals, action, message } = req.body;
    const currentFacultyId = req.user.facultyid;

    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
    }

    if (!Array.isArray(approvals) || approvals.length === 0) {
      return res.status(400).json({ message: 'Approvals array is required' });
    }

    const student = await StudentDetails.findOne({ 
      studentid,
      facultyid: currentFacultyId // Ensure student belongs to current faculty
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to your faculty' });
    }

    // Update multiple approvals
    approvals.forEach(approvalId => {
      const approvalIndex = student.pendingApprovals.findIndex(
        approval => approval._id?.toString() === approvalId
      );

      if (approvalIndex !== -1) {
        student.pendingApprovals[approvalIndex].status = action === 'approve' ? 'approved' : 'rejected';
        student.pendingApprovals[approvalIndex].reviewedOn = new Date();
        student.pendingApprovals[approvalIndex].reviewedBy = currentFacultyId; // or use faculty name if available
        student.pendingApprovals[approvalIndex].message = message || '';
      }
    });

    await student.save();

    res.json({ 
      message: `${approvals.length} submissions ${action}d successfully`,
      updatedCount: approvals.length
    });

  } catch (error) {
    console.error('Error handling bulk approval:', error);
    res.status(500).json({ error: error.message });
  }
};

export { getPendingApprovals, handleApproval, getStudentDetailsFrom, bulkApproval };