import mongoose from "mongoose";
import StudentDetails from "../../models/studentDetails.js";
import FacultyDetails from "../../models/facultyDetails.js";
// import Administrator from "../../models/administrator.js";

const student_Dashboard_Details = async (req, res) => {
  try {
    const { studentid } = req.user; // ⚡ from JWT

    if (!studentid) {
      return res.status(400).json({ message: "Student Id is required" });
    }

    // Use aggregation to calculate counts from pendingApprovals
    const result = await StudentDetails.aggregate([
      { $match: { studentid } },
      {
        $project: {
          studentid: 1,
          fullname: 1,
          email: 1,
          role: 1,
          semester: 1,
          dept: 1,
          programName: 1,
          certificationsCount: {
            $size: {
              $filter: {
                input: "$pendingApprovals",
                as: "item",
                cond: {
                  $and: [
                    { $eq: ["$$item.type", "certificate"] },
                    { $eq: ["$$item.status", "approved"] }
                  ]
                }
              }
            }
          },
          workshopsCount: {
            $size: {
              $filter: {
                input: "$pendingApprovals",
                as: "item",
                cond: {
                  $and: [
                    { $eq: ["$$item.type", "workshop"] },
                    { $eq: ["$$item.status", "approved"] }
                  ]
                }
              }
            }
          },
          clubsJoinedCount: {
            $size: {
              $filter: {
                input: "$pendingApprovals",
                as: "item",
                cond: {
                  $and: [
                    { $eq: ["$$item.type", "club"] },
                    { $eq: ["$$item.status", "approved"] }
                  ]
                }
              }
            }
          },
          approvedCount: {
            $size: {
              $filter: {
                input: "$pendingApprovals",
                as: "item",
                cond: { $eq: ["$$item.status", "approved"] }
              }
            }
          },
          rejectedCount: {
            $size: {
              $filter: {
                input: "$pendingApprovals",
                as: "item",
                cond: { $eq: ["$$item.status", "rejected"] }
              }
            }
          },
          pendingCount: {
            $size: {
              $filter: {
                input: "$pendingApprovals",
                as: "item",
                cond: { $eq: ["$$item.status", "pending"] }
              }
            }
          },
          pendingApprovals: 1
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    const student = result[0];

    // Fetch the full student document for image lookups
    const fullStudent = await StudentDetails.findOne({ studentid }).lean();

    // Prepare faculty name lookups (student's faculty and any reviewers in approvals)
    const facultyIds = new Set();
    if (fullStudent?.facultyid) facultyIds.add(fullStudent.facultyid);
    for (const appr of (fullStudent?.pendingApprovals || [])) {
      if (appr?.reviewedBy) facultyIds.add(appr.reviewedBy);
    }
    const facultyIdToName = new Map();
    if (facultyIds.size > 0) {
      const facs = await FacultyDetails.find({ facultyid: { $in: Array.from(facultyIds) } })
        .select('facultyid fullname')
        .lean();
      for (const f of (facs || [])) facultyIdToName.set(f.facultyid, f.fullname);
    }

    // Helper to get image/certificate URL for an approval
    function getApprovalImage(approval) {
      if (!fullStudent) return undefined;
      switch (approval.type) {
        case 'certificate': {
          const cert = (fullStudent.certifications || []).find(c => c.title === approval.description);
          return cert?.imageUrl;
        }
        case 'workshop': {
          const ws = (fullStudent.workshops || []).find(w => w.title === approval.description);
          return ws?.certificateUrl;
        }
        case 'club': {
          const club = (fullStudent.clubsJoined || []).find(c => c.name === approval.description);
          return club?.imageUrl;
        }
        case 'project': {
          const proj = (fullStudent.projects || []).find(p => p.title === approval.description);
          return proj?.imageUrl;
        }
        case 'internship': {
          const intern = (fullStudent.internships || []).find(i => `${i.organization} - ${i.role}` === approval.description);
          return intern?.imageUrl;
        }
        default:
          return undefined;
      }
    }

    // Attach image/certificate URL to each approval object
    function attachImageToApprovals(arr) {
      return (arr || []).map(a => ({
        ...a,
        imageUrl: getApprovalImage(a),
        reviewedByName: a.reviewedBy ? (facultyIdToName.get(a.reviewedBy) || undefined) : undefined,
      }));
    }

    // Latest 6 pending approvals
    const latestPendingApprovals = attachImageToApprovals(
      (student.pendingApprovals || [])
        .filter(item => item.status === "pending")
        .sort((a, b) => new Date(b.requestedOn) - new Date(a.requestedOn))
        .slice(0, 6)
    );

    // Latest 6 rejected approvals
    const latestRejectedApprovals = attachImageToApprovals(
      (student.pendingApprovals || [])
        .filter(item => item.status === "rejected")
        .sort((a, b) => new Date(b.requestedOn) - new Date(a.requestedOn))
        .slice(0, 6)
    );

    // Latest 6 approved approvals
    const latestApprovedApprovals = attachImageToApprovals(
      (student.pendingApprovals || [])
        .filter(item => item.status === "approved")
        .sort((a, b) => new Date(b.requestedOn) - new Date(a.requestedOn))
        .slice(0, 6)
    );

    return res.status(200).json({
      student: {
        studentid: student.studentid,
        fullname: student.fullname,
        email: student.email,
        role: student.role,
        semester: student.semester,
        dept: student.dept,
        programName: student.programName,
        faculty: fullStudent?.facultyid ? {
          facultyid: fullStudent.facultyid,
          fullname: facultyIdToName.get(fullStudent.facultyid) || undefined,
        } : undefined,
      },
      counts: {
        certificationsCount: student.certificationsCount,
        workshopsCount: student.workshopsCount,
        clubsJoinedCount: student.clubsJoinedCount,
        approvedCount: student.approvedCount,
        rejectedCount: student.rejectedCount,
        pendingCount: student.pendingCount,
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

// Handler to get ALL approvals for the student (not just 6)
export const getAllStudentApprovals = async (req, res) => {
  try {
    const { studentid } = req.user;
    if (!studentid) {
      return res.status(400).json({ message: "Student Id is required" });
    }
    const student = await StudentDetails.findOne({ studentid }).lean();
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }
    // Build faculty id -> name map for reviewedBy lookups
    const reviewerIds = Array.from(
      new Set(
        (student.pendingApprovals || [])
          .map(a => a.reviewedBy)
          .filter(Boolean)
      )
    );
    const facultyIdToName = new Map();
    if (reviewerIds.length > 0) {
      const reviewers = await FacultyDetails.find({ facultyid: { $in: reviewerIds } })
        .select('facultyid fullname')
        .lean();
      for (const f of (reviewers || [])) facultyIdToName.set(f.facultyid, f.fullname);
    }
    // Helper to get image/certificate URL for an approval
    function getApprovalImage(approval) {
      switch (approval.type) {
        case 'certificate': {
          const cert = (student.certifications || []).find(c => c.title === approval.description);
          return cert?.imageUrl;
        }
        case 'workshop': {
          const ws = (student.workshops || []).find(w => w.title === approval.description);
          return ws?.certificateUrl;
        }
        case 'club': {
          const club = (student.clubsJoined || []).find(c => c.name === approval.description);
          return club?.imageUrl;
        }
        case 'project': {
          const proj = (student.projects || []).find(p => p.title === approval.description);
          return proj?.imageUrl;
        }
        case 'internship': {
          const intern = (student.internships || []).find(i => `${i.organization} - ${i.role}` === approval.description);
          return intern?.imageUrl;
        }
        default:
          return undefined;
      }
    }
    function attachImageToApprovals(arr) {
      return (arr || []).map(a => ({
        ...a,
        imageUrl: getApprovalImage(a),
        reviewedByName: a.reviewedBy ? (facultyIdToName.get(a.reviewedBy) || undefined) : undefined,
      }));
    }
    const allPending = attachImageToApprovals((student.pendingApprovals || []).filter(a => a.status === 'pending'));
    const allRejected = attachImageToApprovals((student.pendingApprovals || []).filter(a => a.status === 'rejected'));
    const allApproved = attachImageToApprovals((student.pendingApprovals || []).filter(a => a.status === 'approved'));
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