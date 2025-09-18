export const getCurriculumBySemester = async (req, res) => {
  try {
    const semester = Number(req.query.semester || 1);
    // In real scenario, fetch from collection mapping dept/program to subjects.
    // Return 10 subjects per semester, but only 6 are used for mid marks.
    const subjects = Array.from({ length: 10 }).map((_, i) => ({
      code: `SUB${semester}${String(i + 1).padStart(2, "0")}`,
      name: `Subject ${i + 1}`,
      max: 30,
    }));
    return res.json({ subjects });
  } catch (err) {
    req.log?.error({ err }, "getCurriculumBySemester failed");
    return res.status(500).json({ message: "Failed to fetch curriculum" });
  }
};


