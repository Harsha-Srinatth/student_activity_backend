import Announcement from "../../models/shared/announcementSchema.js";
import ClubDetail from "../../models/shared/clubSchema.js";

/**
 * Get announcements for students/faculty based on their role and collegeId
 */
export const getAnnouncementsForUser = async (req, res) => {
  try {
    const { collegeId, role } = req.user;
    
    if (!collegeId) {
      return res.status(400).json({ message: "College ID not found in token" });
    }

    // Build query - announcements that are active, not expired, and target the user's role
    // targetAudience is an array, so we check if it contains the role or "both"
    // In MongoDB, querying an array field directly checks if the array contains that value
    const finalQuery = {
      collegeId,
      isActive: true,
      $and: [
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $gte: new Date() } }
          ]
        },
        {
          $or: [
            { targetAudience: role },
            { targetAudience: "both" }
          ]
        }
      ]
    };

    // Debug logging
    const currentDate = new Date();
    console.log("=".repeat(50));
    console.log("Fetching announcements for:", { collegeId, role });
    console.log("Current date:", currentDate.toISOString());
    console.log("Query:", JSON.stringify(finalQuery, null, 2));

    // Also check what announcements exist in DB for debugging
    const allAnnouncements = await Announcement.find({ collegeId })
      .select("title targetAudience expiresAt isActive createdAt")
      .limit(5)
      .sort({ createdAt: -1 });
    
    console.log(`Total announcements in DB for collegeId ${collegeId}:`, allAnnouncements.length);
    allAnnouncements.forEach((ann, idx) => {
      const isExpired = ann.expiresAt && ann.expiresAt < currentDate;
      const matchesRole = ann.targetAudience.includes(role) || ann.targetAudience.includes("both");
      console.log(`  [${idx + 1}] "${ann.title}" - expiresAt: ${ann.expiresAt?.toISOString() || 'null'}, isExpired: ${isExpired}, matchesRole: ${matchesRole}, isActive: ${ann.isActive}, targetAudience: ${JSON.stringify(ann.targetAudience)}`);
    });

    const announcements = await Announcement.find(finalQuery)
      .sort({ createdAt: -1 })
      .limit(50)
      .select("title content priority createdAt targetAudience expiresAt isActive image clubId targetYears eventDate createdBy participationOrRegistrationLink")
      .lean();

    // Get unique clubIds from announcements
    const clubIds = [...new Set(announcements.filter(a => a.clubId).map(a => a.clubId))];
    
    // Batch fetch all clubs at once (optimized)
    const clubsMap = {};
    if (clubIds.length > 0) {
      const clubs = await ClubDetail.find({ clubId: { $in: clubIds } })
        .select("clubId clubName imageUrl")
        .lean();
      
      // Create a map for O(1) lookup
      clubs.forEach(club => {
        clubsMap[club.clubId] = {
          clubName: club.clubName,
          clubImage: club.imageUrl,
        };
      });
    }

    // Map announcements with club details
    const announcementsWithClubDetails = announcements.map((announcement) => {
      if (announcement.clubId && clubsMap[announcement.clubId]) {
        return {
          ...announcement,
          clubName: clubsMap[announcement.clubId].clubName,
          clubImage: clubsMap[announcement.clubId].clubImage,
        };
      }
      return announcement;
    });

    console.log(`Found ${announcementsWithClubDetails.length} announcements matching query`);
    console.log("=".repeat(50));

    return res.status(200).json({
      success: true,
      data: announcementsWithClubDetails,
    });
  } catch (error) {
    console.error("Get announcements for user error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

