import College from "../../models/shared/collegeSchema.js";

/**
 * Get college information by collegeId
 * Supports exact match and case-insensitive partial match
 */
export const getCollegeByCollegeId = async (req, res) => {
  try {
    const { collegeId } = req.params;

    if (!collegeId) {
      return res.status(400).json({ 
        success: false,
        message: "College ID is required" 
      });
    }

    // Try exact match first (case-sensitive)
    let college = await College.findOne({ collegeId })
      .select("collegeId collegeName collegeAddress collegeCity collegeState collegeCountry collegeZip collegePhone collegeEmail")
      .lean();

    // If not found, try case-insensitive exact match
    if (!college) {
      college = await College.findOne({ 
        collegeId: { $regex: `^${collegeId}$`, $options: "i" } 
      })
        .select("collegeId collegeName collegeAddress collegeCity collegeState collegeCountry collegeZip collegePhone collegeEmail")
        .lean();
    }

    // If still not found, try partial match (for autocomplete during typing)
    if (!college && collegeId.length >= 2) {
      college = await College.findOne({ 
        collegeId: { $regex: collegeId, $options: "i" } 
      })
        .select("collegeId collegeName collegeAddress collegeCity collegeState collegeCountry collegeZip collegePhone collegeEmail")
        .lean();
    }

    if (!college) {
      return res.status(404).json({ 
        success: false,
        message: "College not found" 
      });
    }

    return res.status(200).json({
      success: true,
      data: college,
    });
  } catch (error) {
    console.error("Get college by ID error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
};

/**
 * Search colleges by name or ID
 */
export const searchColleges = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }

    const colleges = await College.find({
      $or: [
        { collegeId: { $regex: query, $options: "i" } },
        { collegeName: { $regex: query, $options: "i" } }
      ]
    })
      .select("collegeId collegeName")
      .limit(20)
      .lean();

    return res.status(200).json({
      success: true,
      data: colleges,
    });
  } catch (error) {
    console.error("Search colleges error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

