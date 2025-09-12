import StudentDetails from "../../models/studentDetails.js";
// import Administrator from "../../models/administrator.js";

const student_Dashboard_Details = async (req, res) => {
  try {
    const { studentid } = req.user; // ⚡ use JWT instead of req.body

    if (!studentid) {
      return res.status(400).json({ message: "Student Id is required" });
    }

    // Find student by ID
    const student = await StudentDetails.findOne({ studentid });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Count fields
    const counts = {
      certificationsCount: student.certifications?.length || 0,
      workshopsCount: student.workshops?.length || 0,
      clubsJoinedCount: student.clubsJoined?.length || 0,
      pendingApprovalsCount: student.pendingApprovals?.length || 0,
    };

    // Latest 8 announcements from administrator
    // const adminData = await Administrator.findOne().sort({ createdAt: -1 });
    // let latestAnnouncements = [];
    // if (adminData && adminData.announcements) {
    //   latestAnnouncements = adminData.announcements
    //     .slice(-8)
    //     .reverse();
    // }

    // Latest 6 pending approvals
    const latestPendingApprovals = (student.pendingApprovals || [])
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
      },
      counts,
      // announcements: latestAnnouncements,
      pendingApprovals: latestPendingApprovals, // ⚡ new field
    });
  } catch (error) {
    console.error("Error fetching student dashboard details:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export default student_Dashboard_Details;
