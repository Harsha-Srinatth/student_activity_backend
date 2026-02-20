import Announcement from "../../models/shared/announcementSchema.js";
import Admin from "../../models/shared/Administrator.js";
import { emitAnnouncementUpdate } from "../../utils/socketEmitter.js";
import { sendBatchNotifications } from "../../utils/firebaseNotification.js";
import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";

/**
 * Create a new announcement
 */
export const createAnnouncement = async (req, res) => {
  try {
    const { adminId, collegeId } = req.user;
    const { title, content, targetAudience, priority, expiresAt } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const admin = await Admin.findOne({ adminId }).select("fullname");
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Handle image upload if present
    let imageData = null;
    if (req.file) {
      // req.file is provided by multer middleware with CloudinaryStorage
      // CloudinaryStorage provides: path (URL), filename (public_id)
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
        adminId,
        adminName: admin.fullname || "Admin",
        creatorRole: "admin",
      },
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
      image: imageData,
    });

    await announcement.save();

    // Emit real-time update via Socket.IO
    // Expand "both" to ["student", "faculty"] for socket emission
    const rolesToEmit = [];
    
    // Expand targetAudience to actual roles
    if (targetAudienceArray && targetAudienceArray.length > 0) {
      targetAudienceArray.forEach(audience => {
        if (audience === "both") {
          // "both" means emit to both student and faculty
          if (!rolesToEmit.includes("student")) rolesToEmit.push("student");
          if (!rolesToEmit.includes("faculty")) rolesToEmit.push("faculty");
        } else if (audience === "student" || audience === "faculty") {
          // Add specific role if not already added
          if (!rolesToEmit.includes(audience)) rolesToEmit.push(audience);
        }
      });
    } else {
      // If no target audience specified, emit to all
      rolesToEmit.push("student", "faculty");
    }
    
    console.log("📡 [SOCKET] Admin emitting announcement update:", { 
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

    // Emit to each role separately
    rolesToEmit.forEach(role => {
      emitAnnouncementUpdate(role, {
        type: "new",
        announcement: announcementData,
      });
    });

    // Send push notifications based on target audience
    try {
      const { collegeId } = req.user;
      const shouldNotifyStudents = targetAudienceArray.includes("student") || targetAudienceArray.includes("both");
      const shouldNotifyFaculty = targetAudienceArray.includes("faculty") || targetAudienceArray.includes("both");

      // Send notifications to students
      if (shouldNotifyStudents) {
        try {
          const students = await StudentDetails.find({ collegeId })
            .select("studentid fcmDevices")
            .lean();
          
          // Collect all FCM tokens from all devices
          const studentTokens = [];
          students.forEach(student => {
            if (student.fcmDevices && student.fcmDevices.length > 0) {
              student.fcmDevices.forEach(device => {
                if (device.token && device.token.trim() !== "") {
                  studentTokens.push(device.token);
                }
              });
            }
          });

          if (studentTokens.length > 0) {
            const studentCount = students.length;
            console.log(`🔔 [Admin Announcement] Sending notifications to ${studentCount} students (${studentTokens.length} device tokens)`);
            await sendBatchNotifications(
              studentTokens,
              `New Announcement: ${title}`,
              content.length > 100 ? content.substring(0, 100) + "..." : content,
              {
                type: "announcement",
                announcementId: announcement._id.toString(),
                priority: priority || "medium",
                timestamp: new Date().toISOString(),
                link: "/student/announcements",
              }
            );
            console.log(`✅ [Admin Announcement] Notification sent to ${studentCount} students (${studentTokens.length} tokens)`);
          }
        } catch (studentNotifError) {
          console.error("Error sending notifications to students:", studentNotifError);
        }
      }

      // Send notifications to faculty
      if (shouldNotifyFaculty) {
        try {
          const faculty = await FacultyDetails.find({ collegeId })
            .select("facultyid fcmDevices")
            .lean();
          
          // Collect all FCM tokens from all devices
          const facultyTokens = [];
          faculty.forEach(f => {
            if (f.fcmDevices && f.fcmDevices.length > 0) {
              f.fcmDevices.forEach(device => {
                if (device.token && device.token.trim() !== "") {
                  facultyTokens.push(device.token);
                }
              });
            }
          });

          if (facultyTokens.length > 0) {
            const facultyCount = faculty.length;
            console.log(`🔔 [Admin Announcement] Sending notifications to ${facultyCount} faculty (${facultyTokens.length} device tokens)`);
            await sendBatchNotifications(
              facultyTokens,
              `New Announcement: ${title}`,
              content.length > 100 ? content.substring(0, 100) + "..." : content,
              {
                type: "announcement",
                announcementId: announcement._id.toString(),
                priority: priority || "medium",
                timestamp: new Date().toISOString(),
                link: "/faculty/announcements",
              }
            );
            console.log(`✅ [Admin Announcement] Notification sent to ${facultyCount} faculty (${facultyTokens.length} tokens)`);
          }
        } catch (facultyNotifError) {
          console.error("Error sending notifications to faculty:", facultyNotifError);
        }
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
 * Get all announcements for admin's college
 */
export const getAnnouncements = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { targetAudience, isActive, page = 1, limit = 20, includeExpired } = req.query;

    const query = { collegeId };
    
    if (targetAudience) {
      // targetAudience is an array, check if it contains the specified value or "both"
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
      // By default, only show active announcements
      query.isActive = true;
    }

    // Admin should see ALL announcements (including expired) for management purposes
    // Only filter expired if explicitly requested via includeExpired=false
    if (includeExpired === "false") {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { expiresAt: null },
          { expiresAt: { $gte: new Date() } }
        ]
      });
    }
    // Otherwise, show all announcements regardless of expiration (for admin management)

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Debug logging
    console.log("Admin fetching announcements for collegeId:", collegeId);
    console.log("Query:", JSON.stringify(query, null, 2));

    const announcements = await Announcement.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Announcement.countDocuments(query);

    console.log(`Admin found ${announcements.length} announcements (total: ${total})`);
    console.log(`Announcements data:`, announcements.map(a => ({ id: a._id, title: a.title })));

    // Always return an array, even if empty
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
 * Any admin from the same college can update any announcement (not just their own)
 */
export const updateAnnouncement = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { id } = req.params;
    const { title, content, targetAudience, priority, isActive, expiresAt } = req.body;

    // Check if announcement exists and belongs to the same college
    const announcement = await Announcement.findOne({
      _id: id,
      collegeId,
    });

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    // Handle image upload if present
    if (req.file) {
      // req.file is provided by multer middleware with CloudinaryStorage
      const fileUrl = req.file.path || req.file.secure_url;
      const publicId = req.file.filename || req.file.public_id;
      
      if (fileUrl) {
        // TODO: Optionally delete old image from Cloudinary if it exists
        // For now, we'll just update with the new image
        announcement.image = {
          url: fileUrl,
          publicId: publicId || null,
        };
      }
    }

    if (title) announcement.title = title;
    if (content) announcement.content = content;
    
    // Handle targetAudience - it can be a string or array from FormData
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

    // Emit real-time update
    // Expand "both" to ["student", "faculty"] for socket emission
    const rolesToEmit = [];
    
    if (announcement.targetAudience && announcement.targetAudience.length > 0) {
      announcement.targetAudience.forEach(audience => {
        if (audience === "both") {
          if (!rolesToEmit.includes("student")) rolesToEmit.push("student");
          if (!rolesToEmit.includes("faculty")) rolesToEmit.push("faculty");
        } else if (audience === "student" || audience === "faculty") {
          if (!rolesToEmit.includes(audience)) rolesToEmit.push(audience);
        }
      });
    } else {
      rolesToEmit.push("student", "faculty");
    }
    
    // Emit to each role separately
    rolesToEmit.forEach(role => {
      emitAnnouncementUpdate(role, {
        type: "update",
        announcement: {
          _id: announcement._id,
          title: announcement.title,
          content: announcement.content,
          priority: announcement.priority,
          image: announcement.image,
          targetAudience: announcement.targetAudience,
          updatedAt: announcement.updatedAt,
        },
      });
    });

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
 * Any admin from the same college can delete any announcement (not just their own)
 */
export const deleteAnnouncement = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { id } = req.params;

    // Check if announcement exists and belongs to the same college
    const announcement = await Announcement.findOne({
      _id: id,
      collegeId,
    });

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    await Announcement.deleteOne({ _id: id, collegeId });

    // Emit real-time update
    // Expand "both" to ["student", "faculty"] for socket emission
    const rolesToEmit = [];
    
    if (announcement.targetAudience && announcement.targetAudience.length > 0) {
      announcement.targetAudience.forEach(audience => {
        if (audience === "both") {
          if (!rolesToEmit.includes("student")) rolesToEmit.push("student");
          if (!rolesToEmit.includes("faculty")) rolesToEmit.push("faculty");
        } else if (audience === "student" || audience === "faculty") {
          if (!rolesToEmit.includes(audience)) rolesToEmit.push(audience);
        }
      });
    } else {
      rolesToEmit.push("student", "faculty");
    }
    
    // Emit to each role separately
    rolesToEmit.forEach(role => {
      emitAnnouncementUpdate(role, {
        type: "delete",
        announcementId: id,
      });
    });

    return res.status(200).json({
      success: true,
      message: "Announcement deleted successfully",
    });
  } catch (error) {
    console.error("Delete announcement error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

