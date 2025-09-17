import StudentDetails from "../../models/studentDetails.js";

const AddProfile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const studentid = req.user.studentid;
    const student = await StudentDetails.findOne({ studentid });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Get file URL (Cloudinary or local storage)
    const fileUrl = req.file?.path || req.file?.secure_url;

    // Save image to student profile
    student.image = {
      url: fileUrl,
    };

    await student.save();

    return res.status(200).json({
      message: "Profile photo updated successfully",
      image: student.image,
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ message: "Internal Server error" });
  }
};

export default AddProfile;