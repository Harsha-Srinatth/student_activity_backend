import StudentDetails from "../../models/student/studentDetails.js";
import FacultyDetails from "../../models/faculty/facultyDetails.js";
import Announcement from "../../models/shared/announcementSchema.js";

/**
 * Get overall dashboard stats for admin's college
 */
export const getAdminDashboardStats = async (req, res) => {
  try {
    const { collegeId } = req.user;

    // Get total counts
    const [totalStudents, totalFaculty, activeAnnouncements] = await Promise.all([
      StudentDetails.countDocuments({ collegeId }),
      FacultyDetails.countDocuments({ collegeId }),
      Announcement.countDocuments({ 
        collegeId, 
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gte: new Date() } }
        ]
      }),
    ]);

    // Get department-wise student counts
    const departmentStats = await StudentDetails.aggregate([
      { $match: { collegeId } },
      {
        $group: {
          _id: "$dept",
          studentCount: { $sum: 1 },
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

    return res.status(200).json({
      success: true,
      data: {
        overview: {
          totalStudents,
          totalFaculty,
          activeAnnouncements,
          totalDepartments: departmentStats.length,
        },
        departmentStats: departmentStats.map(dept => ({
          department: dept._id,
          studentCount: dept.studentCount,
        })),
        recentAnnouncements,
      },
    });
  } catch (error) {
    console.error("Get admin dashboard stats error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get department-wise performance analytics
 */
export const getDepartmentPerformance = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { department } = req.query;

    const matchQuery = { collegeId };
    if (department) {
      matchQuery.dept = department;
    }

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
 * Get section-wise attendance for a department
 */
export const getSectionWiseAttendance = async (req, res) => {
  try {
    const { collegeId } = req.user;
    const { department, semester } = req.query;

    if (!department) {
      return res.status(400).json({ message: "Department is required" });
    }

    const matchQuery = { collegeId, dept: department };
    if (semester) {
      matchQuery.semester = semester;
    }

    // Get students grouped by section (assuming section is part of studentid or we need to extract it)
    // For now, we'll group by semester and calculate attendance
    const sectionStats = await StudentDetails.aggregate([
      { $match: matchQuery },
      {
        $project: {
          studentid: 1,
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
          _id: "$semester",
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
    const { collegeId } = req.user;
    const { department, semester } = req.query;

    if (!department) {
      return res.status(400).json({ message: "Department is required" });
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

