import Announcement from "../../models/shared/announcementSchema.js";
import ClubDetail from "../../models/shared/clubSchema.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";
import StudentDetails from "../../models/student/studentDetails.js";
import { emitAnnouncementUpdate } from "../../utils/socketEmitter.js";
import { emitToUsersIfConnected } from "../../utils/realtimeUpdate.js";
import { sendBatchNotifications } from "../../utils/firebaseNotification.js";

/**
 * Create a club announcement (for faculty coordinators and student heads)
 */
export const createClubAnnouncement = async (req, res) => {
  try {
    const { collegeId, role, facultyid, studentid } = req.user;
    const { clubId, title, content, eventDate, targetYears, priority } = req.body;

    if (!clubId || !title || !content) {
      return res.status(400).json({ 
        success: false,
        message: "Club ID, title, and content are required" 
      });
    }

    // Verify club exists and get club details
    const club = await ClubDetail.findOne({ 
      clubId, 
      collegeId 
    }).lean();

    if (!club) {
      return res.status(404).json({ 
        success: false,
        message: "Club not found" 
      });
    }

    // Verify user has permission (is coordinator or head)
    let hasPermission = false;
    let creatorName = "";
    let creatorId = "";

    if (role === "faculty" && facultyid) {
      if (club.facultyCoordinator === facultyid) {
        hasPermission = true;
        const faculty = await FacultyDetails.findOne({ facultyid })
          .select("fullname")
          .lean();
        creatorName = faculty?.fullname || "Faculty Coordinator";
        creatorId = facultyid;
      }
    } else if (role === "student" && studentid) {
      if (club.studentHead === studentid) {
        hasPermission = true;
        const student = await StudentDetails.findOne({ studentid })
          .select("fullname")
          .lean();
        creatorName = student?.fullname || "Student Head";
        creatorId = studentid;
      }
    }

    if (!hasPermission) {
      return res.status(403).json({ 
        success: false,
        message: "You don't have permission to post announcements for this club" 
      });
    }

    // Handle image upload if present
    let imageData = null;
    if (req.file) {
      const fileUrl = req.file.path || req.file.secure_url;
      const publicId = req.file.filename || req.file.public_id;
      
      if (fileUrl) {
        imageData = {
          url: fileUrl,
          publicId: publicId || null,
        };
      }
    }

    // Handle targetYears - convert to array if string
    let targetYearsArray = [];
    if (targetYears) {
      if (Array.isArray(targetYears)) {
        targetYearsArray = targetYears.filter(y => ["1st", "2nd", "3rd", "4th"].includes(y));
      } else if (typeof targetYears === 'string') {
        targetYearsArray = [targetYears].filter(y => ["1st", "2nd", "3rd", "4th"].includes(y));
      }
    }

    // Create announcement (only store clubId, not clubName/clubImage)
    const announcement = new Announcement({
      title,
      content,
      collegeId,
      targetAudience: ["student"], // Club announcements are for students
      priority: priority || "medium",
      createdBy: {
        adminId: creatorId,
        adminName: creatorName,
      },
      expiresAt: null,
      isActive: true,
      image: imageData,
      // Club-specific fields
      clubId: club.clubId,
      targetYears: targetYearsArray,
      eventDate: eventDate ? new Date(eventDate) : null,
    });

    await announcement.save();

    // Emit real-time update via Socket.IO (include club details from club object)
    const announcementData = {
      _id: announcement._id,
      title: announcement.title,
      content: announcement.content,
      priority: announcement.priority,
      image: announcement.image,
      targetAudience: announcement.targetAudience,
      clubId: announcement.clubId,
      clubName: club.clubName,
      clubImage: club.imageUrl,
      targetYears: announcement.targetYears,
      eventDate: announcement.eventDate,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
      expiresAt: announcement.expiresAt,
      isActive: announcement.isActive,
      createdBy: announcement.createdBy,
    };
    
    emitAnnouncementUpdate("student", {
      type: "new",
      announcement: announcementData,
    });

    // Send push notifications to students
    // If targetYears is specified, send only to those years; otherwise send to all students
    try {
      let students;
      let targetYearsText = "";
      
      if (targetYearsArray.length > 0) {
        // Map year to semester ranges: 1st = 1-2, 2nd = 3-4, 3rd = 5-6, 4th = 7-8
        const yearToSemesterMap = {
          "1st": ["1", "2"],
          "2nd": ["3", "4"],
          "3rd": ["5", "6"],
          "4th": ["7", "8"],
        };

        // Get all semester strings for selected years
        const targetSemesters = [];
        targetYearsArray.forEach(year => {
          const semesters = yearToSemesterMap[year];
          if (semesters) {
            targetSemesters.push(...semesters);
          }
        });

        // Find students in the selected years (by semester)
        // Semester is stored as string in the database
        students = await StudentDetails.find({
          collegeId,
          semester: { $in: targetSemesters },
        })
          .select("studentid fcmToken semester")
          .lean();
        
        targetYearsText = ` (years: ${targetYearsArray.join(", ")})`;
        console.log(`🔔 [Club Announcement] Targeting specific years: ${targetYearsArray.join(", ")} (semesters: ${targetSemesters.join(", ")})`);
      } else {
        // No targetYears specified - send to ALL students in the college
        students = await StudentDetails.find({ collegeId })
          .select("studentid fcmToken semester")
          .lean();
        
        targetYearsText = " (all students)";
        console.log(`🔔 [Club Announcement] No target years specified - sending to ALL students in college`);
      }

      // Filter students by FCM token
      const studentTokens = students
        .map(s => s.fcmToken)
        .filter(token => token && token.trim() !== "");

      if (studentTokens.length > 0) {
        await sendBatchNotifications(
          studentTokens,
          `New Club Event: ${title}`,
          `From ${club.clubName} - ${content.length > 100 ? content.substring(0, 100) + "..." : content}`,
          {
            type: "club_announcement",
            announcementId: announcement._id.toString(),
            clubId: club.clubId,
            clubName: club.clubName,
            targetYears: targetYearsArray.length > 0 ? targetYearsArray.join(",") : "all",
            priority: priority || "medium",
            timestamp: new Date().toISOString(),
          }
        );
        console.log(`✅ [Club Announcement] Notification sent to ${studentTokens.length} students${targetYearsText}`);
      } else {
        console.log(`⚠️  [Club Announcement] No students with FCM tokens found${targetYearsText}`);
      }
    } catch (notifError) {
      console.error("❌ [Club Announcement] Error sending notifications:", notifError);
      // Don't fail the request if notifications fail
    }

    // Return announcement with club details populated
    const announcementResponse = {
      ...announcement.toObject(),
      clubName: club.clubName,
      clubImage: club.imageUrl,
    };

    return res.status(201).json({
      success: true,
      message: "Club announcement created successfully",
      data: announcementResponse,
    });
  } catch (error) {
    console.error("Create club announcement error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error",
      error: error.message 
    });
  }
};

/**
 * Get clubs where user can post announcements (optimized query)
 */
export const getMyClubs = async (req, res) => {
  try {
    const { collegeId, role, facultyid, studentid } = req.user;

    if (!collegeId) {
      return res.status(400).json({ 
        success: false,
        message: "College ID not found" 
      });
    }

    let query = { collegeId };

    // Filter by role - only show clubs where user is coordinator or head
    if (role === "faculty" && facultyid) {
      query.facultyCoordinator = facultyid;
    } else if (role === "student" && studentid) {
      query.studentHead = studentid;
    } else {
      return res.status(403).json({ 
        success: false,
        message: "Invalid role for club announcements" 
      });
    }

    // Only fetch necessary fields for optimization
    const clubs = await ClubDetail.find(query)
      .select("clubId clubName imageUrl description")
      .lean()
      .sort({ clubName: 1 });

    return res.status(200).json({
      success: true,
      data: clubs,
    });
  } catch (error) {
    console.error("Get my clubs error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error",
      error: error.message 
    });
  }
};

/**
 * Helper function to check if user can modify a club announcement
 */
const canModifyClubAnnouncement = async (announcement, user) => {
  if (!announcement.clubId) {
    return { canModify: false, reason: "Not a club announcement" };
  }

  // Get club details
  const club = await ClubDetail.findOne({ clubId: announcement.clubId }).lean();
  if (!club) {
    return { canModify: false, reason: "Club not found" };
  }

  // Check if user is the creator
  const isCreator = announcement.createdBy?.adminId === user.facultyid || 
                    announcement.createdBy?.adminId === user.studentid;

  if (!isCreator) {
    return { canModify: false, reason: "You are not the creator of this announcement" };
  }

  // Check if user still has permission (is still head/coordinator)
  let hasPermission = false;
  if (user.role === "faculty" && user.facultyid) {
    hasPermission = club.facultyCoordinator === user.facultyid;
  } else if (user.role === "student" && user.studentid) {
    hasPermission = club.studentHead === user.studentid;
  }

  if (!hasPermission) {
    return { canModify: false, reason: "You no longer have permission for this club" };
  }

  return { canModify: true, club };
};

/**
 * Update a club announcement (only creator can update)
 */
export const updateClubAnnouncement = async (req, res) => {
  try {
    const { collegeId, role, facultyid, studentid } = req.user;
    const { id } = req.params;
    const { title, content, eventDate, targetYears, priority } = req.body;

    // Find announcement
    const announcement = await Announcement.findOne({
      _id: id,
      collegeId,
      clubId: { $ne: null }, // Must be a club announcement
    });

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Club announcement not found",
      });
    }

    // Check permissions
    const { canModify, reason, club } = await canModifyClubAnnouncement(announcement, req.user);
    if (!canModify) {
      return res.status(403).json({
        success: false,
        message: reason || "You don't have permission to update this announcement",
      });
    }

    // Handle image upload if present
    if (req.file) {
      const fileUrl = req.file.path || req.file.secure_url;
      const publicId = req.file.filename || req.file.public_id;
      
      if (fileUrl) {
        announcement.image = {
          url: fileUrl,
          publicId: publicId || null,
        };
      }
    }

    // Update fields
    if (title) announcement.title = title;
    if (content !== undefined) announcement.content = content;
    if (priority) announcement.priority = priority;
    if (eventDate !== undefined) {
      announcement.eventDate = eventDate ? new Date(eventDate) : null;
    }

    // Handle targetYears
    if (targetYears !== undefined) {
      let targetYearsArray = [];
      if (Array.isArray(targetYears)) {
        targetYearsArray = targetYears.filter(y => ["1st", "2nd", "3rd", "4th"].includes(y));
      } else if (typeof targetYears === 'string') {
        targetYearsArray = [targetYears].filter(y => ["1st", "2nd", "3rd", "4th"].includes(y));
      }
      announcement.targetYears = targetYearsArray;
    }

    await announcement.save();

    // Emit real-time update
    emitAnnouncementUpdate("student", {
      type: "update",
      announcement: {
        _id: announcement._id,
        title: announcement.title,
        content: announcement.content,
        priority: announcement.priority,
        image: announcement.image,
        clubId: announcement.clubId,
        clubName: club.clubName,
        clubImage: club.imageUrl,
        targetYears: announcement.targetYears,
        eventDate: announcement.eventDate,
        updatedAt: announcement.updatedAt,
      },
    });

    // Send push notifications to selected year students only (if targetYears updated)
    if (targetYears !== undefined && announcement.targetYears && announcement.targetYears.length > 0) {
      try {
        // Map year to semester ranges: 1st = 1-2, 2nd = 3-4, 3rd = 5-6, 4th = 7-8
        const yearToSemesterMap = {
          "1st": ["1", "2"],
          "2nd": ["3", "4"],
          "3rd": ["5", "6"],
          "4th": ["7", "8"],
        };

        // Get all semester strings for selected years
        const targetSemesters = [];
        announcement.targetYears.forEach(year => {
          const semesters = yearToSemesterMap[year];
          if (semesters) {
            targetSemesters.push(...semesters);
          }
        });

        // Find students in the selected years (by semester)
        const students = await StudentDetails.find({
          collegeId,
          semester: { $in: targetSemesters },
        })
          .select("studentid fcmToken semester")
          .lean();

        // Filter students by FCM token
        const studentTokens = students
          .map(s => s.fcmToken)
          .filter(token => token && token.trim() !== "");

        if (studentTokens.length > 0) {
          await sendBatchNotifications(
            studentTokens,
            `Club Event Updated: ${announcement.title}`,
            `From ${club.clubName} - ${announcement.content.length > 100 ? announcement.content.substring(0, 100) + "..." : announcement.content}`,
            {
              type: "club_announcement_updated",
              announcementId: announcement._id.toString(),
              clubId: club.clubId,
              clubName: club.clubName,
              targetYears: announcement.targetYears.join(","),
              priority: announcement.priority || "medium",
              timestamp: new Date().toISOString(),
            }
          );
          console.log(`Sent club announcement update notification to ${studentTokens.length} students (years: ${announcement.targetYears.join(", ")})`);
        }
      } catch (notifError) {
        console.error("Error sending club announcement update notifications:", notifError);
      }
    }

    // Return updated announcement with club details
    const announcementResponse = {
      ...announcement.toObject(),
      clubName: club.clubName,
      clubImage: club.imageUrl,
    };

    return res.status(200).json({
      success: true,
      message: "Club announcement updated successfully",
      data: announcementResponse,
    });
  } catch (error) {
    console.error("Update club announcement error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Delete a club announcement (only creator can delete)
 */
export const deleteClubAnnouncement = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { id } = req.params;

    // Find announcement
    const announcement = await Announcement.findOne({
      _id: id,
      collegeId,
      clubId: { $ne: null }, // Must be a club announcement
    });

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Club announcement not found",
      });
    }

    // Check permissions
    const { canModify, reason } = await canModifyClubAnnouncement(announcement, req.user);
    if (!canModify) {
      return res.status(403).json({
        success: false,
        message: reason || "You don't have permission to delete this announcement",
      });
    }

    // Delete announcement
    await Announcement.deleteOne({ _id: id });

    // Emit real-time update
    emitAnnouncementUpdate("student", {
      type: "delete",
      announcementId: id,
    });

    return res.status(200).json({
      success: true,
      message: "Club announcement deleted successfully",
    });
  } catch (error) {
    console.error("Delete club announcement error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

