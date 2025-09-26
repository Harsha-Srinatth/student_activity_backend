import StudentDetails from '../../models/studentDetails.js';
import FacultyDetails from '../../models/facultyDetails.js';

// Submit a new leave request
const studentReqForLeave = async (req, res) => {
  try {
    const studentid = req.user.studentid;
    const {
      leaveType,
      startDate,
      endDate,
      reason,
      priority = 'medium',
      emergencyContact,
      alternateAssessmentRequired = false
    } = req.body;

    // Validate required fields
    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Find student
    const student = await StudentDetails.findOne({ studentid });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Calculate total days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    // Validate dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be in the past'
      });
    }
    if (end < start) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    // Create new leave request with additional student info
    const newLeaveRequest = {
      leaveType,
      startDate: start,
      endDate: end,
      totalDays,
      reason,
      priority,
      emergencyContact: emergencyContact || {},
      alternateAssessmentRequired,
      status: 'pending',
      submittedAt: new Date(),

      // 🔑 attach student info
      dept: student.dept,
      section: student.section,
      semester: student.semester,
      email: student.email,
      phone: student.mobileno,
      facultyid: student.facultyid,
    };

    // Add to student's leave requests
    student.leaveRequests.push(newLeaveRequest);
    await student.save();

    // Update faculty stats
    await FacultyDetails.findOneAndUpdate(
      { facultyid: student.facultyid },
      {
        $inc: {
          'dashboardStats.pendingLeaveRequests': 1,
          'dashboardStats.totalLeaveRequests': 1
        },
        $set: { 'dashboardStats.lastUpdated': new Date() }
      }
    );

    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully',
      data: {
        leaveRequestId: newLeaveRequest._id,
        status: 'pending',
        submittedAt: newLeaveRequest.submittedAt
      }
    });
  } catch (error) {
    console.error('Error submitting leave request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit leave request',
      error: error.message
    });
  }
};

// Get student's leave requests
const studentLeaveRequests = async (req, res) => {
  try {
    const studentid = req.user.studentid;
    const { status, limit = 10, page = 1 } = req.query;

    const student = await StudentDetails.findOne({ studentid });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    let leaveRequests = student.leaveRequests || [];

    if (status && status !== 'all') {
      leaveRequests = leaveRequests.filter(request => request.status === status);
    }

    leaveRequests.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedRequests = leaveRequests.slice(startIndex, endIndex);

    const stats = {
      total: leaveRequests.length,
      pending: leaveRequests.filter(r => r.status === 'pending').length,
      approved: leaveRequests.filter(r => r.status === 'approved').length,
      rejected: leaveRequests.filter(r => r.status === 'rejected').length
    };

    res.json({
      success: true,
      data: {
        leaveRequests: paginatedRequests,
        stats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(leaveRequests.length / limit),
          totalItems: leaveRequests.length,
          hasNext: endIndex < leaveRequests.length,
          hasPrev: startIndex > 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leave requests',
      error: error.message
    });
  }
};

// Get specific leave request details
const getSpecificLeaveReqDetails = async (req, res) => {
  try {
    const studentid = req.user.studentid;
    const { requestId } = req.params;

    const student = await StudentDetails.findOne({ studentid });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const leaveRequest = student.leaveRequests.id(requestId);
    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    res.json({
      success: true,
      data: leaveRequest
    });
  } catch (error) {
    console.error('Error fetching leave request details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leave request details',
      error: error.message
    });
  }
};

export {
  studentReqForLeave,
  studentLeaveRequests,
  getSpecificLeaveReqDetails
};
