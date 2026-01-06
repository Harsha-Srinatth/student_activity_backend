import FacultyDetails from "../../models/faculty/facultyDetails.js";
import StudentDetails from "../../models/student/studentDetails.js";
import CollegeSchema from "../../models/shared/collegeSchema.js";

// Get faculty recent activities
const getFacultyActivities = async (req, res) => {
  try {
    const currentFacultyId = req.user.facultyid;
    
    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }

    const faculty = await FacultyDetails.findOne({ facultyid: currentFacultyId })
      .select('approvalsGiven')
      .lean();

    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    // Get last 30 recent activities (derived from approvalsGiven and leaveApprovalsGiven)
    const recentActivities = await FacultyDetails.getRecentActivities(currentFacultyId, 30);

    // Get last 10 approvals given (with null safety)
    // Normalize status: "verified" -> "approved" for backward compatibility
    let recentApprovals = (faculty.approvalsGiven || [])
      .map(a => ({
        ...a,
        status: a.status === 'verified' ? 'approved' : (a.status || 'approved'),
        approvedOn: a.approvedOn || a.reviewedOn || a.timestamp || a.date || new Date(),
      }))
      .sort((a, b) => new Date(b.approvedOn) - new Date(a.approvedOn))
      .slice(0, 10);

    // Backfill missing imageUrl/institution for approvals by reading from student records
    const missingData = recentApprovals.some(a => !a.imageUrl || !a.institution || !a.reviewedBy);
    if (missingData) {
      const studentIds = [...new Set(recentApprovals.map(a => a.studentid).filter(Boolean))];
      const students = await StudentDetails.find({ studentid: { $in: studentIds } })
        .select('studentid collegeId certifications workshops projects internships clubsJoined others')
        .lean();
      
      // Get college names for students
      const collegeIds = [...new Set(students.map(s => s.collegeId).filter(Boolean))];
      const colleges = await CollegeSchema.find({ collegeId: { $in: collegeIds } })
        .select('collegeId collegeName')
        .lean();
      const collegeMap = new Map(colleges.map(c => [c.collegeId, c.collegeName]));
      
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
            imageUrl = ws?.certificateUrl || ws?.imageUrl;
          } else if (type === 'project') {
            const pr = (stu.projects || []).find(p => p.title === description);
            imageUrl = pr?.imageUrl;
          } else if (type === 'internship') {
            const it = (stu.internships || []).find(i => `${i.organization} - ${i.role}` === description);
            imageUrl = it?.imageUrl || it?.recommendationUrl;
          } else if (type === 'club') {
            const club = (stu.clubsJoined || []).find(c => (c.title === description || c.clubName === description));
            imageUrl = club?.imageUrl;
          } else if (type === 'other') {
            const other = (stu.others || []).find(o => o.title === description);
            imageUrl = other?.imageUrl;
          }
        }
        
        // Get institution from college map
        let institution = a.institution;
        if (!institution && stu.collegeId) {
          institution = collegeMap.get(stu.collegeId) || null;
        }
        
        return {
          ...a,
          imageUrl: imageUrl || a.imageUrl,
          institution: institution || a.institution,
          reviewedBy: a.reviewedBy || undefined,
        };
      });
    }

    const response = {
      recentActivities: recentActivities.slice(0, 20), // Return last 20 for display
      recentApprovals,
      totalActivities: recentActivities.length,
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
      .select('approvalsGiven lastLogin')
      .lean();

    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    // Calculate metrics dynamically from approvals
    // Normalize status: "verified" -> "approved" for backward compatibility
    const approvals = (faculty.approvalsGiven || []).map(a => ({
      ...a,
      status: a.status === 'verified' ? 'approved' : (a.status || 'approved')
    }));
    const approvedCount = approvals.filter(a => a.status === 'approved').length;
    const rejectedCount = approvals.filter(a => a.status === 'rejected').length;
    const totalApprovals = approvedCount + rejectedCount;
    const approvalRate = totalApprovals > 0 ? Math.round((approvedCount / totalApprovals) * 100) : 0;
    
    // Calculate this week's activity
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeekApprovals = approvals.filter(a => 
      new Date(a.approvedOn) > oneWeekAgo
    ).length;

    const metrics = {
      performance: {
        approvalRate,
        thisWeekActivity: thisWeekApprovals,
        approvedCount,
        rejectedCount,
        totalApprovals,
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

