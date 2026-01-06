import FacultyDetails from "../../models/faculty/facultyDetails.js";

const AddProfileF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const facultyid = req.user.facultyid;
    console.log("faculty id for profile pic upload",facultyid);
    const faculty = await FacultyDetails.findOne({ facultyid });

    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    // Get file URL (Cloudinary or local storage)
    const fileUrl = req.file?.path || req.file?.secure_url;

    // Save image to student profile
    faculty.image = {
      url: fileUrl,
    };

    await faculty.save();

    return res.status(200).json({
      message: "Profile photo updated successfully",
      image: faculty.image,
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ message: "Internal Server error" });
  }
};

export default AddProfileF;