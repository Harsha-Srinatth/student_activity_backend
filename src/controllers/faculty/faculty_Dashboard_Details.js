import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";

const faculty_Dashboard_Details = async (req, res) => {
  try {
    const currentFacultyId = req.user.facultyid;
    
    if (!currentFacultyId) {
      return res.status(401).json({ error: 'Faculty ID not found in token' });
    }

    // Get faculty information and update last login in a single query
    const faculty = await FacultyDetails.findOneAndUpdate(
      { facultyid: currentFacultyId },
      { lastLogin: new Date() },
      { 
        new: true, // Return updated document
        select: 'fullname facultyid institution dept designation approvalsCount lastLogin email mobile username dateofjoin image'
      }
    );

    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    // Calculate statistics dynamically (always fresh)
    const dashboardStats = await calculateFacultyStats(currentFacultyId);

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
      lastUpdated: new Date()
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
        
        // Pending approvals count - from verification status in all achievement types
        pendingApprovals: [
          {
            $project: {
              allItems: {
                $concatArrays: [
                  { $map: { input: { $ifNull: ["$certifications", []] }, as: "c", in: { type: "certificate", status: { $ifNull: ["$$c.verification.status", "pending"] } } } },
                  { $map: { input: { $ifNull: ["$workshops", []] }, as: "w", in: { type: "workshop", status: { $ifNull: ["$$w.verification.status", "pending"] } } } },
                  { $map: { input: { $ifNull: ["$clubsJoined", []] }, as: "c", in: { type: "club", status: { $ifNull: ["$$c.verification.status", "pending"] } } } },
                  { $map: { input: { $ifNull: ["$internships", []] }, as: "i", in: { type: "internship", status: { $ifNull: ["$$i.verification.status", "pending"] } } } },
                  { $map: { input: { $ifNull: ["$projects", []] }, as: "p", in: { type: "project", status: { $ifNull: ["$$p.verification.status", "pending"] } } } },
                  { $map: { input: { $ifNull: ["$others", []] }, as: "o", in: { type: "other", status: { $ifNull: ["$$o.verification.status", "pending"] } } } }
                ]
              }
            }
          },
          { $unwind: "$allItems" },
          { $match: { "allItems.status": { $in: ["pending", null] } } },
          { $count: "count" }
        ],
        
        // Approved certifications count (approved status, including legacy 'verified')
        approvedCertifications: [
          { $unwind: { path: "$certifications", preserveNullAndEmptyArrays: true } },
          { 
            $match: { 
              "certifications.verification.status": { $in: ["approved", "verified"] }
            } 
          },
          { $count: "count" }
        ],
        
        // Approved workshops count (approved status, including legacy 'verified')
        approvedWorkshops: [
          { $unwind: { path: "$workshops", preserveNullAndEmptyArrays: true } },
          { 
            $match: { 
              "workshops.verification.status": { $in: ["approved", "verified"] }
            } 
          },
          { $count: "count" }
        ],
        
        // Approved clubs count (approved status, including legacy 'verified')
        approvedClubs: [
          { $unwind: { path: "$clubsJoined", preserveNullAndEmptyArrays: true } },
          { 
            $match: { 
              "clubsJoined.verification.status": { $in: ["approved", "verified"] }
            } 
          },
          { $count: "count" }
        ],
        
        // Total approvals count (all approved/verified + rejected)
        totalApprovals: [
          {
            $project: {
              allItems: {
                $concatArrays: [
                  { $map: { input: { $ifNull: ["$certifications", []] }, as: "c", in: { status: { $ifNull: ["$$c.verification.status", "pending"] } } } },
                  { $map: { input: { $ifNull: ["$workshops", []] }, as: "w", in: { status: { $ifNull: ["$$w.verification.status", "pending"] } } } },
                  { $map: { input: { $ifNull: ["$clubsJoined", []] }, as: "c", in: { status: { $ifNull: ["$$c.verification.status", "pending"] } } } },
                  { $map: { input: { $ifNull: ["$internships", []] }, as: "i", in: { status: { $ifNull: ["$$i.verification.status", "pending"] } } } },
                  { $map: { input: { $ifNull: ["$projects", []] }, as: "p", in: { status: { $ifNull: ["$$p.verification.status", "pending"] } } } },
                  { $map: { input: { $ifNull: ["$others", []] }, as: "o", in: { status: { $ifNull: ["$$o.verification.status", "pending"] } } } }
                ]
              }
            }
          },
          { $unwind: "$allItems" },
          { 
            $match: { 
              "allItems.status": { $in: ["approved", "verified", "rejected"] }
            } 
          },
          { $count: "count" }
        ],
        
        // Leave request statistics
        pendingLeaveRequests: [
          { $unwind: { path: "$leaveRequests", preserveNullAndEmptyArrays: true } },
          { $match: { "leaveRequests.status": "pending" } },
          { $count: "count" }
        ],
        approvedLeaveRequests: [
          { $unwind: { path: "$leaveRequests", preserveNullAndEmptyArrays: true } },
          { $match: { "leaveRequests.status": "approved" } },
          { $count: "count" }
        ],
        rejectedLeaveRequests: [
          { $unwind: { path: "$leaveRequests", preserveNullAndEmptyArrays: true } },
          { $match: { "leaveRequests.status": "rejected" } },
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
  const pendingLeaveRequests = result.pendingLeaveRequests[0]?.count || 0;
  const approvedLeaveRequests = result.approvedLeaveRequests[0]?.count || 0;
  const rejectedLeaveRequests = result.rejectedLeaveRequests[0]?.count || 0;
  
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
    pendingLeaveRequests,
    approvedLeaveRequests,
    rejectedLeaveRequests,
    lastUpdated: new Date()
  };
}

export default faculty_Dashboard_Details;