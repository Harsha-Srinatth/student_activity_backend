import StudentDetails from "../../models/studentDetails.js";

// Get all students with pending approvals
const getPendingApprovals = async (req, res) => {
  try {
    const students = await StudentDetails.find({
      'pendingApprovals.0': { $exists: true },
      'pendingApprovals.status': 'pending'
    }).select('fullname studentid email institution dept programName pendingApprovals certifications workshops clubsJoined');

    // Filter students who actually have pending approvals
    const studentsWithPending = students.filter(student => 
      student.pendingApprovals.some(approval => approval.status === 'pending')
    );

    res.json(studentsWithPending);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: error.message });
  }
};

// Approve or reject a specific submission
const handleApproval = async (req, res) => {
  try {
    const { studentid, approvalId } = req.params;
    const { action, message } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
    }

    const student = await StudentDetails.findOne({ studentid });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
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
    student.pendingApprovals[approvalIndex].message = message || '';

    // If approved, ensure the submission is properly saved
    if (action === 'approve') {
      // The submission should already be saved in the respective array during upload
      // We just need to make sure it's marked as approved
      console.log(`Approved ${approval.type} submission: ${approval.description}`);
    }

    await student.save();

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
const getStudentDetails = async (req, res) => {
  try {
    const { studentid } = req.params;

    const student = await StudentDetails.findOne({ studentid })
      .select('fullname studentid email mobileno institution dept programName pendingApprovals certifications workshops clubsJoined');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
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

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
    }

    if (!Array.isArray(approvals) || approvals.length === 0) {
      return res.status(400).json({ message: 'Approvals array is required' });
    }

    const student = await StudentDetails.findOne({ studentid });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Update multiple approvals
    approvals.forEach(approvalId => {
      const approvalIndex = student.pendingApprovals.findIndex(
        approval => approval._id?.toString() === approvalId
      );

      if (approvalIndex !== -1) {
        student.pendingApprovals[approvalIndex].status = action === 'approve' ? 'approved' : 'rejected';
        student.pendingApprovals[approvalIndex].reviewedOn = new Date();
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

export { getPendingApprovals, handleApproval, getStudentDetails, bulkApproval };