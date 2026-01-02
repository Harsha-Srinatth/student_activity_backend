import StudentDetails from "../../models/studentDetails.js";

/**
 * GET all clubs joined for logged in student
 * Optimized: Single query with projection
 */
const getClubsJoined = async (req, res) => {
  try {
    const { studentid } = req.user;
    if (!studentid) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    // Single query with projection - only fetch clubsJoined field
    const student = await StudentDetails.findOne(
      { studentid },
      { clubsJoined: 1 }
    ).lean();

    if (!student) {
      return res.status(404).json({ ok: false, message: "Student not found" });
    }

    return res.json({ 
      ok: true, 
      clubsJoined: student.clubsJoined || [] 
    });
  } catch (err) {
    console.error("getClubsJoined error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * POST new club join request
 * Optimized: Single findOneAndUpdate operation
 */
const enrollInClub = async (req, res) => {
  try {
    const { studentid } = req.user;
    const { clubId, role = "member" } = req.body;

    if (!clubId) {
      return res.status(400).json({ 
        ok: false, 
        message: "Club ID is required" 
      });
    }

    // Check if already enrolled using aggregation
    const existing = await StudentDetails.findOne({
      studentid,
      "clubsJoined.clubId": clubId
    }).lean();

    if (existing) {
      return res.status(400).json({ 
        ok: false, 
        message: "Already enrolled in this club" 
      });
    }

    // Single operation: find and update
    const student = await StudentDetails.findOneAndUpdate(
      { studentid },
      {
        $push: {
          clubsJoined: {
            clubId,
            role,
            joinedOn: new Date(),
            amountPaid: 0,
          }
        }
      },
      { new: true, select: "clubsJoined" }
    );

    if (!student) {
      return res.status(404).json({ 
        ok: false, 
        message: "Student not found" 
      });
    }

    // Get the newly added club (last one)
    const newClub = student.clubsJoined[student.clubsJoined.length - 1];

    res.json({ 
      ok: true, 
      message: "Club enrollment request submitted", 
      club: newClub 
    });
  } catch (err) {
    console.error("enrollInClub error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

export { getClubsJoined, enrollInClub };
