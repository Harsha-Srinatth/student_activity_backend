import StudentDetails from "../../models/studentDetails.js";
import FacultyDetails from "../../models/facultyDetails.js";

/**
 * Get student achievements
 * Note: Student data and counts are already available in Redux from /student/home
 * This endpoint only returns achievements data to reduce duplication
 */
const getStudentAchievements = async (req, res) => {
  try {
    const { studentid } = req.user;
    
    if (!studentid) {
      return res.status(400).json({ message: "Student ID is required" });
    }

    // Only fetch achievement-related fields (student data already in Redux)
    const student = await StudentDetails.findOne({ studentid })
      .select('certifications workshops clubsJoined internships projects')
      .lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Collect unique faculty IDs from verifications (only if needed)
    const facultyIds = new Set();
    [...student.certifications, ...student.workshops, ...student.projects, ...student.internships].forEach(item => {
      if (item?.verification?.verifiedBy) {
        facultyIds.add(item.verification.verifiedBy);
      }
    });

    // Build faculty name map (single query)
    const facultyNameMap = new Map();
    if (facultyIds.size > 0) {
      const facultyList = await FacultyDetails.find({ facultyid: { $in: Array.from(facultyIds) } })
        .select('facultyid fullname')
        .lean();
      facultyList.forEach(f => facultyNameMap.set(f.facultyid, f.fullname));
    }

    // Helper to format verification info
    const getVerificationInfo = (verification) => {
      if (!verification) return { status: 'pending' };
      
      return {
        status: verification.status || 'pending',
        verifiedById: verification.verifiedBy,
        verifiedByName: verification.verifiedBy ? (facultyNameMap.get(verification.verifiedBy) || undefined) : undefined,
        verifiedDate: verification.date,
        remarks: verification.remarks,
      };
    };

    // Format achievements by category
    const achievements = {
      academic: student.certifications.map(cert => {
        const vf = getVerificationInfo(cert.verification);
        return {
          id: cert._id?.toString() || Math.random().toString(36).substr(2, 9),
          title: cert.title,
          issuer: cert.issuer,
          dateIssued: cert.dateIssued,
          imageUrl: cert.imageUrl,
          type: 'certification',
          verifiedBy: vf.verifiedByName || vf.verifiedById, // Backward compatibility
          ...vf,
        };
      }),
      extracurricular: student.workshops.map(workshop => {
        const vf = getVerificationInfo(workshop.verification);
        return {
          id: workshop._id?.toString() || Math.random().toString(36).substr(2, 9),
          title: workshop.title,
          organizer: workshop.organizer,
          date: workshop.date,
          certificateUrl: workshop.imageUrl,
          imageUrl: workshop.imageUrl,
          type: 'workshop',
          verifiedBy: vf.verifiedByName || vf.verifiedById,
          ...vf,
        };
      }),
      hackathons: student.workshops
        .filter(workshop => {
          const title = workshop.title?.toLowerCase() || '';
          const organizer = workshop.organizer?.toLowerCase() || '';
          return title.includes('hackathon') || 
                 title.includes('coding competition') ||
                 organizer.includes('hackathon');
        })
        .map(hackathon => {
          const vf = getVerificationInfo(hackathon.verification);
          return {
            id: hackathon._id?.toString() || Math.random().toString(36).substr(2, 9),
            title: hackathon.title,
            organizer: hackathon.organizer,
            date: hackathon.date,
            certificateUrl: hackathon.imageUrl,
            imageUrl: hackathon.imageUrl,
            type: 'hackathon',
            verifiedBy: vf.verifiedByName || vf.verifiedById,
            ...vf,
          };
        }),
      projects: student.projects.map(project => {
        const vf = getVerificationInfo(project.verification);
        return {
          id: project._id?.toString() || Math.random().toString(36).substr(2, 9),
          title: project.title,
          description: project.description,
          technologies: project.technologies || [],
          outcome: project.outcome,
          repoLink: project.repoLink,
          demoLink: project.demoLink,
          imageUrl: project.imageUrl,
          type: 'project',
          verifiedBy: vf.verifiedByName || vf.verifiedById,
          ...vf,
        };
      }),
    };

    // Note: Counts are already in Redux from /student/home endpoint
    // Only return achievements to avoid duplication
    return res.status(200).json({
      success: true,
      achievements, // Only achievements, no student data or counts
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
