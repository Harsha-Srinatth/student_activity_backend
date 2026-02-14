import Announcement from "../../models/shared/announcementSchema.js";
import HOD from "../../models/Hod/hodDetails.js";
import { emitAnnouncementUpdate } from "../../utils/socketEmitter.js";

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
        adminName: hod.fullname || "HOD",
      },
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
      image: imageData,
    });

    await announcement.save();

    // Emit real-time update via Socket.IO
    emitAnnouncementUpdate(
      targetAudienceArray && targetAudienceArray.length === 1 ? targetAudienceArray[0] : null,
      {
        type: "new",
        announcement: {
          _id: announcement._id,
          title: announcement.title,
          content: announcement.content,
          priority: announcement.priority,
          image: announcement.image,
          createdAt: announcement.createdAt,
        },
      }
    );

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

    // Emit real-time update
    emitAnnouncementUpdate(
      announcement.targetAudience && announcement.targetAudience.length === 1 
        ? announcement.targetAudience[0] 
        : null,
      {
        type: "update",
        announcement: {
          _id: announcement._id,
          title: announcement.title,
          content: announcement.content,
          priority: announcement.priority,
          image: announcement.image,
          updatedAt: announcement.updatedAt,
        },
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

