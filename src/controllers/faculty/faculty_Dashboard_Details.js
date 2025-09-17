import StudentDetails from "../../models/studentDetails.js";
import FacultyDetails from "../../models/facultyDetails.js";

const faculty_Dashboard_Details = async (req, res) => {
  try {
    const currentFacultyId = req.user.facultyid;
    
    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }

    // Get faculty information with cached stats
    const faculty = await FacultyDetails.findOne({ facultyid: currentFacultyId })
      .select('fullname facultyid institution dept designation dashboardStats approvalsCount lastLogin email mobile username dateofjoin image');

    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    // Check if stats need refresh (refresh every 5 minutes)
    const now = new Date();
    const lastUpdate = faculty.dashboardStats?.lastUpdated || new Date(0);
    const timeDiff = (now - lastUpdate) / (1000 * 60); // minutes

    let dashboardStats;

    if (timeDiff > 5 || !faculty.dashboardStats?.totalStudents) {
      // Calculate fresh statistics
      dashboardStats = await calculateFacultyStats(currentFacultyId);
      
      // Update faculty stats in database
      await FacultyDetails.updateFacultyStats(currentFacultyId, dashboardStats);
    } else {
      // Use cached stats
      dashboardStats = faculty.dashboardStats;
    }

    // Update last login
    await FacultyDetails.findOneAndUpdate(
      { facultyid: currentFacultyId },
      { lastLogin: new Date() }
    );

    const response = {
      faculty: {
        facultyid: faculty.facultyid,
        fullname: faculty.fullname,
        institution: faculty.institution,
        dept: faculty.dept,
        designation: faculty.designation,
        email: faculty.email,
        mobile: faculty.mobile,
        username: faculty.username,
        dateofjoin: faculty.dateofjoin,
        image: faculty.image,
        lastLogin: faculty.lastLogin,
        approvalsCount: faculty.approvalsCount,
      },
      stats: dashboardStats,
      lastUpdated: dashboardStats.lastUpdated
    };

    res.json(response);

  } catch (error) {
    console.error('Error fetching faculty dashboard data:', error);
    res.status(500).json({ error: error.message });
  }
};

// Helper function to calculate faculty statistics efficiently
async function calculateFacultyStats(facultyId) {
  // Use aggregation pipeline for efficient counting
  const stats = await StudentDetails.aggregate([
    {
      $match: { facultyid: facultyId }
    },
    {
      $facet: {
        // Total students count
        totalStudents: [{ $count: "count" }],
        
        // Pending approvals count (ONLY pending status)
        pendingApprovals: [
          { $unwind: "$pendingApprovals" },
          { $match: { "pendingApprovals.status": "pending" } },
          { $count: "count" }
        ],
        
        // Approved certifications count (ONLY approved status)
        approvedCertifications: [
          { $unwind: "$pendingApprovals" },
          { 
            $match: { 
              "pendingApprovals.type": "certificate",
              "pendingApprovals.status": "approved" 
            } 
          },
          { $count: "count" }
        ],
        
        // Approved workshops count (ONLY approved status)
        approvedWorkshops: [
          { $unwind: "$pendingApprovals" },
          { 
            $match: { 
              "pendingApprovals.type": "workshop",
              "pendingApprovals.status": "approved" 
            } 
          },
          { $count: "count" }
        ],
        
        // Approved clubs count (ONLY approved status)
        approvedClubs: [
          { $unwind: "$pendingApprovals" },
          { 
            $match: { 
              "pendingApprovals.type": "club",
              "pendingApprovals.status": "approved" 
            } 
          },
          { $count: "count" }
        ],
        
        // Total approvals count (all approved + rejected)
        totalApprovals: [
          { $unwind: "$pendingApprovals" },
          { 
            $match: { 
              "pendingApprovals.status": { $in: ["approved", "rejected"] }
            } 
          },
          { $count: "count" }
        ]
      }
    }
  ]);

  const result = stats[0];
  
  // Extract counts with fallback to 0
  const totalStudents = result.totalStudents[0]?.count || 0;
  const pendingApprovals = result.pendingApprovals[0]?.count || 0;
  const approvedCertifications = result.approvedCertifications[0]?.count || 0;
  const approvedWorkshops = result.approvedWorkshops[0]?.count || 0;
  const approvedClubs = result.approvedClubs[0]?.count || 0;
  const totalApprovals = result.totalApprovals[0]?.count || 0;
  
  const totalApproved = approvedCertifications + approvedWorkshops + approvedClubs;
  const approvalRate = totalApprovals > 0 ? Math.round((totalApproved / totalApprovals) * 100) : 0;

  return {
    totalStudents,
    pendingApprovals,
    approvedCertifications,
    approvedWorkshops,
    approvedClubs,
    totalApproved,
    totalApprovals,
    approvalRate,
    lastUpdated: new Date()
  };
}

export default faculty_Dashboard_Details;