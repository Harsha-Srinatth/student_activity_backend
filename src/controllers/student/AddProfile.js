import StudentDetails from "../../models/student/studentDetails.js";

/**
 * POST /student/upload-profile-img
 * Upload and update student profile image
 * Optimized: Single findOneAndUpdate operation
 */
const AddProfile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { studentid } = req.user;
    if (!studentid) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get file URL (Cloudinary or local storage)
    const fileUrl = req.file?.path || req.file?.secure_url;

    if (!fileUrl) {
      return res.status(400).json({ error: "Failed to upload file" });
    }

    // Single operation: find and update
    const student = await StudentDetails.findOneAndUpdate(
      { studentid },
      {
        $set: {
          "image.url": fileUrl
        }
      },
      { new: true, select: "image studentid" }
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Profile photo updated successfully",
      image: student.image,
    });
  } catch (error) {
    console.error("AddProfile error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal Server error",
      error: error.message 
    });
  }
};

export default AddProfile;
