import FacultyDetails from "../../models/facultyDetails.js";

// Get faculty recent activities
const getFacultyActivities = async (req, res) => {
  try {
    const currentFacultyId = req.user.facultyid;
    
    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }

    const faculty = await FacultyDetails.findOne({ facultyid: currentFacultyId })
      .select('recentActivities approvalsGiven')
      .lean();

    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    // Get last 20 recent activities, sorted by timestamp (with null safety)
    const recentActivities = (faculty.recentActivities || [])
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20);

    // Get last 10 approvals given (with null safety)
    const recentApprovals = (faculty.approvalsGiven || [])
      .sort((a, b) => new Date(b.approvedOn) - new Date(a.approvedOn))
      .slice(0, 10);

    res.json({
      recentActivities,
      recentApprovals,
      totalActivities: faculty.recentActivities?.length || 0,
      totalApprovals: faculty.approvalsGiven?.length || 0
    });

  } catch (error) {
    console.error('Error fetching faculty activities:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get faculty performance metrics
const getFacultyMetrics = async (req, res) => {
  try {
    const currentFacultyId = req.user.facultyid;
    
    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }

    const faculty = await FacultyDetails.findOne({ facultyid: currentFacultyId })
      .select('dashboardStats approvalsGiven averageApprovalTime totalHoursWorked lastLogin')
      .lean();

    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    // Calculate additional metrics
    const approvals = faculty.approvalsGiven || [];
    const approvedCount = approvals.filter(a => a.status === 'approved').length;
    const rejectedCount = approvals.filter(a => a.status === 'rejected').length;
    
    // Calculate average approval time (if we have timestamps)
    let avgApprovalTime = faculty.averageApprovalTime || 0;
    
    // Calculate this week's activity
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeekApprovals = approvals.filter(a => 
      new Date(a.approvedOn) > oneWeekAgo
    ).length;

    const metrics = {
      ...faculty.dashboardStats,
      performance: {
        approvalRate: faculty.dashboardStats?.approvalRate || 0,
        averageApprovalTime: avgApprovalTime,
        totalHoursWorked: faculty.totalHoursWorked || 0,
        thisWeekActivity: thisWeekApprovals,
        approvedCount,
        rejectedCount,
        lastLogin: faculty.lastLogin
      }
    };

    res.json(metrics);

  } catch (error) {
    console.error('Error fetching faculty metrics:', error);
    res.status(500).json({ error: error.message });
  }
};

export { getFacultyActivities, getFacultyMetrics };
