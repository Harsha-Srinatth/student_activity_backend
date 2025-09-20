
import StudentDetails from "../../models/studentDetails.js";

// GET all enrollments for logged in student
const getEnrollments = async (req, res) => {
  try {
    const { studentid } = req.user.studentid;
    const student = await StudentDetails.findOne({ studentid: studentid });
    if (!student) {
      return res.status(404).json({ ok: false, message: "Student not found" });
    }
    return res.json({ ok: true, enrollments: student.enrollments });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// POST new enrollment
const enrollInClub = async (req, res) => {
   try {
    const { studentid } = req.user.studentid; // from JWT
    const { clubId, clubName, name, regno, branch, section, dept, phone, email } = req.body;

    // Check duplicate request
    const exists = await StudentDetails.enrollments.findOne({ studentid: studentid, clubId: clubId });
    if (exists) {
      return res.status(400).json({ ok: false, message: "Already requested for this club" });
    }

    const enrollment = new StudentDetails.enrollments({
        clubId,
        clubName,
        studentName: name, // map frontend 'name' to backend 'studentName'
        regno,
        branch,
        section,
        dept,
        phone,
        email,
        status: "pending",
    });

    await StudentDetails.enrollments.save();
    res.json({ ok: true, message: "Enrollment request submitted", enrollment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};


export { getEnrollments, enrollInClub };
