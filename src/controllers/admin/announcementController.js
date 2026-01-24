import Announcement from "../../models/shared/announcementSchema.js";
import Admin from "../../models/shared/Administrator.js";
import { emitAnnouncementUpdate } from "../../utils/socketEmitter.js";

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

    const announcement = new Announcement({
      title,
      content,
      collegeId,
      targetAudience: targetAudience || ["both"],
      priority: priority || "medium",
      createdBy: {
        adminId,
        adminName: admin.fullname || "Admin",
      },
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
    });

    await announcement.save();

    // Emit real-time update via Socket.IO
    emitAnnouncementUpdate(
      targetAudience && targetAudience.length === 1 ? targetAudience[0] : null,
      {
        type: "new",
        announcement: {
          _id: announcement._id,
          title: announcement.title,
          content: announcement.content,
          priority: announcement.priority,
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

    return res.status(200).json({
      success: true,
      data: announcements,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
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
    const { adminId, collegeId } = req.user;
    const { id } = req.params;
    const { title, content, targetAudience, priority, isActive, expiresAt } = req.body;

    const announcement = await Announcement.findOne({
      _id: id,
      collegeId,
      "createdBy.adminId": adminId,
    });

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    if (title) announcement.title = title;
    if (content) announcement.content = content;
    if (targetAudience) announcement.targetAudience = targetAudience;
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
    const { adminId, collegeId } = req.user;
    const { id } = req.params;

    const announcement = await Announcement.findOne({
      _id: id,
      collegeId,
      "createdBy.adminId": adminId,
    });

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    await Announcement.deleteOne({ _id: id });

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

