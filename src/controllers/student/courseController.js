import Course from "../../models/shared/courseSchema.js";
import crypto from "crypto";
import StudentDetails from "../../models/student/studentDetails.js";
import { sendNotificationToFaculty, sendNotificationToStudent } from "../../utils/firebaseNotification.js";
import { emitStudentUpdate, emitFacultyUpdate } from "../../utils/socketEmitter.js";

/**
 * Populate creatorName and creatorContact from StudentDetails by creatorId.
 * @param {Object|Object[]} courses - Single course or array of courses (plain objects)
 * @returns {Promise<Object|Object[]>} Same shape with creatorName and creatorContact set
 */
async function populateCreatorInfo(courses) {
  const list = Array.isArray(courses) ? courses : [courses];
  const creatorIds = [...new Set(list.map((c) => c.creatorId).filter(Boolean))];
  if (creatorIds.length === 0) return courses;

  const students = await StudentDetails.find({ studentid: { $in: creatorIds } })
    .select("studentid fullname mobileno")
    .lean();
  const byId = new Map(students.map((s) => [s.studentid, { creatorName: s.fullname, creatorContact: s.mobileno || "" }]));

  list.forEach((c) => {
    const info = byId.get(c.creatorId);
    c.creatorName = info?.creatorName ?? "";
    c.creatorContact = info?.creatorContact ?? "";
  });

  return Array.isArray(courses) ? list : list[0];
}

/**
 * Attach groupStatus (and groupId only for creator) to course(s) for the given studentId.
 * @param {Object|Object[]} courses - Single course or array (plain objects)
 * @param {string} studentId - Current user's student id
 * @returns {Promise<Object|Object[]>} Same shape with groupStatus and optionally groupId
 */
async function attachGroupStatusAndGroupId(courses, studentId) {
  const list = Array.isArray(courses) ? courses : [courses];
  list.forEach((c) => {
    c.groupStatus = c.groupStatus ?? "on-going";
    // Only creator sees groupId (so they can share it for others to join)
    if (c.creatorId !== studentId) delete c.groupId;
  });
  return Array.isArray(courses) ? list : list[0];
}

/**
 * Create a new course (status: pending). Generates groupId so creator can share it for others to join.
 */
export const createCourse = async (req, res) => {
  try {
    const { studentid, collegeId } = req.user;
    const { title, description, category, durationDays, paid, joinAmount } = req.body;

    if (!title || !description || !category || !durationDays) {
      return res.status(400).json({ message: "Title, description, category, and duration are required" });
    }

    const student = await StudentDetails.findOne({ studentid }).select("fullname mobileno teachingPoints facultyid").lean();
    if (!student) return res.status(404).json({ message: "Student not found" });

    const teachingPoints = (student.teachingPoints ?? 0);
    const canSetPaidCourse = teachingPoints >= 250;

    const isPaid = paid === true || paid === "true";
    const amount = isPaid ? (parseFloat(joinAmount) || 0) : 0;

    // Students with < 250 points can only create free courses; completing courses awards 50 points
    if (!canSetPaidCourse && (isPaid || amount > 0)) {
      return res.status(403).json({
        message: "You need 250 teaching points to set a join amount. Create a free course and earn 50 points when students complete it.",
        teachingPoints,
        required: 250,
      });
    }

    if (isPaid && amount <= 0) {
      return res.status(400).json({ message: "Please enter a valid amount to join the course when the course is paid" });
    }

    const coverImage = req.file
      ? { url: req.file.path || req.file.secure_url, publicId: req.file.filename || req.file.public_id }
      : undefined;

    const durationDaysNum = parseInt(durationDays, 10) || 1;
    const course = new Course({
      collegeId,
      creatorId: studentid,
      creatorName: student.fullname,
      creatorContact: student.mobileno || "",
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      durationDays: durationDaysNum,
      coverImage,
      status: "pending",
      isPaid: isPaid,
      joinAmount: amount,
      groupId: crypto.randomUUID().toLowerCase(),
      groupStatus: "on-going",
    });

    await course.save();

    // Notify only the student's assigned faculty about new course pending approval
    if (student.facultyid) {
      try {
        await sendNotificationToFaculty(
          student.facultyid,
          "New course pending approval",
          `${course.title} by ${course.creatorName} – please review in Course Approvals.`,
          {
            type: "course_pending",
            courseId: course.courseId,
            link: "/faculty/course-approvals",
            timestamp: new Date().toISOString(),
          }
        );
        emitFacultyUpdate(student.facultyid, "courses", {
          type: "new",
          course: course.toObject ? course.toObject() : course,
        });
      } catch (notifErr) {
        console.error("Create course: notification error", notifErr);
      }
    }

    const data = course.toObject ? course.toObject() : course;
    const withGroup = await attachGroupStatusAndGroupId(data, studentid);
    return res.status(201).json({
      success: true,
      message: "Course created. Pending faculty approval. Share your group ID with others so they can join.",
      data: withGroup,
    });
  } catch (error) {
    console.error("Create course error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Join course by course ID or by group ID (shared by creator)
 */
export const joinCourse = async (req, res) => {
  try {
    const { studentid, collegeId } = req.user;
    const { courseId, groupId } = req.body;

    if ((!courseId || !courseId.trim()) && (!groupId || !groupId.trim())) {
      return res.status(400).json({ message: "Course ID or Group ID is required" });
    }

    let course;
    if (groupId && groupId.trim()) {
      const normalizedGroupId = groupId.trim().toLowerCase();
      course = await Course.findOne({ collegeId, groupId: normalizedGroupId });
      if (!course) {
        return res.status(404).json({ message: "No course found for this Group ID. Check the ID or ask the creator to share it again." });
      }
      if (course.status === "pending") {
        return res.status(403).json({ message: "This course is not approved yet. Joining is allowed only after faculty approves it. Ask the creator to get it approved first." });
      }
      if (course.status === "rejected") {
        return res.status(403).json({ message: "This course was rejected and is not open for joining." });
      }
    } else {
      course = await Course.findOne({
        courseId: courseId.trim().toUpperCase(),
        collegeId,
        status: "approved",
      });
      if (!course) {
        return res.status(404).json({ message: "Course not found or not approved" });
      }
    }

    const alreadyJoined = (course.joinedStudents || []).some((s) => s.studentId === studentid);
    if (alreadyJoined) {
      return res.status(400).json({ message: "You have already joined this course" });
    }

    const now = new Date();
    const approvedAt = course.approvalDetails?.approvedAt || course.approvedAt;
    const fiveDaysAfterApproval = approvedAt
      ? new Date((approvedAt.getTime ? approvedAt.getTime() : new Date(approvedAt).getTime()) + 5 * 24 * 60 * 60 * 1000)
      : null;

    if (fiveDaysAfterApproval && now > fiveDaysAfterApproval) {
      return res.status(400).json({ message: "Join window has expired (5 days after approval)" });
    }

    if (!Array.isArray(course.joinedStudents)) course.joinedStudents = [];
    course.joinedStudents.push({ studentId: studentid, joinedAt: now });
    await course.save();

    // Notify course creator that someone joined
    try {
      const joinerName = await StudentDetails.findOne({ studentid }).select("fullname").lean().then((s) => s?.fullname || "A student");
      await sendNotificationToStudent(course.creatorId, "New join on your course", `${joinerName} joined "${course.title}".`, {
        type: "course_join",
        courseId: course.courseId,
        link: "/student/skill-exchange",
        timestamp: new Date().toISOString(),
      });
      emitStudentUpdate(course.creatorId, "courses", { type: "joined", course: course.toObject ? course.toObject() : course });
    } catch (notifErr) {
      console.error("Join course: notification error", notifErr);
    }

    const data = course.toObject ? course.toObject() : course;
    const withGroup = await attachGroupStatusAndGroupId(data, studentid);
    return res.status(200).json({
      success: true,
      message: "Successfully joined the course",
      data: withGroup,
    });
  } catch (error) {
    console.error("Join course error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const TEACHING_POINTS_REQUIRED = 250;

/**
 * Get current student's teaching points (for course creation eligibility)
 */
export const getTeachingPoints = async (req, res) => {
  try {
    const { studentid } = req.user;
    const student = await StudentDetails.findOne({ studentid }).select("teachingPoints").lean();
    const teachingPoints = student?.teachingPoints ?? 0;
    return res.status(200).json({
      success: true,
      data: {
        teachingPoints,
        required: TEACHING_POINTS_REQUIRED,
        canCreateCourse: true, // everyone can create free courses
        canSetPaidCourse: teachingPoints >= TEACHING_POINTS_REQUIRED, // 250+ to set join amount
      },
    });
  } catch (error) {
    console.error("Get teaching points error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get my created courses (includes groupStatus; creator sees groupId to share)
 */
export const getMyCourses = async (req, res) => {
  try {
    const { studentid } = req.user;

    const courses = await Course.find({ creatorId: studentid }).sort({ createdAt: -1 }).lean();
    const withGroup = await attachGroupStatusAndGroupId(courses, studentid);

    return res.status(200).json({ success: true, data: withGroup });
  } catch (error) {
    console.error("Get my courses error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get joined courses (includes groupStatus; groupId only for creator)
 */
export const getJoinedCourses = async (req, res) => {
  try {
    const { studentid } = req.user;

    const courses = await Course.find({
      "joinedStudents.studentId": studentid,
      status: "approved",
    })
      .sort({ createdAt: -1 })
      .lean();
    const withGroup = await attachGroupStatusAndGroupId(courses, studentid);

    return res.status(200).json({ success: true, data: withGroup });
  } catch (error) {
    console.error("Get joined courses error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Get discoverable courses: approved, same college, not created by me, not joined,
 * and still within course duration (approvedAt + durationDays > now).
 * Once duration is completed, the course no longer appears here.
 */
export const getDiscoverableCourses = async (req, res) => {
  try {
    const { collegeId, studentid } = req.user;
    const now = new Date();

    const courses = await Course.find({
      collegeId,
      status: "approved",
      "approvalDetails.approvedAt": { $exists: true, $ne: null },
      creatorId: { $ne: studentid },
      "joinedStudents.studentId": { $nin: [studentid] },
      $expr: {
        $gt: [
          { $add: ["$approvalDetails.approvedAt", { $multiply: ["$durationDays", MS_PER_DAY] }] },
          now,
        ],
      },
    })
      .sort({ "approvalDetails.approvedAt": -1 })
      .limit(50)
      .lean();

    const enriched = await populateCreatorInfo(courses);
    const withGroup = await attachGroupStatusAndGroupId(enriched, studentid);
    return res.status(200).json({ success: true, data: withGroup });
  } catch (error) {
    console.error("Get discoverable courses error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get single course by ID (for viewing content)
 */
export const getCourseById = async (req, res) => {
  try {
    const { studentid, collegeId } = req.user;
    const { courseId } = req.params;

    const course = await Course.findOne({ courseId, collegeId }).lean();
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isCreator = course.creatorId === studentid;
    const isJoined = course.joinedStudents?.some((s) => s.studentId === studentid);

    if (!isCreator && !isJoined) {
      return res.status(403).json({ message: "You must join this course to view content" });
    }

    if (!isCreator && course.status !== "approved") {
      return res.status(403).json({ message: "Course is not yet approved" });
    }

    // Ensure creator contact is present (for older docs or if not stored)
    let out = course;
    if (!course.creatorContact || !course.creatorName) {
      out = await populateCreatorInfo(course);
    }
    const withGroup = await attachGroupStatusAndGroupId(out, studentid);
    return res.status(200).json({ success: true, data: withGroup });
  } catch (error) {
    console.error("Get course error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const MS_PER_DAY_COURSE = 24 * 60 * 60 * 1000;

/**
 * Submit feedback/review for a course. Allowed only after course duration has ended
 * (from faculty approval date + durationDays). Student must have joined and not yet be in completedBy.
 */
export const submitCourseFeedback = async (req, res) => {
  try {
    const { studentid } = req.user;
    const { courseId } = req.params;
    const { rating, reviewText } = req.body;

    const course = await Course.findOne({ courseId });
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isJoined = course.joinedStudents?.some((s) => s.studentId === studentid);
    if (!isJoined) return res.status(403).json({ message: "You have not joined this course" });

    const alreadyCompleted = course.completedBy?.some((c) => c.studentId === studentid);
    if (alreadyCompleted) return res.status(400).json({ message: "You have already been marked complete for this course" });

    const approvedAt = course.approvalDetails?.approvedAt ? new Date(course.approvalDetails.approvedAt).getTime() : null;
    if (!approvedAt || !course.durationDays) return res.status(400).json({ message: "Course has no approval or duration" });
    const endTime = approvedAt + course.durationDays * MS_PER_DAY_COURSE;
    if (Date.now() < endTime) {
      return res.status(400).json({ message: "Course duration has not ended yet. You can submit feedback after the course end date." });
    }

    const alreadyReviewed = course.studentReviews?.some((r) => r.studentId === studentid);
    if (alreadyReviewed) return res.status(400).json({ message: "You have already submitted feedback for this course" });

    const review = {
      studentId: studentid,
      rating: rating != null ? Math.min(5, Math.max(1, Number(rating))) : undefined,
      reviewText: typeof reviewText === "string" ? reviewText.trim().slice(0, 1000) : "",
      submittedAt: new Date(),
    };
    course.studentReviews = course.studentReviews || [];
    course.studentReviews.push(review);
    await course.save();

    return res.status(200).json({
      success: true,
      message: "Feedback submitted. Faculty will review and award points.",
      data: review,
    });
  } catch (error) {
    console.error("Submit course feedback error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Add content: creator can add any type; joined students can add text only (ask doubt).
 */
export const addCourseContent = async (req, res) => {
  try {
    const { studentid } = req.user;
    const { courseId } = req.params;
    const { type, caption } = req.body;

    const course = await Course.findOne({ courseId });
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isCreator = course.creatorId === studentid;
    const isJoined = course.joinedStudents?.some((s) => s.studentId === studentid);
    if (!isCreator && !isJoined) {
      return res.status(403).json({ message: "You must join this course to add content or ask doubts" });
    }

    // Joined students (non-creator) can only send text (ask doubt)
    const url = req.file ? (req.file.path || req.file.secure_url) : req.body.url || "";
    let contentType = (type || "text").toLowerCase();
    if (!isCreator) {
      if (contentType !== "text") {
        return res.status(403).json({ message: "Only the course creator can add images or videos. You can ask a doubt by sending a text message." });
      }
    }
    if (!url && contentType !== "text" && contentType !== "video") {
      return res.status(400).json({ message: "File or URL required for this content type" });
    }

    const contentItem = {
      type: contentType,
      url: contentType === "text" ? (caption || req.body.caption || req.body.text || "") : (url || (req.body.url || "")),
      caption: contentType === "text" ? "" : (caption || ""),
      createdBy: studentid,
    };

    course.content.push(contentItem);
    await course.save();

    const added = course.content[course.content.length - 1];
    const payload = added.toObject ? added.toObject() : { ...added, _id: added._id?.toString?.() || added._id };

    if (global.io) {
      global.io.to(`course:${courseId}`).emit("course:content:new", payload);
    }

    return res.status(201).json({
      success: true,
      message: "Content added",
      data: payload,
    });
  } catch (error) {
    console.error("Add content error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Delete content: creator can delete any; others can delete only their own (createdBy).
 */
export const deleteCourseContent = async (req, res) => {
  try {
    const { studentid } = req.user;
    const { courseId, contentId } = req.params;

    const course = await Course.findOne({ courseId });
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isCreator = course.creatorId === studentid;
    const item = course.content?.find((c) => c._id.toString() === contentId);
    if (!item) return res.status(404).json({ message: "Content not found" });
    const isOwn = item.createdBy && item.createdBy.toString() === studentid;
    if (!isCreator && !isOwn) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    course.content = course.content.filter((c) => c._id.toString() !== contentId);
    await course.save();

    if (global.io) {
      global.io.to(`course:${courseId}`).emit("course:content:deleted", { contentId });
    }

    return res.status(200).json({ success: true, message: "Content deleted" });
  } catch (error) {
    console.error("Delete content error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
