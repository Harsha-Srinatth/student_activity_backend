import StudentDetails from "../../models/student/studentDetails.js";
import { 
  emitStudentDashboardDataUpdate,
  emitFacultyPendingApprovalsUpdate,
  emitUserNotification
} from "../../utils/socketEmitter.js";
import { sendNotificationToFaculty } from "../../utils/firebaseNotification.js";

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
    
    // Emit real-time updates
    try {
      // Update student dashboard
      await emitStudentDashboardDataUpdate(studentid);
      
      // Notify faculty if they're connected
      if (student.facultyid) {
        // Get updated pending approvals count for faculty
        const students = await StudentDetails.find({ facultyid: student.facultyid })
          .select('certifications workshops clubsJoined projects internships others studentid')
          .lean();
        
        // Build pending approvals list
        const pendingApprovals = [];
        students.forEach(s => {
          const normalizeStatus = (v) => !v || !v.status || v.status === 'pending' ? 'pending' : v.status;
          [...(s.certifications || [])].forEach(c => {
            if (normalizeStatus(c.verification) === 'pending') {
              pendingApprovals.push({ 
                studentid: s.studentid, 
                type: 'certificate', 
                description: c.title,
                imageUrl: c.imageUrl
              });
            }
          });
          [...(s.workshops || [])].forEach(w => {
            if (normalizeStatus(w.verification) === 'pending') {
              pendingApprovals.push({ 
                studentid: s.studentid, 
                type: 'workshop', 
                description: w.title,
                imageUrl: w.certificateUrl || w.imageUrl
              });
            }
          });
          [...(s.clubsJoined || [])].forEach(c => {
            if (normalizeStatus(c.verification) === 'pending') {
              pendingApprovals.push({ 
                studentid: s.studentid, 
                type: 'club', 
                description: c.title || c.clubName,
                imageUrl: c.imageUrl
              });
            }
          });
          [...(s.projects || [])].forEach(p => {
            if (normalizeStatus(p.verification) === 'pending') {
              pendingApprovals.push({ 
                studentid: s.studentid, 
                type: 'project', 
                description: p.title,
                imageUrl: p.imageUrl
              });
            }
          });
          [...(s.internships || [])].forEach(i => {
            if (normalizeStatus(i.verification) === 'pending') {
              pendingApprovals.push({ 
                studentid: s.studentid, 
                type: 'internship', 
                description: `${i.organization} - ${i.role}`,
                imageUrl: i.imageUrl
              });
            }
          });
          [...(s.others || [])].forEach(o => {
            if (normalizeStatus(o.verification) === 'pending') {
              pendingApprovals.push({ 
                studentid: s.studentid, 
                type: 'other', 
                description: o.title,
                imageUrl: o.imageUrl
              });
            }
          });
        });
        
        emitFacultyPendingApprovalsUpdate(student.facultyid, pendingApprovals);
        
        // Notify faculty via socket
        emitUserNotification(student.facultyid, {
          type: 'new_submission',
          title: 'New Submission',
          message: `${student.fullname || studentid} uploaded a new ${type}`,
          data: { studentid, type, title }
        });
        
        // Send FCM push notification to faculty
        try {
          await sendNotificationToFaculty(
            student.facultyid,
            "New Achievement Submission 📝",
            `${student.fullname || studentid} uploaded a new ${type}: ${title}`,
            {
              type: "new_submission",
              studentid: studentid,
              submissionType: type,
              title: title,
              timestamp: new Date().toISOString(),
            }
          );
        } catch (notifError) {
          console.error(`Error sending push notification to faculty ${student.facultyid}:`, notifError);
        }
      }
    } catch (socketError) {
      console.error('Error emitting real-time updates:', socketError);
    }
    
    res.json({ message: `${type} uploaded successfully`, student });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
};

export default studentDocUpload;