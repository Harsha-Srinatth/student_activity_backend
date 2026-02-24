import Course from "../../models/shared/courseSchema.js";
import StudentDetails from "../../models/student/studentDetails.js";
import { sendNotificationToStudent } from "../../utils/firebaseNotification.js";
import { emitStudentUpdate } from "../../utils/socketEmitter.js";

/**
 * Get pending courses for approval (only courses created by students assigned to this faculty)
 */
export const getPendingCourses = async (req, res) => {
  try {
    const { collegeId, facultyid } = req.user;

    const creatorStudentIds = await StudentDetails.find({ collegeId, facultyid })
      .select("studentid")
      .lean()
      .then((students) => students.map((s) => s.studentid));

    const courses = await Course.find({
      collegeId,
      status: "pending",
      creatorId: { $in: creatorStudentIds },
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: courses });
  } catch (error) {
    console.error("Get pending courses error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Approve or reject course
 */
export const approveOrRejectCourse = async (req, res) => {
  try {
    const { facultyid } = req.user;
    const { courseId } = req.params;
    const { action, reason } = req.body;

    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Action must be 'approve' or 'reject'" });
    }

    const course = await Course.findOne({ courseId });
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (course.status !== "pending") {
      return res.status(400).json({ message: "Course is not pending approval" });
    }

    const creatorStudent = await StudentDetails.findOne({ studentid: course.creatorId })
      .select("facultyid")
      .lean();
    if (!creatorStudent || creatorStudent.facultyid !== facultyid) {
      return res.status(403).json({
        message: "Only the assigned faculty of the course creator can approve or reject this course",
      });
    }

    if (action === "approve") {
      course.status = "approved";
      course.approvalDetails = {
        approvedBy: facultyid,
        approvedAt: new Date(),
        rejectedBy: null,
        rejectedAt: null,
        reason: null,
      };
      course.approvedAt = new Date();
    } else {
      course.status = "rejected";
      course.approvalDetails = {
        approvedBy: null,
        approvedAt: null,
        rejectedBy: facultyid,
        rejectedAt: new Date(),
        reason: reason || "No reason provided",
      };
    }

    await course.save();

    // Notify creator student (push + real-time)
    try {
      const title = action === "approve" ? "Course approved" : "Course rejected";
      const body =
        action === "approve"
          ? `"${course.title}" is now live. Students can join for 5 days.`
          : `"${course.title}" was rejected. Reason: ${course.approvalDetails?.reason || "No reason provided"}.`;
      await sendNotificationToStudent(course.creatorId, title, body, {
        type: action === "approve" ? "course_approved" : "course_rejected",
        courseId: course.courseId,
        link: "/student/skill-exchange",
        timestamp: new Date().toISOString(),
      });
      emitStudentUpdate(course.creatorId, "courses", { type: action, course: course.toObject ? course.toObject() : course });
    } catch (notifErr) {
      console.error("Course approval: notification error", notifErr);
    }

    return res.status(200).json({
      success: true,
      message: action === "approve" ? "Course approved" : "Course rejected",
      data: course,
    });
  } catch (error) {
    console.error("Approve/reject course error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Mark course as completed for a student and award 50 Teaching Points
 */
export const completeCourseForStudent = async (req, res) => {
  try {
    const { facultyid } = req.user;
    const { courseId, studentId } = req.params;
    const { feedback } = req.body;

    const course = await Course.findOne({ courseId });
    if (!course) return res.status(404).json({ message: "Course not found" });

    const creatorStudent = await StudentDetails.findOne({ studentid: course.creatorId })
      .select("facultyid")
      .lean();
    if (!creatorStudent || creatorStudent.facultyid !== facultyid) {
      return res.status(403).json({
        message: "Only the assigned faculty of the course creator can mark completion for this course",
      });
    }

    const isJoined = course.joinedStudents?.some((s) => s.studentId === studentId);
    if (!isJoined) return res.status(400).json({ message: "Student has not joined this course" });

    const alreadyCompleted = course.completedBy?.some((c) => c.studentId === studentId);
    if (alreadyCompleted) return res.status(400).json({ message: "Student has already completed this course" });

    const POINTS_PER_COURSE = 50;
    course.completedBy = course.completedBy || [];
    course.completedBy.push({
      studentId,
      completedAt: new Date(),
      facultyFeedback: feedback || "",
      pointsAwarded: POINTS_PER_COURSE,
    });
    await course.save();

    await StudentDetails.findOneAndUpdate(
      { studentid: studentId },
      { $inc: { teachingPoints: POINTS_PER_COURSE } }
    );

    return res.status(200).json({
      success: true,
      message: "Course completed. 50 Teaching Points awarded.",
      data: { studentId, pointsAwarded: POINTS_PER_COURSE },
    });
  } catch (error) {
    console.error("Complete course error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
