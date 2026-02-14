import FacultyDetails from "../../models/faculty/facultyDetails.js";

/**
 * Get faculty information by facultyId
 */
export const getFacultyByFacultyId = async (req, res) => {
  try {
    const { facultyId } = req.params;

    if (!facultyId) {
      return res.status(400).json({ 
        success: false,
        message: "Faculty ID is required" 
      });
    }

    const faculty = await FacultyDetails.findOne({ facultyid: facultyId })
      .select("facultyid fullname email designation collegeId dept")
      .lean();

    if (!faculty) {
      return res.status(404).json({ 
        success: false,
        message: "Faculty not found" 
      });
    }

    return res.status(200).json({
      success: true,
      data: faculty,
    });
  } catch (error) {
    console.error("Get faculty by ID error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
};

/**
 * Search faculty by name or ID
 */
export const searchFaculty = async (req, res) => {
  try {
    const { query, collegeId } = req.query;

    console.log("Faculty search request:", { query, collegeId });

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        success: false,
        message: "Search query must be at least 2 characters" 
      });
    }

    // Build search query
    const searchQuery = {
      $or: [
        { facultyid: { $regex: query.trim(), $options: "i" } },
        { fullname: { $regex: query.trim(), $options: "i" } }
      ]
    };

    // Optionally filter by collegeId if provided
    // Use case-insensitive matching for collegeId
    if (collegeId && collegeId.trim()) {
      searchQuery.collegeId = { $regex: `^${collegeId.trim()}$`, $options: "i" };
    }

    console.log("MongoDB search query:", JSON.stringify(searchQuery, null, 2));

    const faculty = await FacultyDetails.find(searchQuery)
      .select("facultyid fullname email designation collegeId dept")
      .limit(20)
      .lean();

    console.log(`Found ${faculty.length} faculty matching search`);

    return res.status(200).json({
      success: true,
      data: faculty,
    });
  } catch (error) {
    console.error("Search faculty error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error",
      error: error.message 
    });
  }
};

