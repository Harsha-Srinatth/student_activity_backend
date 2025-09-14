import mongoose from "mongoose";
import StudentDetails from "../../models/studentDetails.js";
// import Administrator from "../../models/administrator.js";

const student_Dashboard_Details = async (req, res) => {
  try {
    const { studentid } = req.user; // ⚡ from JWT

    if (!studentid) {
      return res.status(400).json({ message: "Student Id is required" });
    }

    // Use aggregation to calculate counts directly from pendingApprovals
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
          certificationsCount: {
            $size: {
              $filter: {
                input: "$pendingApprovals",
                as: "p",
                cond: {
                  $and: [
                    { $eq: ["$$p.type", "certificate"] },
                    { $eq: ["$$p.status", "approved"] }
                  ]
                }
              }
            }
          },
          workshopsCount: {
            $size: {
              $filter: {
                input: "$pendingApprovals",
                as: "p",
                cond: {
                  $and: [
                    { $eq: ["$$p.type", "workshop"] },
                    { $eq: ["$$p.status", "approved"] }
                  ]
                }
              }
            }
          },
          clubsJoinedCount: {
            $size: {
              $filter: {
                input: "$pendingApprovals",
                as: "p",
                cond: {
                  $and: [
                    { $eq: ["$$p.type", "club"] },
                    { $eq: ["$$p.status", "approved"] }
                  ]
                }
              }
            }
          },
          pendingApprovalsCount: {
            $size: {
              $filter: {
                input: "$pendingApprovals",
                as: "p",
                cond: { $eq: ["$$p.status", "pending"] }
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

    // Latest 6 pending approvals
    const latestPendingApprovals = (student.pendingApprovals || [])
      .filter(item => item.status === "pending")
      .sort((a, b) => new Date(b.requestedOn) - new Date(a.requestedOn))
      .slice(0, 6);

    // Latest 6 rejected approvals
    const latestRejectedApprovals = (student.pendingApprovals || [])
      .filter(item => item.status === "rejected")
      .sort((a, b) => new Date(b.requestedOn) - new Date(a.requestedOn))
      .slice(0, 6);

    return res.status(200).json({
      student: {
        studentid: student.studentid,
        fullname: student.fullname,
        email: student.email,
        role: student.role,
        semester: student.semester,
        dept: student.dept,
        programName:student.programName
      },
      counts: {
        certificationsCount: student.certificationsCount,
        workshopsCount: student.workshopsCount,
        clubsJoinedCount: student.clubsJoinedCount,
        pendingApprovalsCount: student.pendingApprovalsCount,
      },
      pendingApprovals: latestPendingApprovals,
      rejectedApprovals: latestRejectedApprovals,
    });
  } catch (error) {
    console.error("Error fetching student dashboard details:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export default student_Dashboard_Details;