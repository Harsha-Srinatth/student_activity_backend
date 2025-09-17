import StudentDetails from "../../models/studentDetails.js";
import FacultyDetails from "../../models/facultyDetails.js";

const getStudentAchievements = async (req, res) => {
  try {
    const { studentid } = req.user; // From JWT token
    
    console.log("Request received for student:", studentid);
    console.log("Request user:", req.user);

    if (!studentid) {
      return res.status(400).json({ message: "Student ID is required" });
    }

    // Find student with all achievement data
    const student = await StudentDetails.findOne({ studentid })
      .select('studentid fullname email mobileno institution programName dept semester certifications workshops clubsJoined projects internships pendingApprovals')
      .lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }
    const allCertifications = student.certifications || [];
    const allClubs = student.clubsJoined || [];
    const allWorkshops = student.workshops || [];
    const allProjects = student.projects || [];

    // Collect unique faculty ids referenced in verifications or approvals
    const facultyIds = new Set();
    for (const cert of allCertifications) {
      const fid = cert?.verification?.verifiedBy;
      if (fid) facultyIds.add(fid);
    }
    for (const ws of allWorkshops) {
      const fid = ws?.verification?.verifiedBy;
      if (fid) facultyIds.add(fid);
    }
    for (const proj of allProjects) {
      const fid = proj?.verification?.verifiedBy;
      if (fid) facultyIds.add(fid);
    }
    for (const appr of (student.pendingApprovals || [])) {
      const fid = appr?.reviewedBy;
      if (fid) facultyIds.add(fid);
    }

    // Build map of facultyid -> fullname
    const facultyIdToName = new Map();
    if (facultyIds.size > 0) {
      const facultyList = await FacultyDetails.find({ facultyid: { $in: Array.from(facultyIds) } })
        .select('facultyid fullname')
        .lean();
      for (const f of (facultyList || [])) {
        facultyIdToName.set(f.facultyid, f.fullname);
      }
    }

    // Build a quick lookup from pendingApprovals when verification field is missing
    const approvalLookup = new Map();
    for (const appr of (student.pendingApprovals || [])) {
      const status = (appr.status || '').toLowerCase();
      if (status === 'approved' || status === 'rejected') {
        // key format: `${type}:${description}` aligned with where we store titles/names
        const key = `${appr.type}:${appr.description}`.toLowerCase();
        approvalLookup.set(key, {
          status: status === 'approved' ? 'verified' : 'rejected',
          verifiedBy: appr.reviewedBy,
          verifiedById: appr.reviewedBy,
          verifiedByName: appr.reviewedBy ? (facultyIdToName.get(appr.reviewedBy) || undefined) : undefined,
          date: appr.reviewedOn,
          remarks: appr.message,
        });
      }
    }

    const getWithFallbackStatus = (typeKey, description, verification) => {
      // If verification exists, prefer it
      if (verification && verification.status) return {
        status: verification.status,
        verifiedBy: verification.verifiedBy,
        verifiedById: verification.verifiedBy,
        verifiedByName: verification.verifiedBy ? (facultyIdToName.get(verification.verifiedBy) || undefined) : undefined,
        verifiedDate: verification.date,
        remarks: verification.remarks,
      };

      // Else, try to infer from approvals
      const key = `${typeKey}:${description || ''}`.toLowerCase();
      const fromApproval = approvalLookup.get(key);
      if (fromApproval) {
        return {
          status: fromApproval.status,
          verifiedBy: fromApproval.verifiedBy,
          verifiedById: fromApproval.verifiedBy,
          verifiedByName: fromApproval.verifiedBy ? (facultyIdToName.get(fromApproval.verifiedBy) || undefined) : undefined,
          verifiedDate: fromApproval.date,
          remarks: fromApproval.remarks,
        };
      }
      return { status: 'pending' };
    };

    const isVerified = (v) => (v?.verification?.status || '').toLowerCase() === 'verified';

    // Calculate counts - verified only
    const counts = {
      certificationsCount: allCertifications.filter(isVerified).length,
      clubsJoinedCount: allClubs.filter(isVerified).length,
      workshopsCount: allWorkshops.filter(isVerified).length,
      projectsCount: allProjects.filter(isVerified).length,
      hackathonsCount: allWorkshops
        .filter(isVerified)
        .filter(workshop => 
          workshop.title?.toLowerCase().includes('hackathon') || 
          workshop.title?.toLowerCase().includes('coding competition') ||
          workshop.organizer?.toLowerCase().includes('hackathon')
        ).length,
    };

    // Organize achievements by category - include all achievements for debugging
    const achievements = {
      academic: allCertifications.map(cert => {
        const vf = getWithFallbackStatus('certificate', cert.title, cert.verification);
        return {
          id: cert._id || Math.random().toString(36).substr(2, 9),
          title: cert.title,
          issuer: cert.issuer,
          dateIssued: cert.dateIssued,
          imageUrl: cert.imageUrl,
          type: 'certification',
          verifiedBy: vf.verifiedByName || vf.verifiedBy, // backward compatibility for UI
          verifiedById: vf.verifiedById,
          verifiedByName: vf.verifiedByName,
          verifiedDate: vf.verifiedDate,
          remarks: vf.remarks,
          status: vf.status,
        };
      }),
      extracurricular: allWorkshops.map(workshop => {
        const vf = getWithFallbackStatus('workshop', workshop.title, workshop.verification);
        return {
          id: workshop._id || Math.random().toString(36).substr(2, 9),
          title: workshop.title,
          organizer: workshop.organizer,
          date: workshop.date,
          certificateUrl: workshop.certificateUrl,
          type: 'workshop',
          verifiedBy: vf.verifiedByName || vf.verifiedBy,
          verifiedById: vf.verifiedById,
          verifiedByName: vf.verifiedByName,
          verifiedDate: vf.verifiedDate,
          remarks: vf.remarks,
          status: vf.status,
        };
      }),
      hackathons: allWorkshops.filter(workshop => 
        workshop.title?.toLowerCase().includes('hackathon') || 
        workshop.title?.toLowerCase().includes('coding competition') ||
        workshop.organizer?.toLowerCase().includes('hackathon')
      ).map(hackathon => {
        const vf = getWithFallbackStatus('workshop', hackathon.title, hackathon.verification);
        return {
          id: hackathon._id || Math.random().toString(36).substr(2, 9),
          title: hackathon.title,
          organizer: hackathon.organizer,
          date: hackathon.date,
          certificateUrl: hackathon.certificateUrl,
          type: 'hackathon',
          verifiedBy: vf.verifiedByName || vf.verifiedBy,
          verifiedById: vf.verifiedById,
          verifiedByName: vf.verifiedByName,
          verifiedDate: vf.verifiedDate,
          remarks: vf.remarks,
          status: vf.status,
        };
      }),
      projects: allProjects.map(project => {
        const vf = getWithFallbackStatus('project', project.title, project.verification);
        return {
          id: project._id || Math.random().toString(36).substr(2, 9),
          title: project.title,
          description: project.description,
          technologies: project.technologies || [],
          outcome: project.outcome,
          repoLink: project.repoLink,
          demoLink: project.demoLink,
          imageUrl: project.imageUrl,
          type: 'project',
          verifiedBy: vf.verifiedByName || vf.verifiedBy,
          verifiedById: vf.verifiedById,
          verifiedByName: vf.verifiedByName,
          verifiedDate: vf.verifiedDate,
          remarks: vf.remarks,
          status: vf.status,
        };
      })
    };
    return res.status(200).json({
      success: true,
      achievements,
      counts,
      student: {
        studentid: student.studentid,
        fullname: student.fullname,
        email: student.email,
        mobileno: student.mobileno,
        institution: student.institution,
        programName: student.programName,
        dept: student.dept,
        semester: student.semester
      }
    });

  } catch (error) {
    console.error("Error fetching student achievements:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server Error", 
      error: error.message 
    });
  }
};

export default getStudentAchievements;
