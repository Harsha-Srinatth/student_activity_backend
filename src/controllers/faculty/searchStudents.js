import StudentDetails from "../../models/studentDetails.js";

export const searchStudents = async (req, res) => {
  const facultyid = req.user.facultyid;
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: "Username query is required" });
  }

  try {
    // Build query object to search username (case-insensitive)
    const queryObj = { username: { $regex: username, $options: "i" } };

    // Select only required fields
    const students = await StudentDetails.find(queryObj, {
      username: 1,
      fullname: 1,
      studentid: 1,
      image: 1,
      _id: 0 // do not include the MongoDB _id field in the result
    });

    return res.status(200).json(students);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "server error" });
  }
};
