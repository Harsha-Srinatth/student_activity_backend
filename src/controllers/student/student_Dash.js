import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";

/**
 * Get student dashboard data
 * Optimized: Single query with aggregation, calculates counts from verification.status
 */
const student_Dashboard_Details = async (req, res) => {
  try {
    const { studentid } = req.user;

    if (!studentid) {
      return res.status(400).json({ message: "Student Id is required" });
    }

    // Single aggregation query to get all needed data
    const result = await StudentDetails.aggregate([
      { $match: { studentid } },
      {
        $lookup: {
          from: "colleges",
          localField: "collegeId",
          foreignField: "collegeId",
          as: "college"
        }
      },
      {
        $project: {
          // Student basic info
          studentid: 1,
          fullname: 1,
          email: 1,
          username: 1,
          mobileno: 1,
          role: 1,
          semester: 1,
          dept: 1,
          programName: 1,
          facultyid: 1,
          "image.url": 1,
          collegeName: {
            $let: {
              vars: { firstCollege: { $arrayElemAt: ["$college", 0] } },
              in: { $ifNull: ["$$firstCollege.collegeName", null] }
            }
          },
          // Calculate counts from verification.status
          certificationsCount: {
            $size: {
              $filter: {
                input: "$certifications",
                as: "cert",
                cond: { $eq: ["$$cert.verification.status", "approved"] }
              }
            }
          },
          workshopsCount: {
            $size: {
              $filter: {
                input: "$workshops",
                as: "ws",
                cond: { $eq: ["$$ws.verification.status", "approved"] }
              }
            }
          },
          clubsJoinedCount: { $size: { $ifNull: ["$clubsJoined", []] } },
          projectsCount: {
            $size: {
              $filter: {
                input: "$projects",
                as: "proj",
                cond: { $eq: ["$$proj.verification.status", "approved"] }
              }
            }
          },
          // Approval status counts (from all verifications)
          approvedCount: {
            $add: [
              { $size: { $filter: { input: "$certifications", as: "c", cond: { $eq: ["$$c.verification.status", "approved"] } } } },
              { $size: { $filter: { input: "$workshops", as: "w", cond: { $eq: ["$$w.verification.status", "approved"] } } } },
              { $size: { $filter: { input: "$projects", as: "p", cond: { $eq: ["$$p.verification.status", "approved"] } } } },
              { $size: { $filter: { input: "$internships", as: "i", cond: { $eq: ["$$i.verification.status", "approved"] } } } }
            ]
          },
          rejectedCount: {
            $add: [
              { $size: { $filter: { input: "$certifications", as: "c", cond: { $eq: ["$$c.verification.status", "rejected"] } } } },
              { $size: { $filter: { input: "$workshops", as: "w", cond: { $eq: ["$$w.verification.status", "rejected"] } } } },
              { $size: { $filter: { input: "$projects", as: "p", cond: { $eq: ["$$p.verification.status", "rejected"] } } } },
              { $size: { $filter: { input: "$internships", as: "i", cond: { $eq: ["$$i.verification.status", "rejected"] } } } }
            ]
          },
          pendingCount: {
            $add: [
              { $size: { $filter: { input: "$certifications", as: "c", cond: { $eq: ["$$c.verification.status", "pending"] } } } },
              { $size: { $filter: { input: "$workshops", as: "w", cond: { $eq: ["$$w.verification.status", "pending"] } } } },
              { $size: { $filter: { input: "$projects", as: "p", cond: { $eq: ["$$p.verification.status", "pending"] } } } },
              { $size: { $filter: { input: "$internships", as: "i", cond: { $eq: ["$$i.verification.status", "pending"] } } } }
            ]
          },
          // Get all achievement arrays for approvals
          certifications: 1,
          workshops: 1,
          projects: 1,
          internships: 1,
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    const student = result[0];

    // Build approvals from verification status (not from pendingApprovals which doesn't exist)
    const buildApprovals = (items, type) => {
      return items
        .map((item, index) => ({
          _id: item._id?.toString() || `${type}-${index}`,
          type,
          description: item.title || item.name || `${type} item`,
          status: item.verification?.status || "pending",
          reviewedBy: item.verification?.verifiedBy,
          reviewedOn: item.verification?.date,
          message: item.verification?.remarks,
          imageUrl: item.imageUrl || item.certificateUrl,
          requestedOn: item.dateIssued || item.date || item.joinedOn || new Date(),
        }))
        .sort((a, b) => new Date(b.requestedOn) - new Date(a.requestedOn));
    };

    // Get all approvals
    const allApprovals = [
      ...buildApprovals(student.certifications || [], "certificate"),
      ...buildApprovals(student.workshops || [], "workshop"),
      ...buildApprovals(student.projects || [], "project"),
      ...buildApprovals(student.internships || [], "internship"),
    ];

    // Collect unique faculty IDs for name lookup
    const facultyIds = new Set();
    if (student.facultyid) facultyIds.add(student.facultyid);
    allApprovals.forEach(approval => {
      if (approval.reviewedBy) facultyIds.add(approval.reviewedBy);
    });

    // Single faculty lookup
    const facultyNameMap = new Map();
    if (facultyIds.size > 0) {
      const facultyList = await FacultyDetails.find({ facultyid: { $in: Array.from(facultyIds) } })
        .select('facultyid fullname')
        .lean();
      facultyList.forEach(f => facultyNameMap.set(f.facultyid, f.fullname));
    }

    // Attach faculty names to approvals
    const enrichApprovals = (approvals) => {
      return approvals.map(a => ({
        ...a,
        reviewedByName: a.reviewedBy ? (facultyNameMap.get(a.reviewedBy) || undefined) : undefined,
      }));
    };

    // Get latest approvals by status (limit 6 each)
    const latestPendingApprovals = enrichApprovals(
      allApprovals.filter(a => a.status === "pending").slice(0, 6)
    );
    const latestRejectedApprovals = enrichApprovals(
      allApprovals.filter(a => a.status === "rejected").slice(0, 6)
    );
    const latestApprovedApprovals = enrichApprovals(
      allApprovals.filter(a => a.status === "approved").slice(0, 6)
    );

    return res.status(200).json({
      student: {
        studentid: student.studentid,
        fullname: student.fullname,
        email: student.email,
        username: student.username,
        mobileno: student.mobileno,
        role: student.role,
        semester: student.semester,
        dept: student.dept,
        programName: student.programName,
        collegeName: student.collegeName,
        profileImage: student.image?.url ? { url: student.image.url } : null,
        faculty: student.facultyid ? {
          facultyid: student.facultyid,
          fullname: facultyNameMap.get(student.facultyid) || undefined,
        } : undefined,
      },
      counts: {
        certificationsCount: student.certificationsCount || 0,
        workshopsCount: student.workshopsCount || 0,
        clubsJoinedCount: student.clubsJoinedCount || 0,
        projectsCount: student.projectsCount || 0,
        approvedCount: student.approvedCount || 0,
        rejectedCount: student.rejectedCount || 0,
        pendingCount: student.pendingCount || 0,
      },
      pendingApprovals: latestPendingApprovals,
      rejectedApprovals: latestRejectedApprovals,
      approvedApprovals: latestApprovedApprovals,
    });
  } catch (error) {
    console.error("Error fetching student dashboard details:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

/**
 * Get ALL approvals for the student (not just 6)
 * Optimized: Single query, builds from verification status
 */
export const getAllStudentApprovals = async (req, res) => {
  try {
    const { studentid } = req.user;
    if (!studentid) {
      return res.status(400).json({ message: "Student Id is required" });
    }

    // Single query to get all achievement data
    const student = await StudentDetails.findOne({ studentid })
      .select('certifications workshops projects internships facultyid')
      .lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Build approvals from verification status
    const buildApprovals = (items, type) => {
      return (items || []).map((item, index) => ({
        _id: item._id?.toString() || `${type}-${index}`,
        type,
        description: item.title || item.name || `${type} item`,
        status: item.verification?.status || "pending",
        reviewedBy: item.verification?.verifiedBy,
        reviewedOn: item.verification?.date,
        message: item.verification?.remarks,
        imageUrl: item.imageUrl || item.certificateUrl,
        requestedOn: item.dateIssued || item.date || item.joinedOn || new Date(),
      }));
    };

    const allApprovals = [
      ...buildApprovals(student.certifications, "certificate"),
      ...buildApprovals(student.workshops, "workshop"),
      ...buildApprovals(student.projects, "project"),
      ...buildApprovals(student.internships, "internship"),
    ];

    // Collect faculty IDs
    const facultyIds = new Set();
    if (student.facultyid) facultyIds.add(student.facultyid);
    allApprovals.forEach(a => { if (a.reviewedBy) facultyIds.add(a.reviewedBy); });

    // Single faculty lookup
    const facultyNameMap = new Map();
    if (facultyIds.size > 0) {
      const facultyList = await FacultyDetails.find({ facultyid: { $in: Array.from(facultyIds) } })
        .select('facultyid fullname')
        .lean();
      facultyList.forEach(f => facultyNameMap.set(f.facultyid, f.fullname));
    }

    // Enrich with faculty names
    const enrichApprovals = (approvals) => {
      return approvals.map(a => ({
        ...a,
        reviewedByName: a.reviewedBy ? (facultyNameMap.get(a.reviewedBy) || undefined) : undefined,
      }));
    };

    const allPending = enrichApprovals(allApprovals.filter(a => a.status === 'pending'));
    const allRejected = enrichApprovals(allApprovals.filter(a => a.status === 'rejected'));
    const allApproved = enrichApprovals(allApprovals.filter(a => a.status === 'approved'));

    return res.status(200).json({
      pendingApprovals: allPending,
      rejectedApprovals: allRejected,
      approvedApprovals: allApproved,
    });
  } catch (error) {
    console.error("Error fetching all student approvals:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export default student_Dashboard_Details;
