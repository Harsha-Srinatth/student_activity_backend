import StudentDetails from "../../models/student/studentDetails.js";

// Upload certificate/workshop/club/internship/project proof
const studentDocUpload = async (req, res) => {
  try {
    const {
      type,
      title,
      issuer,
      organizer,
      organization,
      role,
      startDate,
      endDate,
      description,
      technologies,
      repoLink,
      demoLink,
      outcome,
      projectUrl,
      date,
      dateIssued,
      certificateUrl,
      clubName,
      joinedOn,
    } = req.body;

    const studentid = req.user.studentid;
    const student = await StudentDetails.findOne({ studentid });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // File uploaded → Cloudinary URL (optional for "other" type)
    const fileUrl = req.file?.path || req.file?.secure_url;
    const requiresFile = ["certificate", "workshop", "club", "internship", "project"].includes(type);
    
    if (requiresFile && !req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Validate required fields for each type
    if (type === "certificate") {
      if (!title) {
        return res.status(400).json({ error: "Title is required for certificates." });
      }
      student.certifications.push({
        title,
        issuer,
        dateIssued: dateIssued || date,
        imageUrl: fileUrl,
        verification: { status: "pending" },
      });
    } else if (type === "workshop") {
      if (!title) {
        return res.status(400).json({ error: "Title is required for workshops." });
      }
      student.workshops.push({
        title,
        organizer,
        date,
        certificateUrl: certificateUrl || fileUrl,
        imageUrl: fileUrl,
        verification: { status: "pending" },
      });
    } else if (type === "club") {
      if (!clubName || !title) {
        return res.status(400).json({ error: "Club name and title are required." });
      }
      student.clubsJoined.push({
        clubName,
        title,
        role: role || "member",
        joinedOn: joinedOn ? new Date(joinedOn) : new Date(),
        imageUrl: fileUrl,
        verification: { status: "pending" },
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
        projectUrl,
        imageUrl: fileUrl,
        verification: { status: "pending" },
      });
    } else if (type === "project") {
      if (!title) {
        return res.status(400).json({ error: "Project title is required." });
      }
      student.projects = student.projects || [];
      student.projects.push({
        title,
        outcome,
        technologies: technologies ? technologies.split(",").map(t => t.trim()).filter(t => t) : [],
        repoLink,
        demoLink,
        description,
        imageUrl: fileUrl,
        verification: { status: "pending" },
      });
    } else if (type === "other") {
      if (!title) {
        return res.status(400).json({ error: "Title is required for other document types." });
      }
      student.others = student.others || [];
      student.others.push({
        title,
        outcome,
        description,
        imageUrl: fileUrl,
        verification: { status: "pending" },
      });
    } else {
      return res.status(400).json({ error: "Invalid document type." });
    }

    await student.save();
    res.json({ message: `${type} uploaded successfully`, student });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
};

export default studentDocUpload;