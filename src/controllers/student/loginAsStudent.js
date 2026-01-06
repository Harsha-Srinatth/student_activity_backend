import StudentDetails from "../../models/student/studentDetails.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const loginAsStudent = async(req,res) => {
    //getting email and password from user
    const { studentid, password } = req.body;
    console.log("user details from frontend : ",req.body);
    //verifying user entered both fields
    if (!studentid || !password) {
        return res.status(400).json({ message: "Reg.No and password are required" });
    }
    try {
        let user = await StudentDetails.findOne({ studentid: studentid });
            if (!user) {
                return res.status(404).json({ message: "invalid email or password" });
            }
         const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(404).json({ message: "invalid email or password" });
            }
        const token = jwt.sign(
            {
                studentid: user.studentid, // <-- important fix
                collegeId: user.collegeId,
                role: "student", // Add role to JWT token
            },
            process.env.MY_SECRET_KEY,
            { expiresIn: '1d' }
        );
    return res.json({
        token,
        user: {
            studentid: user.studentid,
            collegeId: user.collegeId,
            hasProfilePic: !!user.image?.url,
        },
        });
    
  } catch (err) {
    console.error("error in above code:", err);
    return res.status(500).json({ message: "server error" });
  }
}