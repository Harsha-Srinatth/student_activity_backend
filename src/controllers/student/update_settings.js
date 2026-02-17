import StudentDetails from "../../models/student/studentDetails.js";
import bcrypt from "bcryptjs";

const updateStudentSettings = async (req, res) => {
  try {
    const studentid = req.user?.studentid;
    if (!studentid) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const allowedFields = [
      "fullname",
      "username",
      "email",
      "password",
      "image",
      "dept",
      "programName",
      "semester",
      "facultyid",
      "fcmToken",
    ];
    const updates = {};
    
    // Process allowed fields
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        // Special handling for password - hash it before saving
        if (key === "password") {
          if (req.body[key].trim().length < 8) {
            return res.status(400).json({ 
              message: "Password must be at least 8 characters long" 
            });
          }
          updates[key] = await bcrypt.hash(req.body[key], 12);
        } 
        // Special handling for image - it's an object with url property
        else if (key === "image" && typeof req.body[key] === "string") {
          updates["image.url"] = req.body[key];
        } 
        // For other fields, set directly
        else if (key !== "image") {
          updates[key] = req.body[key];
        }
      }
    }

    // If no updates provided
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    // Validate email format if email is being updated
    if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const student = await StudentDetails.findOneAndUpdate(
      { studentid },
      { $set: updates },
      { new: true, runValidators: true }
    ).select(
      "studentid fullname username email image dept programName semester facultyid"
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    return res.json({ message: "Profile updated successfully", student });
  } catch (error) {
    console.error("Error updating student profile:", error);
    
    // Handle duplicate key errors (unique constraint violations)
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0];
      return res.status(400).json({ 
        message: `${field} already exists. Please use a different ${field}.` 
      });
    }
    
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export default updateStudentSettings;


