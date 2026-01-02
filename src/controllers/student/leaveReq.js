import StudentDetails from '../../models/studentDetails.js';

/**
 * Submit a new leave request
 * Optimized: Single query, validates before save
 */
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

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
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

    // Calculate total days
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    // Single query: find and update in one operation
    const student = await StudentDetails.findOneAndUpdate(
      { studentid },
      {
        $push: {
          leaveRequests: {
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
          }
        }
      },
      { new: true, select: 'leaveRequests' }
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get the newly added leave request (last one)
    const newLeaveRequest = student.leaveRequests[student.leaveRequests.length - 1];

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

/**
 * Get student's leave requests
 * Optimized: Single aggregation query with filtering and pagination
 */
const studentLeaveRequests = async (req, res) => {
  try {
    const studentid = req.user.studentid;
    const { status, limit = 10, page = 1 } = req.query;

    // Single aggregation query with filtering and pagination
    const pipeline = [
      { $match: { studentid } },
      { $unwind: { path: "$leaveRequests", preserveNullAndEmptyArrays: false } },
    ];

    // Add status filter if provided
    if (status && status !== 'all') {
      pipeline.push({ $match: { "leaveRequests.status": status } });
    }

    // Sort by submittedAt (newest first)
    pipeline.push({ $sort: { "leaveRequests.submittedAt": -1 } });

    // Group to get stats and all requests
    pipeline.push({
      $group: {
        _id: null,
        leaveRequests: { $push: "$leaveRequests" },
        total: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ["$leaveRequests.status", "pending"] }, 1, 0] }
        },
        approved: {
          $sum: { $cond: [{ $eq: ["$leaveRequests.status", "approved"] }, 1, 0] }
        },
        rejected: {
          $sum: { $cond: [{ $eq: ["$leaveRequests.status", "rejected"] }, 1, 0] }
        }
      }
    });

    const result = await StudentDetails.aggregate(pipeline);

    if (!result || result.length === 0) {
      return res.json({
        success: true,
        data: {
          leaveRequests: [],
          stats: { total: 0, pending: 0, approved: 0, rejected: 0 },
          pagination: { currentPage: 1, totalPages: 0, totalItems: 0, hasNext: false, hasPrev: false }
        }
      });
    }

    const data = result[0];
    const allRequests = data.leaveRequests || [];
    const totalItems = allRequests.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedRequests = allRequests.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        leaveRequests: paginatedRequests,
        stats: {
          total: data.total || 0,
          pending: data.pending || 0,
          approved: data.approved || 0,
          rejected: data.rejected || 0
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalItems / limit),
          totalItems,
          hasNext: endIndex < totalItems,
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

/**
 * Get specific leave request details
 * Optimized: Single query with projection
 */
const getSpecificLeaveReqDetails = async (req, res) => {
  try {
    const studentid = req.user.studentid;
    const { requestId } = req.params;

    // Single query with projection to get only the needed leave request
    const student = await StudentDetails.findOne(
      { studentid, "leaveRequests._id": requestId },
      { "leaveRequests.$": 1 }
    ).lean();

    if (!student || !student.leaveRequests || student.leaveRequests.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    res.json({
      success: true,
      data: student.leaveRequests[0]
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
