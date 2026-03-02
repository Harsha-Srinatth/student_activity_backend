import Course from "../../models/shared/courseSchema.js";
import StudentDetails from "../../models/student/studentDetails.js";
import { sendNotificationToStudent } from "../../utils/firebaseNotification.js";
import { emitStudentUpdate } from "../../utils/socketEmitter.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Get approved courses whose duration has ended (approvedAt + durationDays <= now).
 * Shown to faculty if either (1) the course creator is their assigned student, or
 * (2) any joined-but-not-completed student is their assigned student. So the faculty
 * who has the student that joined can see the course and award points when duration ends.
 */
export const getCoursesForCompletion = async (req, res) => {
  try {
    const { collegeId, facultyid } = req.user;

    const myStudentIds = await StudentDetails.find({ collegeId, facultyid })
      .select("studentid")
      .lean()
      .then((students) => students.map((s) => s.studentid));

    if (myStudentIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Courses where creator is our student OR any joined student is our student
    const approvedCourses = await Course.find({
      collegeId,
      status: "approved",
      "approvalDetails.approvedAt": { $exists: true, $ne: null },
      $or: [
        { creatorId: { $in: myStudentIds } },
        { "joinedStudents.studentId": { $in: myStudentIds } },
      ],
    })
      .sort({ "approvalDetails.approvedAt": -1 })
      .lean();

    const now = Date.now();
    const reviewByStudent = (reviews, studentId) =>
      (reviews || []).find((r) => r.studentId === studentId) || null;

    const forCompletion = approvedCourses
      .map((course) => {
        const rawApprovedAt = course.approvalDetails?.approvedAt ?? course.approvedAt;
        const approvedAt = rawApprovedAt ? new Date(rawApprovedAt).getTime() : null;
        if (!approvedAt || !course.durationDays) return null;
        const endTime = approvedAt + course.durationDays * MS_PER_DAY;
        if (now < endTime) return null; // Duration not yet ended
        const completedIds = new Set((course.completedBy || []).map((c) => c.studentId));
        const allPending = (course.joinedStudents || []).filter(
          (j) => !completedIds.has(j.studentId)
        );
        // Only include pending students that belong to this faculty
        const pendingStudents = allPending.filter((j) => myStudentIds.includes(j.studentId));
        if (pendingStudents.length === 0) return null;
        const pendingCompletions = pendingStudents.map((j) => {
          const review = reviewByStudent(course.studentReviews, j.studentId);
          return {
            studentId: j.studentId,
            joinedAt: j.joinedAt,
            rating: review?.rating,
            reviewText: review?.reviewText,
            submittedAt: review?.submittedAt,
          };
        });
        return {
          ...course,
          endDate: new Date(endTime),
          pendingCompletions,
        };
      })
      .filter(Boolean);

    return res.status(200).json({ success: true, data: forCompletion });
  } catch (error) {
    console.error("Get courses for completion error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get approved courses whose duration has ended and all joined students are completed.
 * Faculty can view history of completed courses (no pending completions left).
 * Includes courses where creator is their student OR any joined student is their student.
 */
export const getCompletedCourses = async (req, res) => {
  try {
    const { collegeId, facultyid } = req.user;

    const myStudentIds = await StudentDetails.find({ collegeId, facultyid })
      .select("studentid")
      .lean()
      .then((students) => students.map((s) => s.studentid));

    if (myStudentIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const approvedCourses = await Course.find({
      collegeId,
      status: "approved",
      "approvalDetails.approvedAt": { $exists: true, $ne: null },
      $or: [
        { creatorId: { $in: myStudentIds } },
        { "joinedStudents.studentId": { $in: myStudentIds } },
      ],
    })
      .sort({ "approvalDetails.approvedAt": -1 })
      .lean();

    const now = Date.now();
    const completed = approvedCourses
      .map((course) => {
        const rawApprovedAt = course.approvalDetails?.approvedAt ?? course.approvedAt;
        const approvedAt = rawApprovedAt ? new Date(rawApprovedAt).getTime() : null;
        if (!approvedAt || !course.durationDays) return null;
        const endTime = approvedAt + course.durationDays * MS_PER_DAY;
        if (now < endTime) return null; // Duration not yet ended
        const completedIds = new Set((course.completedBy || []).map((c) => c.studentId));
        const pendingCount = (course.joinedStudents || []).filter(
          (j) => !completedIds.has(j.studentId)
        ).length;
        if (pendingCount > 0) return null; // Still has pending completions
        return {
          ...course,
          endDate: new Date(endTime),
          completedBy: course.completedBy || [],
        };
      })
      .filter(Boolean);

    return res.status(200).json({ success: true, data: completed });
  } catch (error) {
    console.error("Get completed courses error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

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
 * Mark course as completed for a student and award Teaching Points (0–50).
 * Only allowed after course duration has ended (approvedAt + durationDays <= now).
 */
export const completeCourseForStudent = async (req, res) => {
  try {
    const { facultyid } = req.user;
    const { courseId, studentId } = req.params;
    const { feedback, points: pointsBody } = req.body;

    const course = await Course.findOne({ courseId });
    if (!course) return res.status(404).json({ message: "Course not found" });

    const creatorStudent = await StudentDetails.findOne({ studentid: course.creatorId })
      .select("facultyid")
      .lean();
    const completedStudent = await StudentDetails.findOne({ studentid: studentId })
      .select("facultyid")
      .lean();
    const isCreatorFaculty = creatorStudent?.facultyid === facultyid;
    const isCompletedStudentFaculty = completedStudent?.facultyid === facultyid;
    if (!isCreatorFaculty && !isCompletedStudentFaculty) {
      return res.status(403).json({
        message: "Only the faculty assigned to the course creator or to the student being completed can mark completion",
      });
    }

    const rawApprovedAt = course.approvalDetails?.approvedAt ?? course.approvedAt;
    const approvedAt = rawApprovedAt ? new Date(rawApprovedAt).getTime() : null;
    if (!approvedAt || !course.durationDays) {
      return res.status(400).json({ message: "Course approval or duration not set" });
    }
    const endTime = approvedAt + course.durationDays * MS_PER_DAY;
    if (Date.now() < endTime) {
      return res.status(400).json({
        message: "Course duration has not ended yet. Complete students only after the course end date.",
      });
    }

    const isJoined = course.joinedStudents?.some((s) => s.studentId === studentId);
    if (!isJoined) return res.status(400).json({ message: "Student has not joined this course" });

    const alreadyCompleted = course.completedBy?.some((c) => c.studentId === studentId);
    if (alreadyCompleted) return res.status(400).json({ message: "Student has already completed this course" });

    const rawPoints = pointsBody != null ? Number(pointsBody) : 50;
    const pointsAwarded = Number.isNaN(rawPoints)
      ? 50
      : Math.min(50, Math.max(0, Math.round(rawPoints)));

    course.completedBy = course.completedBy || [];
    course.completedBy.push({
      studentId,
      completedAt: new Date(),
      facultyFeedback: feedback || "",
      pointsAwarded,
    });
    await course.save();

    await StudentDetails.findOneAndUpdate(
      { studentid: studentId },
      { $inc: { teachingPoints: pointsAwarded } }
    );

    // If all joined students are now completed, mark course groupStatus as completed
    const joinedIds = (course.joinedStudents || []).map((j) => j.studentId);
    const completedIds = new Set((course.completedBy || []).map((c) => c.studentId));
    const allCompleted = joinedIds.length > 0 && joinedIds.every((id) => completedIds.has(id));
    if (allCompleted) {
      course.groupStatus = "completed";
      await course.save();
      try {
        emitStudentUpdate(course.creatorId, "courses", {
          type: "group_completed",
          courseId: course.courseId,
          groupStatus: "completed",
        });
      } catch (e) {
        console.error("Emit group completed:", e);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Course completed. ${pointsAwarded} Teaching Points awarded.`,
      data: { studentId, pointsAwarded },
    });
  } catch (error) {
    console.error("Complete course error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
