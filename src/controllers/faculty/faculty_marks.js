import StudentDetails from "../../models/studentDetails.js";

export const bulkUpsertMidMarks = async (req, res) => {
  try {
    const facultyId = req.user?.facultyid || req.user?.facultyId || req.user?.id;
    if (!facultyId) return res.status(401).json({ message: "Faculty id missing in token" });

    const { entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: "entries is required" });
    }

    let count = 0;

    // Group incoming entries by student-semester-mid to enforce 6-subject cap per mid
    const groupKey = (e) => `${e.studentId}|${Number(e.semester)}|${Number(e.midNumber) === 2 ? 2 : 1}`;
    const grouped = new Map();
    for (const e of entries) {
      const key = groupKey(e);
      if (!grouped.has(key)) grouped.set(key, []);
      if (grouped.get(key).length < 6) grouped.get(key).push(e);
    }

    const cappedEntries = Array.from(grouped.values()).flat();

    for (const e of cappedEntries) {
      const { studentId, semester, midNumber, subjectCode, marks, subjectName, max } = e || {};
      if (!studentId || !semester || !midNumber || !subjectCode) continue;

      const student = await StudentDetails.findOne({ studentid: studentId, facultyid: facultyId });
      if (!student) continue;

      // Ensure semester record exists
      if (!Array.isArray(student.academicRecords)) student.academicRecords = [];
      let sem = student.academicRecords.find((s) => s.semesterNumber === Number(semester));
      if (!sem) {
        sem = { semesterNumber: Number(semester), mid1: [], mid2: [] };
        student.academicRecords.push(sem);
      }

      const targetKey = Number(midNumber) === 2 ? "mid2" : "mid1";
      if (!Array.isArray(sem[targetKey])) sem[targetKey] = [];

      // Enforce at most 6 subjects per mid in DB as well
      if (sem[targetKey].length >= 6 && !sem[targetKey].some((x) => x.subjectCode === subjectCode)) {
        continue;
      }

      // Upsert subject marks within mid
      const arr = sem[targetKey];
      const idx = arr.findIndex((x) => x.subjectCode === subjectCode);
      const entry = {
        subjectCode,
        subjectName: subjectName || undefined,
        max: Number(max || 30),
        obtained: Number(marks || 0),
      };
      if (idx >= 0) arr[idx] = entry; else arr.push(entry);

      await student.save();
      count += 1;
    }

    return res.json({ success: true, count });
  } catch (err) {
    req.log?.error({ err }, "bulkUpsertMidMarks failed");
    return res.status(500).json({ message: "Failed to save marks" });
  }
};

export const getResults = async (req, res) => {
  try {
    const studentId = req.user?.studentid;
    if (!studentId) return res.status(400).json({ message: "studentId required" });

    const student = await StudentDetails.findOne({ studentid: String(studentId) }).lean();
    if (!student) return res.status(404).json({ message: "Student not found" });

    const semesterParam = req.query?.semester ? Number(req.query.semester) : null;
    let records = Array.isArray(student.academicRecords) ? student.academicRecords : [];
    if (semesterParam) {
      records = records.filter((r) => Number(r.semesterNumber) === semesterParam);
    }

    return res.json({ results: records });
  } catch (err) {
    req.log?.error({ err }, "getResults failed");
    return res.status(500).json({ message: "Failed to fetch results" });
  }
};


