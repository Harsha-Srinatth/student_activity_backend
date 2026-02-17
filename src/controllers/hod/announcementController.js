import Announcement from "../../models/shared/announcementSchema.js";
import HOD from "../../models/Hod/hodDetails.js";
import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";
import { emitAnnouncementUpdate } from "../../utils/socketEmitter.js";
import { sendNotificationsToStudents, sendNotificationToHOD, sendBatchNotifications } from "../../utils/firebaseNotification.js";

/**
 * Create a new announcement
 */
export const createAnnouncement = async (req, res) => {
  try {
    const { hodId, collegeId } = req.user;
    const { title, content, targetAudience, priority, expiresAt } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    if (!hodId) {
      return res.status(400).json({ message: "HOD ID is required" });
    }

    const hod = await HOD.findOne({ hodId: hodId }).select("fullname");
    if (!hod) {
      return res.status(404).json({ message: "HOD not found" });
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

    // Handle targetAudience - it can be a string or array from FormData
    let targetAudienceArray = ["both"];
    if (targetAudience) {
      if (Array.isArray(targetAudience)) {
        targetAudienceArray = targetAudience;
      } else if (typeof targetAudience === 'string') {
        targetAudienceArray = [targetAudience];
      }
    }

    const announcement = new Announcement({
      title,
      content,
      collegeId,
      targetAudience: targetAudienceArray,
      priority: priority || "medium",
      createdBy: {
        hodId: hodId,
        creatorRole: "hod",
      },
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
      image: imageData,
    });

    await announcement.save();

    // Emit real-time update via Socket.IO
    // Always emit to HOD, and also to target audience
    const rolesToEmit = targetAudienceArray && targetAudienceArray.length === 1 
      ? [targetAudienceArray[0], "hod"] 
      : null; // null means emit to all
    
    console.log("📡 [SOCKET] Emitting announcement update:", { 
      rolesToEmit, 
      announcementId: announcement._id, 
      title: announcement.title 
    });
    
    // Prepare full announcement data for socket emission
    const announcementData = {
      _id: announcement._id,
      title: announcement.title,
      content: announcement.content,
      priority: announcement.priority,
      image: announcement.image,
      targetAudience: announcement.targetAudience,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
      expiresAt: announcement.expiresAt,
      isActive: announcement.isActive,
      createdBy: announcement.createdBy,
    };

    if (rolesToEmit) {
      // Emit to specific roles
      rolesToEmit.forEach(role => {
        emitAnnouncementUpdate(role, {
          type: "new",
          announcement: announcementData,
        });
      });
    } else {
      // Emit to all roles
      emitAnnouncementUpdate(null, {
        type: "new",
        announcement: announcementData,
      });
    }

    // Send push notifications based on target audience
    try {
      const shouldNotifyStudents = targetAudienceArray.includes("student") || targetAudienceArray.includes("both");
      const shouldNotifyFaculty = targetAudienceArray.includes("faculty") || targetAudienceArray.includes("both");

      // Send notifications to students
      if (shouldNotifyStudents) {
        try {
          const students = await StudentDetails.find({ collegeId })
            .select("studentid fcmToken")
            .lean();
          
          const studentTokens = students
            .map(s => s.fcmToken)
            .filter(token => token && token.trim() !== "");

          if (studentTokens.length > 0) {
            console.log(`🔔 [HOD Announcement] Sending notifications to ${studentTokens.length} students`);
            await sendBatchNotifications(
              studentTokens,
              `New Announcement: ${title}`,
              content.length > 100 ? content.substring(0, 100) + "..." : content,
              {
                type: "announcement",
                announcementId: announcement._id.toString(),
                priority: priority || "medium",
                timestamp: new Date().toISOString(),
              }
            );
            console.log(`✅ [HOD Announcement] Notification sent to ${studentTokens.length} students`);
          } else {
            console.log(`⚠️ [HOD Announcement] No student FCM tokens found to send notifications`);
          }
        } catch (studentNotifError) {
          console.error("Error sending notifications to students:", studentNotifError);
        }
      }

      // Send notifications to faculty
      if (shouldNotifyFaculty) {
        try {
          const faculty = await FacultyDetails.find({ collegeId })
            .select("facultyid fcmToken")
            .lean();
          
          const facultyTokens = faculty
            .map(f => f.fcmToken)
            .filter(token => token && token.trim() !== "");

          if (facultyTokens.length > 0) {
            console.log(`🔔 [HOD Announcement] Sending notifications to ${facultyTokens.length} faculty`);
            await sendBatchNotifications(
              facultyTokens,
              `New Announcement: ${title}`,
              content.length > 100 ? content.substring(0, 100) + "..." : content,
              {
                type: "announcement",
                announcementId: announcement._id.toString(),
                priority: priority || "medium",
                timestamp: new Date().toISOString(),
              }
            );
            console.log(`✅ [HOD Announcement] Notification sent to ${facultyTokens.length} faculty`);
          } else {
            console.log(`⚠️ [HOD Announcement] No faculty FCM tokens found to send notifications`);
          }
        } catch (facultyNotifError) {
          console.error("Error sending notifications to faculty:", facultyNotifError);
        }
      }

      // Send confirmation notification to HOD
      try {
        console.log(`🔔 [HOD Announcement] Sending confirmation notification to HOD: ${hodId}`);
        await sendNotificationToHOD(
          hodId,
          "Announcement Created ✓",
          `Your announcement "${title}" has been published successfully to ${targetAudienceArray.join(", ")}`,
          {
            type: "announcement_created",
            announcementId: announcement._id.toString(),
            targetAudience: targetAudienceArray.join(","),
            timestamp: new Date().toISOString(),
          }
        );
        console.log(`✅ [HOD Announcement] Confirmation notification sent to HOD`);
      } catch (hodNotifError) {
        console.error("❌ [HOD Announcement] Error sending notification to HOD:", hodNotifError);
      }
    } catch (notifError) {
      console.error("Error sending push notifications:", notifError);
      // Don't fail the request if notifications fail
    }

    return res.status(201).json({
      success: true,
      message: "Announcement created successfully",
      data: announcement,
    });
  } catch (error) {
    console.error("Create announcement error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get all announcements for HOD's college
 */
export const getAnnouncements = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { targetAudience, isActive, page = 1, limit = 20, includeExpired } = req.query;

    const query = { collegeId };
    
    if (targetAudience) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { targetAudience: targetAudience },
          { targetAudience: "both" }
        ]
      });
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    } else {
      query.isActive = true;
    }

    if (includeExpired === "false") {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { expiresAt: null },
          { expiresAt: { $gte: new Date() } }
        ]
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const announcements = await Announcement.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Announcement.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: announcements || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total || 0,
        pages: Math.ceil((total || 0) / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get announcements error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get single announcement
 */
export const getAnnouncementById = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { id } = req.params;

    const announcement = await Announcement.findOne({
      _id: id,
      collegeId,
    });

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    return res.status(200).json({
      success: true,
      data: announcement,
    });
  } catch (error) {
    console.error("Get announcement error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update announcement
 */
export const updateAnnouncement = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { id } = req.params;
    const { title, content, targetAudience, priority, isActive, expiresAt } = req.body;

    const announcement = await Announcement.findOne({
      _id: id,
      collegeId,
    });

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
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

    if (title) announcement.title = title;
    if (content) announcement.content = content;
    
    if (targetAudience) {
      if (Array.isArray(targetAudience)) {
        announcement.targetAudience = targetAudience;
      } else if (typeof targetAudience === 'string') {
        announcement.targetAudience = [targetAudience];
      }
    }
    
    if (priority) announcement.priority = priority;
    if (isActive !== undefined) announcement.isActive = isActive;
    if (expiresAt !== undefined) {
      announcement.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }

    await announcement.save();

    // Emit real-time update with full announcement data
    const announcementData = {
      _id: announcement._id,
      title: announcement.title,
      content: announcement.content,
      priority: announcement.priority,
      image: announcement.image,
      targetAudience: announcement.targetAudience,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
      expiresAt: announcement.expiresAt,
      isActive: announcement.isActive,
      createdBy: announcement.createdBy,
    };
    
    emitAnnouncementUpdate(
      announcement.targetAudience && announcement.targetAudience.length === 1 
        ? announcement.targetAudience[0] 
        : null,
      {
        type: "update",
        announcement: announcementData,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Announcement updated successfully",
      data: announcement,
    });
  } catch (error) {
    console.error("Update announcement error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Delete announcement
 */
export const deleteAnnouncement = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { id } = req.params;

    const announcement = await Announcement.findOne({
      _id: id,
      collegeId,
    });

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    await Announcement.deleteOne({ _id: id, collegeId });

    // Emit real-time update
    emitAnnouncementUpdate(
      announcement.targetAudience && announcement.targetAudience.length === 1 
        ? announcement.targetAudience[0] 
        : null,
      {
        type: "delete",
        announcementId: id,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Announcement deleted successfully",
    });
  } catch (error) {
    console.error("Delete announcement error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

