import { Doubt, Reply } from "../../models/student/doubtSchema.js";
import StudentDetails from "../../models/student/studentDetails.js";
import { sendNotificationToStudent } from "../../utils/firebaseNotification.js";

// ─── Helper: batch-populate user details onto an array of docs ───
// Collects all unique createdBy IDs, looks up StudentDetails,
// and attaches createdByName + createdByAvatar to each doc.
const populateCreatorDetails = async (docs) => {
  if (!docs || docs.length === 0) return docs;

  const userIds = [...new Set(docs.map((d) => d.createdBy).filter(Boolean))];
  if (userIds.length === 0) return docs;

  const students = await StudentDetails.find({ studentid: { $in: userIds } })
    .select("studentid fullname image")
    .lean();

  const userMap = new Map(
    students.map((s) => [
      s.studentid,
      { fullname: s.fullname, avatar: s.image?.url || "" },
    ])
  );

  return docs.map((doc) => ({
    ...doc,
    createdByName: userMap.get(doc.createdBy)?.fullname || doc.createdBy,
    createdByAvatar: userMap.get(doc.createdBy)?.avatar || "",
  }));
};

// Helper: populate a single doc
const populateSingleCreator = async (doc) => {
  const results = await populateCreatorDetails([doc]);
  return results[0];
};

/**
 * Get all doubts for a college (paginated)
 * GET /student/doubts?page=1&limit=20
 */
export const getCollegeDoubts = async (req, res) => {
  try {
    const studentId = req.user.studentId || req.user.studentid;
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const student = await StudentDetails.findOne({ studentid: studentId })
      .select("collegeId")
      .lean();
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [rawCollegeDoubts, rawMyDoubts, totalCollege, totalMy] =
      await Promise.all([
        Doubt.find({
          collegeId: student.collegeId,
          createdBy: { $ne: studentId },
        })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Doubt.find({ collegeId: student.collegeId, createdBy: studentId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Doubt.countDocuments({
          collegeId: student.collegeId,
          createdBy: { $ne: studentId },
        }),
        Doubt.countDocuments({
          collegeId: student.collegeId,
          createdBy: studentId,
        }),
      ]);

    // Batch-populate user details for all doubts in one query
    const allRaw = [...rawMyDoubts, ...rawCollegeDoubts];
    const allPopulated = await populateCreatorDetails(allRaw);

    const myDoubts = allPopulated.slice(0, rawMyDoubts.length);
    const collegeDoubts = allPopulated.slice(rawMyDoubts.length);

    return res.status(200).json({
      myDoubts,
      collegeDoubts,
      pagination: {
        page,
        limit,
        totalCollegeDoubts: totalCollege,
        totalMyDoubts: totalMy,
        hasMoreCollege: skip + limit < totalCollege,
        hasMoreMy: skip + limit < totalMy,
      },
    });
  } catch (error) {
    console.error("Error fetching doubts:", error);
    return res.status(500).json({ message: "Failed to fetch doubts" });
  }
};

/**
 * Create a new doubt
 * POST /student/doubts
 */
export const createDoubt = async (req, res) => {
  try {
    const studentId = req.user.studentId || req.user.studentid;
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const student = await StudentDetails.findOne({ studentid: studentId })
      .select("collegeId fullname image")
      .lean();
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const { title, description, tag } = req.body;

    if (!title || !description || !tag) {
      return res
        .status(400)
        .json({ message: "Title, description, and tag are required" });
    }

    if (title.length > 200) {
      return res
        .status(400)
        .json({ message: "Title must be 200 characters or less" });
    }
    if (description.length > 5000) {
      return res
        .status(400)
        .json({ message: "Description must be 5000 characters or less" });
    }

    const doubt = await Doubt.create({
      title: title.trim(),
      description: description.trim(),
      tag,
      collegeId: student.collegeId,
      createdBy: studentId,
    });

    // Attach user details for response & socket emit
    const populatedDoubt = {
      ...doubt.toObject(),
      createdByName: student.fullname,
      createdByAvatar: student.image?.url || "",
    };

    // Emit socket event to all students in the same college
    if (global.io) {
      global.io.to(`college:${student.collegeId}`).emit("doubt:new", {
        doubt: populatedDoubt,
      });
    }

    sendNotificationToStudent(studentId, "New doubt", "A new doubt has been created in your college");

    return res.status(201).json({ doubt: populatedDoubt });
  } catch (error) {
    console.error("Error creating doubt:", error);
    return res.status(500).json({ message: "Failed to create doubt" });
  }
};

/**
 * Get a single doubt by ID with replies
 * GET /student/doubts/:doubtId
 */
export const getDoubtById = async (req, res) => {
  try {
    const studentId = req.user.studentId || req.user.studentid;
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { doubtId } = req.params;

    const doubt = await Doubt.findById(doubtId).lean();
    if (!doubt) {
      return res.status(404).json({ message: "Doubt not found" });
    }

    // Verify the student belongs to the same college
    const student = await StudentDetails.findOne({ studentid: studentId })
      .select("collegeId")
      .lean();
    if (!student || student.collegeId !== doubt.collegeId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip = (page - 1) * limit;

    const [rawReplies, totalReplies] = await Promise.all([
      Reply.find({ doubtId })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Reply.countDocuments({ doubtId }),
    ]);

    // Batch-populate user details for doubt + all replies in one query
    const populatedDoubt = await populateSingleCreator(doubt);
    const populatedReplies = await populateCreatorDetails(rawReplies);

    return res.status(200).json({
      doubt: populatedDoubt,
      replies: populatedReplies,
      pagination: {
        page,
        limit,
        total: totalReplies,
        hasMore: skip + limit < totalReplies,
      },
    });
  } catch (error) {
    console.error("Error fetching doubt:", error);
    return res.status(500).json({ message: "Failed to fetch doubt" });
  }
};

/**
 * Create a reply to a doubt
 * POST /student/doubts/:doubtId/replies
 */
export const createReply = async (req, res) => {
  try {
    const studentId = req.user.studentId || req.user.studentid;
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { doubtId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Reply content is required" });
    }

    if (content.length > 2000) {
      return res
        .status(400)
        .json({ message: "Reply must be 2000 characters or less" });
    }

    const doubt = await Doubt.findById(doubtId);
    if (!doubt) {
      return res.status(404).json({ message: "Doubt not found" });
    }

    // Verify the student belongs to the same college
    const student = await StudentDetails.findOne({ studentid: studentId })
      .select("collegeId fullname image")
      .lean();
    if (!student || student.collegeId !== doubt.collegeId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const reply = await Reply.create({
      doubtId,
      content: content.trim(),
      createdBy: studentId,
      createdByRole: "student",
      collegeId: student.collegeId,
    });

    // Increment reply count on the doubt
    doubt.replyCount = (doubt.replyCount || 0) + 1;
    await doubt.save();

    // Attach user details for response & socket emit
    const populatedReply = {
      ...reply.toObject(),
      createdByName: student.fullname,
      createdByAvatar: student.image?.url || "",
    };

    // Emit socket event to all users viewing this doubt
    if (global.io) {
      global.io.to(`doubt:${doubtId}`).emit("doubt:reply", {
        reply: populatedReply,
        doubtId,
      });
    }
    sendNotificationToStudent(studentId, "New reply", "A new reply has been created to your doubt");
    return res.status(201).json({ reply: populatedReply });
  } catch (error) {
    console.error("Error creating reply:", error);
    return res.status(500).json({ message: "Failed to create reply" });
  }
};

/**
 * Delete a doubt (only by creator)
 * DELETE /student/doubts/:doubtId
 */
export const deleteDoubt = async (req, res) => {
  try {
    const studentId = req.user.studentId || req.user.studentid;
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { doubtId } = req.params;

    const doubt = await Doubt.findById(doubtId);
    if (!doubt) {
      return res.status(404).json({ message: "Doubt not found" });
    }

    if (doubt.createdBy !== studentId) {
      return res
        .status(403)
        .json({ message: "Only the creator can delete this doubt" });
    }

    const collegeId = doubt.collegeId;

    // Delete doubt and all its replies
    await Promise.all([
      Doubt.findByIdAndDelete(doubtId),
      Reply.deleteMany({ doubtId }),
    ]);

    // Emit to both college room (feed) and doubt room (detail page)
    if (global.io) {
      const payload = { doubtId };
      global.io.to(`college:${collegeId}`).emit("doubt:delete", payload);
      global.io.to(`doubt:${doubtId}`).emit("doubt:delete", payload);
    }

    sendNotificationToStudent(studentId, "Doubt deleted", "A doubt has been deleted");

    return res
      .status(200)
      .json({ message: "Doubt deleted successfully", doubtId });
  } catch (error) {
    console.error("Error deleting doubt:", error);
    return res.status(500).json({ message: "Failed to delete doubt" });
  }
};

/**
 * Toggle solved status of a doubt (only by creator)
 * PATCH /student/doubts/:doubtId/solve
 */
export const toggleSolvedDoubt = async (req, res) => {
  try {
    const studentId = req.user.studentId || req.user.studentid;
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { doubtId } = req.params;

    const doubt = await Doubt.findById(doubtId);
    if (!doubt) {
      return res.status(404).json({ message: "Doubt not found" });
    }

    if (doubt.createdBy !== studentId) {
      return res
        .status(403)
        .json({ message: "Only the creator can mark this as solved" });
    }

    doubt.isSolved = !doubt.isSolved;
    doubt.solvedAt = doubt.isSolved ? new Date() : null;
    await doubt.save();

    // Populate user details before sending response & socket emit
    const populatedDoubt = await populateSingleCreator(doubt.toObject());

    // Emit to both college room (feed) and doubt room (detail page)
    if (global.io) {
      const payload = { doubt: populatedDoubt };
      global.io.to(`college:${doubt.collegeId}`).emit("doubt:update", payload);
      global.io.to(`doubt:${doubtId}`).emit("doubt:update", payload);
    }

    sendNotificationToStudent(studentId, "Doubt solved", "A doubt has been solved");

    return res.status(200).json({ doubt: populatedDoubt });
  } catch (error) {
    console.error("Error toggling solved status:", error);
    return res.status(500).json({ message: "Failed to update doubt" });
  }
};
