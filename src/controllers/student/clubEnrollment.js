import StudentDetails from "../../models/student/studentDetails.js";
import ClubDetail from "../../models/shared/clubSchema.js";
import { 
  emitStudentDashboardDataUpdate,
  emitUserNotification
} from "../../utils/socketEmitter.js";
import { sendNotificationToFaculty } from "../../utils/firebaseNotification.js";

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
      { clubEnrollments: 1 }
    ).lean();

    if (!student) {
      return res.status(404).json({ ok: false, message: "Student not found" });
    }

    return res.json({ 
      ok: true, 
      clubsJoined: student.clubEnrollments || [] 
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
      "clubEnrollments.clubId": clubId
    }).lean();

    if (existing) {
      return res.status(400).json({ 
        ok: false, 
        message: "Already enrolled in this club" 
      });
    }

    // Single operation: find and update student
    const student = await StudentDetails.findOneAndUpdate(
      { studentid },
      {
        $push: {
          clubEnrollments: {
            clubId,
            role,
            joinedOn: new Date(),
            amountPaid: 0,
          }
        }
      },
      { new: true, select: "clubEnrollments" }
    );

    if (!student) {
      return res.status(404).json({ 
        ok: false, 
        message: "Student not found" 
      });
    }

    // Also add student to club's members array if not already present
    await ClubDetail.findOneAndUpdate(
      { clubId },
      {
        $addToSet: { // $addToSet prevents duplicates
          members: { studentid }
        }
      }
    );

    // Get the newly added club (last one)
    const newClub = student.clubEnrollments[student.clubEnrollments.length - 1];

    // Emit real-time updates
    try {
      // Update student dashboard
      await emitStudentDashboardDataUpdate(studentid);
      
      // Get club details for notification
      const club = await ClubDetail.findOne({ clubId }).select('clubName facultyCoordinator').lean();
      
      // Notify faculty coordinator if exists
      if (club?.facultyCoordinator) {
        // Socket notification
        emitUserNotification(club.facultyCoordinator, {
          type: 'club_enrollment',
          title: 'New Club Enrollment',
          message: `Student ${studentid} enrolled in ${club.clubName || clubId}`,
          data: { studentid, clubId, clubName: club.clubName }
        });
        
        // FCM push notification
        try {
          await sendNotificationToFaculty(
            club.facultyCoordinator,
            "New Club Enrollment 🎯",
            `Student ${studentid} enrolled in ${club.clubName || clubId}`,
            {
              type: "club_enrollment",
              studentid: studentid,
              clubId: clubId,
              clubName: club.clubName || clubId,
              timestamp: new Date().toISOString(),
            }
          );
        } catch (notifError) {
          console.error(`Error sending push notification to faculty ${club.facultyCoordinator}:`, notifError);
        }
      }
    } catch (socketError) {
      console.error('Error emitting real-time updates:', socketError);
    }

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
