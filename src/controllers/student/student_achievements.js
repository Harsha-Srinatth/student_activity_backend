import StudentDetails from "../../models/studentDetails.js";

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
      .select('studentid fullname certifications workshops clubsJoined projects internships pendingApprovals')
      .lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }
    // Include all certifications (verified and pending) for now to debug
    const allCertifications = student.certifications || [];

    // Include all clubs (verified and pending) for now to debug
    const allClubs = student.clubsJoined || [];
    // Include all workshops (verified and pending) for now to debug
    const allWorkshops = student.workshops || [];

    // Include all projects (verified and pending) for now to debug
    const allProjects = student.projects || [];
    // Calculate counts - include all achievements for debugging
    const counts = {
      certificationsCount: allCertifications.length,
      clubsJoinedCount: allClubs.length,
      workshopsCount: allWorkshops.length,
      projectsCount: allProjects.length,
      hackathonsCount: allWorkshops.filter(workshop => 
        workshop.title?.toLowerCase().includes('hackathon') || 
        workshop.title?.toLowerCase().includes('coding competition') ||
        workshop.organizer?.toLowerCase().includes('hackathon')
      ).length,
    };

    // Organize achievements by category - include all achievements for debugging
    const achievements = {
      academic: allCertifications.map(cert => ({
        id: cert._id || Math.random().toString(36).substr(2, 9),
        title: cert.title,
        issuer: cert.issuer,
        dateIssued: cert.dateIssued,
        imageUrl: cert.imageUrl,
        type: 'certification',
        verifiedBy: cert.verification?.verifiedBy,
        verifiedDate: cert.verification?.date,
        remarks: cert.verification?.remarks,
        status: cert.verification?.status || 'pending'
      })),
      extracurricular: allWorkshops.map(workshop => ({
        id: workshop._id || Math.random().toString(36).substr(2, 9),
        title: workshop.title,
        organizer: workshop.organizer,
        date: workshop.date,
        certificateUrl: workshop.certificateUrl,
        type: 'workshop',
        verifiedBy: workshop.verification?.verifiedBy,
        verifiedDate: workshop.verification?.date,
        remarks: workshop.verification?.remarks,
        status: workshop.verification?.status || 'pending'
      })),
      hackathons: allWorkshops.filter(workshop => 
        workshop.title?.toLowerCase().includes('hackathon') || 
        workshop.title?.toLowerCase().includes('coding competition') ||
        workshop.organizer?.toLowerCase().includes('hackathon')
      ).map(hackathon => ({
        id: hackathon._id || Math.random().toString(36).substr(2, 9),
        title: hackathon.title,
        organizer: hackathon.organizer,
        date: hackathon.date,
        certificateUrl: hackathon.certificateUrl,
        type: 'hackathon',
        verifiedBy: hackathon.verification?.verifiedBy,
        verifiedDate: hackathon.verification?.date,
        remarks: hackathon.verification?.remarks,
        status: hackathon.verification?.status || 'pending'
      })),
      projects: allProjects.map(project => ({
        id: project._id || Math.random().toString(36).substr(2, 9),
        title: project.title,
        description: project.description,
        technologies: project.technologies || [],
        outcome: project.outcome,
        repoLink: project.repoLink,
        demoLink: project.demoLink,
        imageUrl: project.imageUrl,
        type: 'project',
        verifiedBy: project.verification?.verifiedBy,
        verifiedDate: project.verification?.date,
        remarks: project.verification?.remarks,
        status: project.verification?.status || 'pending'
      }))
    };
    return res.status(200).json({
      success: true,
      achievements,
      counts,
      student: {
        studentid: student.studentid,
        fullname: student.fullname
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
