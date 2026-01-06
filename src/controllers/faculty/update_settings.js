import FacultyDetails from "../../models/faculty/facultyDetails.js";

const updateFacultySettings = async (req, res) => {
  try {
    const facultyid = req.user?.facultyid;
    if (!facultyid) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const allowedFields = [
      "fullname",
      "mobile",
      "designation",
      "dept",
      "institution",
      "notificationsEnabled",
      "emailNotifications",
    ];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const faculty = await FacultyDetails.findOneAndUpdate(
      { facultyid },
      { $set: updates },
      { new: true }
    ).select(
      "facultyid fullname email mobile designation dept institution image notificationsEnabled emailNotifications"
    );

    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    return res.json({ message: "Settings updated", faculty });
  } catch (error) {
    console.error("Error updating faculty settings:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export default updateFacultySettings;


