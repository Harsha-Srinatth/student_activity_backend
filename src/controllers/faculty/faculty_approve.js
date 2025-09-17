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

    // Enrich pending approvals with imageUrl/certificateUrl for quick access (especially clubs)
    const enriched = (students || []).map((s) => {
      const approvals = (s.pendingApprovals || []).map((a) => {
        let imageUrl;
        switch (a.type) {
          case 'certificate': {
            const cert = (s.certifications || []).find(c => c.title === a.description);
            imageUrl = cert?.imageUrl;
            break;
          }
          case 'workshop': {
            const ws = (s.workshops || []).find(w => w.title === a.description);
            imageUrl = ws?.certificateUrl;
            break;
          }
          case 'club': {
            const club = (s.clubsJoined || []).find(c => c.name === a.description);
            imageUrl = club?.imageUrl;
            break;
          }
          case 'project': {
            const proj = (s.projects || []).find(p => p.title === a.description);
            imageUrl = proj?.imageUrl;
            break;
          }
          case 'internship': {
            const intern = (s.internships || []).find(i => `${i.organization} - ${i.role}` === a.description);
            imageUrl = intern?.imageUrl;
            break;
          }
          default:
            imageUrl = undefined;
        }
        return { ...a, imageUrl };
      });
      return { ...s, pendingApprovals: approvals };
    });

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

    // Find the pending approval by type and description
    const approval = student.pendingApprovals.find(
      approval => approval.status === 'pending' &&
        approval.type === type &&
        approval.description === description
    );

    if (!approval) {
      return res.status(404).json({ message: 'Pending approval not found' });
    }

    // Load faculty name for display to students
    let facultyName = currentFacultyId;
    try {
      const FacultyDetailsForName = (await import("../../models/facultyDetails.js")).default;
      const fac = await FacultyDetailsForName.findOne({ facultyid: currentFacultyId }).select('fullname').lean();
      if (fac?.fullname) facultyName = fac.fullname;
    } catch (_) {}

    // Update the approval status
    approval.status = action === 'approve' ? 'approved' : 'rejected';
    approval.reviewedOn = new Date();
    approval.reviewedBy = facultyName; // store faculty name for UI
    approval.message = message || '';

    // Reflect verification status on the actual achievement entry
    const verificationData = {
      verifiedBy: facultyName,
      date: new Date(),
      status: action === 'approve' ? 'verified' : 'rejected',
      remarks: message || ''
    };
    if (type === 'certificate') {
      const idx = student.certifications.findIndex(c => c.title === description);
      if (idx !== -1) student.certifications[idx].verification = verificationData;
    } else if (type === 'workshop') {
      const idx = student.workshops.findIndex(w => w.title === description);
      if (idx !== -1) student.workshops[idx].verification = verificationData;
    } else if (type === 'club') {
      const idx = student.clubsJoined.findIndex(c => c.name === description);
      if (idx !== -1) student.clubsJoined[idx].verification = verificationData;
    } else if (type === 'internship') {
      const idx = student.internships.findIndex(i => `${i.organization} - ${i.role}` === description);
      if (idx !== -1) student.internships[idx].verification = verificationData;
    } else if (type === 'project') {
      const idx = student.projects.findIndex(p => p.title === description);
      if (idx !== -1) student.projects[idx].verification = verificationData;
    }

    await student.save();

    // Update faculty statistics and track activity
    try {
      const FacultyDetails = (await import("../../models/facultyDetails.js")).default;
      // Record the approval in faculty's approvalsGiven array
      let imageUrl;
      if (type === 'certificate') {
        const cert = (student.certifications || []).find(c => c.title === description);
        imageUrl = cert?.imageUrl;
      } else if (type === 'workshop') {
        const ws = (student.workshops || []).find(w => w.title === description);
        imageUrl = ws?.certificateUrl;
      } else if (type === 'project') {
        const pr = (student.projects || []).find(p => p.title === description);
        imageUrl = pr?.imageUrl;
      } else if (type === 'internship') {
        const it = (student.internships || []).find(i => i.role === description || i.organization === description);
        imageUrl = it?.imageUrl || it?.recommendationUrl;
      }

      const approvalData = {
        studentid: student.studentid,
        studentName: student.fullname,
        institution: student.institution,
        type: type,
        description: description,
        status: action === 'approve' ? 'approved' : 'rejected',
        approvedOn: new Date(),
        reviewedBy: facultyName,
        imageUrl: imageUrl,
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
              type: type,
              description: description,
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
      approval: approval
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