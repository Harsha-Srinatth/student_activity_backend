import StudentDetails from "../../models/studentDetails.js";

// Upload certificate/workshop/club/internship/project proof
const studentDocUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const {
      type,
      title,
      issuer,
      organizer,
      organization, // fixed
      role,
      startDate,
      endDate,
      description,
      technologies,
      repoLink,
      demoLink,
      outcome,
      recommendationUrl,
      date,
    } = req.body;

    const studentid = req.user.studentid;
    const student = await StudentDetails.findOne({ studentid });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // File uploaded → Cloudinary URL
    const fileUrl = req.file?.path || req.file?.secure_url;

    // Validate required fields for each type
    if (type === "certificate") {
      if (!title || !issuer) {
        return res.status(400).json({ error: "Title and Issuer are required for certificates." });
      }
      student.certifications.push({
        title,
        issuer,
        dateIssued: date,
        imageUrl: fileUrl,
        verification: { status: "pending" },
      });
      student.pendingApprovals.push({
        type: "certificate",
        description: title,
        verification: { status: "pending" },
      });
    } else if (type === "workshop") {
      if (!title || !organizer) {
        return res.status(400).json({ error: "Title and Organizer are required for workshops." });
      }
      student.workshops.push({
        title,
        organizer,
        date,
        certificateUrl: fileUrl,
        verification: { status: "pending" },
      });
      student.pendingApprovals.push({
        type: "workshop",
        description: title,
      });
    } else if (type === "club") {
      if (!title) {
        return res.status(400).json({ error: "Club name is required." });
      }
      student.clubsJoined.push({
        name: title,
        role: role || "member",
        joinedOn: date,
        imageUrl: fileUrl,
        verification: { status: "pending" },
      });
      student.pendingApprovals.push({
        type: "club",
        description: title,
        imageUrl: fileUrl,
      });
    } else if (type === "internship") {
      if (!organization || !role || !startDate || !endDate) {
        return res.status(400).json({ error: "Organization, Role, Start Date, and End Date are required for internships." });
      }
      student.internships = student.internships || [];
      student.internships.push({
        organization,
        role,
        startDate,
        endDate,
        description,
        recommendationUrl,
        imageUrl: fileUrl,
        verification: { status: "pending" },
      });
      student.pendingApprovals.push({
        type: "internship",
        description: `${organization} - ${role}`,
        imageUrl: fileUrl,
      });
    } else if (type === "project") {
      if (!title) {
        return res.status(400).json({ error: "Project title is required." });
      }
      student.projects = student.projects || [];
      student.projects.push({
        title,
        description,
        technologies: technologies ? technologies.split(",") : [],
        outcome,
        repoLink,
        demoLink,
        imageUrl: fileUrl,
        verification: { status: "pending" },
      });
      student.pendingApprovals.push({
        type: "project",
        description: title,
        imageUrl: fileUrl,
      });
    } else {
      if (!description) {
        return res.status(400).json({ error: "Description is required for other document types." });
      }
      student.pendingApprovals.push({
        type: "other",
        description,
      });
    }

    await student.save();
    res.json({ message: `${type} uploaded successfully`, student });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
};

export default studentDocUpload;