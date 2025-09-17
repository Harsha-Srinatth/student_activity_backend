import StudentDetails from "../../models/studentDetails.js";

const updateStudentSettings = async (req, res) => {
  try {
    const studentid = req.user?.studentid;
    if (!studentid) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const allowedFields = [
      "fullname",
      "mobileno",
      "programName",
      "semester",
      "dept",
      "institution",
    ];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const student = await StudentDetails.findOneAndUpdate(
      { studentid },
      { $set: updates },
      { new: true }
    ).select(
      "studentid fullname email mobileno programName semester dept institution image"
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    return res.json({ message: "Settings updated", student });
  } catch (error) {
    console.error("Error updating student settings:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export default updateStudentSettings;


