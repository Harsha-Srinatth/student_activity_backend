import StudentDetails from '../../models/studentDetails.js';
import FacultyDetails from '../../models/facultyDetails.js';

// Get all leave requests for faculty
export const getAllPendingLeaveReq = async (req, res) => {
  try {
    const  facultyid  = req.user.facultyid;
    const { status = 'all', limit = 20, page = 1, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;

    const students = await StudentDetails.find({ facultyid: facultyid });

    if (!students || students.length === 0) {
      return res.json({
        success: true,
        data: {
          leaveRequests: [],
          stats: { total: 0, pending: 0, approved: 0, rejected: 0 },
          pagination: { currentPage: 1, totalPages: 0, totalItems: 0 }
        }
      });
    }

    let allLeaveRequests = [];
    students.forEach(student => {
      if (student.leaveRequests?.length > 0) {
        student.leaveRequests.forEach(request => {
          allLeaveRequests.push({
            ...request.toObject(),
            studentId: student.studentid,
            studentName: student.fullname,
            studentEmail: student.email,
            studentPhone: student.mobileno,
            dept: student.dept,
            semester: student.semester,
            section: student.section
          });
        });
      }
    });

    if (status !== 'all') {
      allLeaveRequests = allLeaveRequests.filter(request => request.status === status);
    }

    allLeaveRequests.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      return sortOrder === 'desc' ? new Date(bValue) - new Date(aValue) : new Date(aValue) - new Date(bValue);
    });

    const stats = {
      total: allLeaveRequests.length,
      pending: allLeaveRequests.filter(r => r.status === 'pending').length,
      approved: allLeaveRequests.filter(r => r.status === 'approved').length,
      rejected: allLeaveRequests.filter(r => r.status === 'rejected').length
    };

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedRequests = allLeaveRequests.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        leaveRequests: paginatedRequests,
        stats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(allLeaveRequests.length / limit),
          totalItems: allLeaveRequests.length,
          hasNext: endIndex < allLeaveRequests.length,
          hasPrev: startIndex > 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching faculty leave requests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave requests', error: error.message });
  }
};

// Approve/Reject leave request
export const processLeaveReq = async (req, res) => {
  try {
    const  facultyid  = req.user.facultyid;
    const { studentid, requestId } = req.params;
    const { status, approvalRemarks } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be "approved" or "rejected"' });
    }

    const faculty = await FacultyDetails.findOne({ facultyid: facultyid });
    if (!faculty) return res.status(404).json({ success: false, message: 'Faculty not found' });

    const student = await StudentDetails.findOne({ studentid: studentid });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    if (student.facultyid !== facultyid) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Student does not belong to this faculty' });
    }

    const leaveRequest = student.leaveRequests.id(requestId);
    if (!leaveRequest) return res.status(404).json({ success: false, message: 'Leave request not found' });

    if (leaveRequest.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Leave request has already been ${leaveRequest.status}` });
    }

    leaveRequest.status = status;
    leaveRequest.reviewedBy = facultyid;
    leaveRequest.reviewedByName = faculty.fullname;
    leaveRequest.reviewedAt = new Date();
    leaveRequest.approvalRemarks = approvalRemarks || '';
    await student.save();

    faculty.leaveApprovalsGiven.push({
      studentid: studentid,
      studentName: student.fullname,
      leaveRequestId: requestId,
      leaveType: leaveRequest.leaveType,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
      totalDays: leaveRequest.totalDays,
      reason: leaveRequest.reason,
      priority: leaveRequest.priority,
      status,
      approvedOn: new Date(),
      reviewedBy: facultyid,
      approvalRemarks: approvalRemarks || ''
    });

    faculty.recentActivities.push({
      studentid: studentid,
      studentName: student.fullname,
      action: status,
      type: 'leave_request',
      description: `${status.charAt(0).toUpperCase() + status.slice(1)} ${leaveRequest.leaveType} leave request`,
      timestamp: new Date()
    });

    if (faculty.recentActivities.length > 50) {
      faculty.recentActivities = faculty.recentActivities.slice(-50);
    }

    const statsUpdate = {
      [`dashboardStats.${status}LeaveRequests`]: 1,
      'dashboardStats.pendingLeaveRequests': -1
    };

    await FacultyDetails.findOneAndUpdate(
      { facultyid: facultyid },
      { 
        $inc: statsUpdate,
        $set: { 
          'dashboardStats.lastUpdated': new Date(),
          leaveApprovalsGiven: faculty.leaveApprovalsGiven,
          recentActivities: faculty.recentActivities
        }
      }
    );

    res.json({
      success: true,
      message: `Leave request ${status} successfully`,
      data: {
        leaveRequestId: requestId,
        status,
        reviewedAt: leaveRequest.reviewedAt,
        reviewedBy: faculty.fullname,
        approvalRemarks
      }
    });
  } catch (error) {
    console.error('Error processing leave request:', error);
    res.status(500).json({ success: false, message: 'Failed to process leave request', error: error.message });
  }
};

// Faculty dashboard stats
export const getFacultyLeaveStats = async (req, res) => {
  try {
    const  facultyid  = req.user.facultyid;
    const faculty = await FacultyDetails.findOne({ facultyid: facultyid });
    if (!faculty) return res.status(404).json({ success: false, message: 'Faculty not found' });

    const students = await StudentDetails.find({ facultyid: facultyid });
    let totalLeaveRequests = 0, pendingLeaveRequests = 0, approvedLeaveRequests = 0, rejectedLeaveRequests = 0;

    students.forEach(student => {
      if (student.leaveRequests?.length > 0) {
        totalLeaveRequests += student.leaveRequests.length;
        pendingLeaveRequests += student.leaveRequests.filter(r => r.status === 'pending').length;
        approvedLeaveRequests += student.leaveRequests.filter(r => r.status === 'approved').length;
        rejectedLeaveRequests += student.leaveRequests.filter(r => r.status === 'rejected').length;
      }
    });

    const stats = {
      totalStudents: students.length,
      totalLeaveRequests,
      pendingLeaveRequests,
      approvedLeaveRequests,
      rejectedLeaveRequests,
      approvalRate: totalLeaveRequests > 0 ? Math.round((approvedLeaveRequests / totalLeaveRequests) * 100) : 0,
      recentActivities: faculty.recentActivities.slice(-10),
      lastUpdated: new Date()
    };

    await FacultyDetails.findOneAndUpdate(
      { facultyid: facultyid },
      { $set: { 'dashboardStats': stats, lastLogin: new Date() } }
    );

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats', error: error.message });
  }
};

// Faculty profile
export const getFacultyProfile = async (req, res) => {
  try {
    const  facultyid  = req.user.facultyid;
    const faculty = await FacultyDetails.findOne({ facultyid: facultyid }).select('-password');
    if (!faculty) return res.status(404).json({ success: false, message: 'Faculty not found' });
    res.json({ success: true, data: faculty });
  } catch (error) {
    console.error('Error fetching faculty profile:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch faculty profile', error: error.message });
  }
};
