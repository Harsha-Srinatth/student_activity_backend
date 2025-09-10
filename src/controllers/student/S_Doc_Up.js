import express from "express";
import StudentDetails from "../../models/studentDetails.js";
// import upload from "../../middlewares/upload.js";

const router = express.Router();

// Upload certificate/workshop/club proof
const studentDocUpload = async (req, res) => {
  try {
    const { type, title, issuer, organizer, description, date } = req.body;
    const studentid = req.params.studentid;

    const student = await StudentDetails.findOne({ studentid });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // File uploaded → Cloudinary URL
    const imageUrl = req.file?.path;

    // Decide where to push based on `type`
    if (type === "certificate") {
      student.certifications.push({
        title,
        issuer,
        dateIssued: date,
        imageUrl,
      });
      student.pendingApprovals.push({
        type: "certificate",
        description: title,
      });
    } else if (type === "workshop") {
      student.workshops.push({
        title,
        organizer,
        date,
        certificateUrl: imageUrl,
      });
      student.pendingApprovals.push({
        type: "workshop",
        description: title,
      });
    } else if (type === "club") {
      student.clubsJoined.push({
        name: title,
        role: "member",
        joinedOn: date,
      });
      student.pendingApprovals.push({
        type: "club",
        description: title,
      });
    } else {
      student.pendingApprovals.push({
        type: "other",
        description,
      });
    }

    await student.save();

    res.json({ message: `${type} uploaded successfully`, student });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export default studentDocUpload;