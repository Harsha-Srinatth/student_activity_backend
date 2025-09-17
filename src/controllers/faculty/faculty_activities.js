import FacultyDetails from "../../models/facultyDetails.js";
import StudentDetails from "../../models/studentDetails.js";

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
    let recentApprovals = (faculty.approvalsGiven || [])
      .map(a => ({
        ...a,
        approvedOn: a.approvedOn || a.reviewedOn || a.timestamp || a.date || new Date(),
      }))
      .sort((a, b) => new Date(b.approvedOn) - new Date(a.approvedOn))
      .slice(0, 10);

    // Backfill missing imageUrl/institution for approvals by reading from student records
    const missingData = recentApprovals.some(a => !a.imageUrl || !a.institution || !a.reviewedBy);
    if (missingData) {
      const studentIds = [...new Set(recentApprovals.map(a => a.studentid).filter(Boolean))];
      const students = await StudentDetails.find({ studentid: { $in: studentIds } })
        .select('studentid institution certifications workshops projects internships')
        .lean();
      const byId = new Map(students.map(s => [s.studentid, s]));
      recentApprovals = recentApprovals.map(a => {
        if (a.imageUrl && a.institution && a.reviewedBy) return a;
        const stu = byId.get(a.studentid);
        if (!stu) return a;
        let imageUrl = a.imageUrl;
        if (!imageUrl) {
          const { type, description } = a;
          if (type === 'certificate') {
            const cert = (stu.certifications || []).find(c => c.title === description);
            imageUrl = cert?.imageUrl;
          } else if (type === 'workshop') {
            const ws = (stu.workshops || []).find(w => w.title === description);
            imageUrl = ws?.certificateUrl;
          } else if (type === 'project') {
            const pr = (stu.projects || []).find(p => p.title === description);
            imageUrl = pr?.imageUrl;
          } else if (type === 'internship') {
            const it = (stu.internships || []).find(i => i.role === description || i.organization === description);
            imageUrl = it?.imageUrl || it?.recommendationUrl;
          }
        }
        return {
          ...a,
          imageUrl: imageUrl || a.imageUrl,
          institution: a.institution || stu.institution,
          reviewedBy: a.reviewedBy || undefined,
        };
      });
    }

    const response = {
      recentActivities,
      recentApprovals,
      totalActivities: faculty.recentActivities?.length || 0,
      totalApprovals: faculty.approvalsGiven?.length || 0
    };

    res.json(response);

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
