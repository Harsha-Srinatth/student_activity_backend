import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";
import Announcement from "../../models/shared/announcementSchema.js";
import ClubDetail from "../../models/shared/clubSchema.js";

/**
 * Get overall dashboard stats for HOD's college
 */
export const getHODDashboardStats = async (req, res) => {
  try {
    const { collegeId, department } = req.user;

    if (!department) {
      return res.status(400).json({ message: "Department information is missing" });
    }

    // Get total counts for HOD's department
    const [totalStudents, totalFaculty, activeAnnouncements] = await Promise.all([
      StudentDetails.countDocuments({ collegeId, dept: department }),
      FacultyDetails.countDocuments({ collegeId, dept: department }),
      Announcement.countDocuments({ 
        collegeId, 
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gte: new Date() } }
        ]
      }),
    ]);

    // Get department-wise student counts (for HOD's department)
    const departmentStats = await StudentDetails.aggregate([
      { $match: { collegeId, dept: department } },
      {
        $group: {
          _id: "$dept",
          studentCount: { $sum: 1 },
        },
      },
      { $sort: { studentCount: -1 } },
    ]);

    // Get section-wise student counts (group by section field, fallback to semester if section doesn't exist)
    const sectionStats = await StudentDetails.aggregate([
      { $match: { collegeId, dept: department } },
      {
        $group: {
          _id: { 
            $ifNull: ["$section", "$semester"] 
          },
          studentCount: { $sum: 1 },
          department: { $first: "$dept" },
        },
      },
      { $sort: { studentCount: -1 } },
    ]);

    // Get recent announcements
    const recentAnnouncements = await Announcement.find({
      collegeId,
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gte: new Date() } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title priority createdAt targetAudience");

    // Get total clubs for this college
    const totalClubs = await ClubDetail.countDocuments({ collegeId });

    // Get top 5 achievers in HOD's department (most approved docs)
    const topPerformers = await StudentDetails.aggregate([
      { $match: { collegeId, dept: department } },
      {
        $project: {
          studentid: 1,
          fullname: 1,
          programName: 1,
          image: 1,
          achievementCount: {
            $add: [
              { $size: { $filter: { input: { $ifNull: ["$certifications", []] }, as: "c", cond: { $eq: ["$$c.verification.status", "approved"] } } } },
              { $size: { $filter: { input: { $ifNull: ["$projects", []] }, as: "p", cond: { $eq: ["$$p.verification.status", "approved"] } } } },
              { $size: { $filter: { input: { $ifNull: ["$internships", []] }, as: "i", cond: { $eq: ["$$i.verification.status", "approved"] } } } },
              { $size: { $filter: { input: { $ifNull: ["$workshops", []] }, as: "w", cond: { $eq: ["$$w.verification.status", "approved"] } } } },
            ],
          },
        },
      },
      { $sort: { achievementCount: -1 } },
      { $limit: 5 },
    ]);

    // Faculty workload summary (top 5 faculty by students managed)
    const facultyWorkload = await StudentDetails.aggregate([
      { $match: { collegeId, dept: department } },
      { $group: { _id: "$facultyid", studentCount: { $sum: 1 } } },
      { $sort: { studentCount: -1 } },
      { $limit: 5 },
    ]);
    // Populate faculty names
    const facultyIds = facultyWorkload.map((f) => f._id).filter(Boolean);
    const facultyDocs = await FacultyDetails.find({ facultyid: { $in: facultyIds } })
      .select("facultyid fullname image")
      .lean();
    const fMap = new Map(facultyDocs.map((f) => [f.facultyid, f]));
    const facultyWorkloadPopulated = facultyWorkload.map((f) => ({
      facultyid: f._id,
      fullname: fMap.get(f._id)?.fullname || f._id,
      avatar: fMap.get(f._id)?.image?.url || "",
      studentCount: f.studentCount,
    }));

    return res.status(200).json({
      success: true,
      data: {
        overview: {
          totalStudents,
          totalFaculty,
          activeAnnouncements,
          totalDepartments: departmentStats.length,
          totalSections: sectionStats.length,
          totalClubs,
        },
        departmentStats: departmentStats.map((dept) => ({
          department: dept._id,
          studentCount: dept.studentCount,
        })),
        sectionStats: sectionStats.map((s) => ({
          section: s._id || "N/A",
          studentCount: s.studentCount,
          department: s.department,
        })),
        recentAnnouncements,
        topPerformers: topPerformers.map((s) => ({
          studentid: s.studentid,
          fullname: s.fullname,
          programName: s.programName,
          avatar: s.image?.url || "",
          achievementCount: s.achievementCount,
        })),
        facultyWorkload: facultyWorkloadPopulated,
      },
    });
  } catch (error) {
    console.error("Get HOD dashboard stats error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get department-wise performance analytics
 */
export const getDepartmentPerformance = async (req, res) => {
  try {
    const { collegeId, department } = req.user;

    if (!department) {
      return res.status(400).json({ message: "Department information is missing" });
    }

    const matchQuery = { collegeId, dept: department };

    // Get department-wise statistics
    const deptStats = await StudentDetails.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$dept",
          totalStudents: { $sum: 1 },
          // Calculate average attendance
          avgAttendance: {
            $avg: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$attendance", []] } }, 0] },
                {
                  $multiply: [
                    {
                      $divide: [
                        {
                          $size: {
                            $filter: {
                              input: { $ifNull: ["$attendance", []] },
                              as: "entry",
                              cond: { $eq: ["$$entry.present", true] },
                            },
                          },
                        },
                        { $size: { $ifNull: ["$attendance", []] } },
                      ],
                    },
                    100,
                  ],
                },
                0,
              ],
            },
          },
          // Count achievements
          totalCertifications: {
            $sum: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$certifications", []] },
                  as: "cert",
                  cond: { $eq: ["$$cert.verification.status", "approved"] },
                },
              },
            },
          },
          totalProjects: {
            $sum: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$projects", []] },
                  as: "proj",
                  cond: { $eq: ["$$proj.verification.status", "approved"] },
                },
              },
            },
          },
          totalInternships: {
            $sum: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$internships", []] },
                  as: "intern",
                  cond: { $eq: ["$$intern.verification.status", "approved"] },
                },
              },
            },
          },
        },
      },
      { $sort: { totalStudents: -1 } },
    ]);

    return res.status(200).json({
      success: true,
      data: deptStats.map(dept => ({
        department: dept._id,
        totalStudents: dept.totalStudents,
        avgAttendance: Math.round(dept.avgAttendance || 0),
        totalCertifications: dept.totalCertifications,
        totalProjects: dept.totalProjects,
        totalInternships: dept.totalInternships,
        performanceScore: Math.round(
          (dept.avgAttendance || 0) * 0.4 +
          (dept.totalCertifications / Math.max(dept.totalStudents, 1)) * 20 * 0.3 +
          (dept.totalProjects / Math.max(dept.totalStudents, 1)) * 20 * 0.2 +
          (dept.totalInternships / Math.max(dept.totalStudents, 1)) * 20 * 0.1
        ),
      })),
    });
  } catch (error) {
    console.error("Get department performance error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get available sections (programNames) for a department
 */
export const getAvailableSections = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    const { semester } = req.query;

    if (!department) {
      return res.status(400).json({ message: "Department information is missing" });
    }

    const matchQuery = { collegeId, dept: department };
    if (semester) {
      matchQuery.semester = semester;
    }

    // Get distinct programNames (sections) for the department
    const sections = await StudentDetails.distinct("programName", matchQuery)
      .then(sections => sections.filter(s => s && s.trim()).sort());

    return res.status(200).json({
      success: true,
      data: sections,
    });
  } catch (error) {
    console.error("Get available sections error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get section-wise attendance for a department
 * Groups by programName (which represents sections like CSBS, IT-A, CSE-A)
 */
export const getSectionWiseAttendance = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    const { semester, section } = req.query;

    if (!department) {
      return res.status(400).json({ message: "Department information is missing" });
    }

    const matchQuery = { collegeId, dept: department };
    if (semester) {
      matchQuery.semester = semester;
    }
    // Filter by section (programName) if provided
    if (section && section.trim()) {
      matchQuery.programName = section.trim();
    }

    // Get students grouped by programName (section)
    const sectionStats = await StudentDetails.aggregate([
      { $match: matchQuery },
      {
        $project: {
          studentid: 1,
          programName: 1,
          semester: 1,
          attendance: 1,
          totalClasses: { $size: { $ifNull: ["$attendance", []] } },
          presentClasses: {
            $size: {
              $filter: {
                input: { $ifNull: ["$attendance", []] },
                as: "entry",
                cond: { $eq: ["$$entry.present", true] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: "$programName", // Group by programName (section)
          totalStudents: { $sum: 1 },
          totalClasses: { $sum: "$totalClasses" },
          totalPresent: { $sum: "$presentClasses" },
          students: {
            $push: {
              studentid: "$studentid",
              attendancePercentage: {
                $cond: [
                  { $gt: ["$totalClasses", 0] },
                  {
                    $multiply: [
                      { $divide: ["$presentClasses", "$totalClasses"] },
                      100,
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Calculate section-wise stats
    const sectionData = sectionStats.map(section => {
      const avgAttendance = section.totalClasses > 0
        ? Math.round((section.totalPresent / section.totalClasses) * 100)
        : 0;

      // Count students by attendance ranges
      const attendanceRanges = {
        excellent: 0, // 90-100%
        good: 0,      // 75-89%
        average: 0,   // 60-74%
        poor: 0,      // <60%
      };

      section.students.forEach(student => {
        const percentage = student.attendancePercentage;
        if (percentage >= 90) attendanceRanges.excellent++;
        else if (percentage >= 75) attendanceRanges.good++;
        else if (percentage >= 60) attendanceRanges.average++;
        else attendanceRanges.poor++;
      });

      return {
        section: section._id || "N/A",
        totalStudents: section.totalStudents,
        avgAttendance,
        totalClasses: section.totalClasses,
        totalPresent: section.totalPresent,
        attendanceRanges,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        department,
        sections: sectionData,
      },
    });
  } catch (error) {
    console.error("Get section-wise attendance error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get detailed student attendance by section
 */
export const getStudentAttendanceBySection = async (req, res) => {
  try {
    const { collegeId, department } = req.user;
    const { semester } = req.query;

    if (!department) {
      return res.status(400).json({ message: "Department information is missing" });
    }

    const matchQuery = { collegeId, dept: department };
    if (semester) {
      matchQuery.semester = semester;
    }

    const students = await StudentDetails.find(matchQuery)
      .select("studentid fullname semester attendance")
      .lean();

    const studentAttendance = students.map(student => {
      const totalClasses = student.attendance?.length || 0;
      const presentClasses = student.attendance?.filter(
        entry => entry.present === true
      ).length || 0;
      const attendancePercentage = totalClasses > 0
        ? Math.round((presentClasses / totalClasses) * 100)
        : 0;

      return {
        studentid: student.studentid,
        fullname: student.fullname,
        semester: student.semester,
        totalClasses,
        presentClasses,
        absentClasses: totalClasses - presentClasses,
        attendancePercentage,
      };
    });

    // Group by semester
    const groupedBySection = {};
    studentAttendance.forEach(student => {
      const section = student.semester || "N/A";
      if (!groupedBySection[section]) {
        groupedBySection[section] = [];
      }
      groupedBySection[section].push(student);
    });

    return res.status(200).json({
      success: true,
      data: {
        department,
        sections: Object.keys(groupedBySection).map(section => ({
          section,
          students: groupedBySection[section],
          totalStudents: groupedBySection[section].length,
          avgAttendance: Math.round(
            groupedBySection[section].reduce(
              (sum, s) => sum + s.attendancePercentage,
              0
            ) / groupedBySection[section].length
          ) || 0,
        })),
      },
    });
  } catch (error) {
    console.error("Get student attendance by section error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get ALL departments' performance in the same college
 * So HOD can compare their dept against others
 */
export const getAllDepartmentsComparison = async (req, res) => {
  try {
    const { collegeId } = req.user;

    const deptStats = await StudentDetails.aggregate([
      { $match: { collegeId } },
      {
        $group: {
          _id: "$dept",
          totalStudents: { $sum: 1 },
          avgAttendance: {
            $avg: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$attendance", []] } }, 0] },
                {
                  $multiply: [
                    {
                      $divide: [
                        { $size: { $filter: { input: { $ifNull: ["$attendance", []] }, as: "e", cond: { $eq: ["$$e.present", true] } } } },
                        { $size: { $ifNull: ["$attendance", []] } },
                      ],
                    },
                    100,
                  ],
                },
                0,
              ],
            },
          },
          totalCertifications: {
            $sum: { $size: { $filter: { input: { $ifNull: ["$certifications", []] }, as: "c", cond: { $eq: ["$$c.verification.status", "approved"] } } } },
          },
          totalProjects: {
            $sum: { $size: { $filter: { input: { $ifNull: ["$projects", []] }, as: "p", cond: { $eq: ["$$p.verification.status", "approved"] } } } },
          },
          totalInternships: {
            $sum: { $size: { $filter: { input: { $ifNull: ["$internships", []] }, as: "i", cond: { $eq: ["$$i.verification.status", "approved"] } } } },
          },
        },
      },
      { $sort: { totalStudents: -1 } },
    ]);

    // Faculty count per department
    const facultyCounts = await FacultyDetails.aggregate([
      { $match: { collegeId } },
      { $group: { _id: "$dept", count: { $sum: 1 } } },
    ]);
    const facMap = new Map(facultyCounts.map((f) => [f._id, f.count]));

    const departments = deptStats.map((d) => ({
      department: d._id,
      totalStudents: d.totalStudents,
      totalFaculty: facMap.get(d._id) || 0,
      avgAttendance: Math.round(d.avgAttendance || 0),
      totalCertifications: d.totalCertifications,
      totalProjects: d.totalProjects,
      totalInternships: d.totalInternships,
      performanceScore: Math.round(
        (d.avgAttendance || 0) * 0.4 +
        (d.totalCertifications / Math.max(d.totalStudents, 1)) * 20 * 0.3 +
        (d.totalProjects / Math.max(d.totalStudents, 1)) * 20 * 0.2 +
        (d.totalInternships / Math.max(d.totalStudents, 1)) * 20 * 0.1
      ),
    }));

    return res.status(200).json({ success: true, data: departments });
  } catch (error) {
    console.error("Get all departments comparison error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

