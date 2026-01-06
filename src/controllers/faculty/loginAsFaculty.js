import FacultyDetails from "../../models/faculty/facultyDetails.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";


export const loginAsFaculty = async(req,res) => {
    //getting email and password from user
    const { email, password } = req.body;
    console.log("user details from frontend : ",req.body);
    //verifying user entered both fields
    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }
    try {
        let user = await FacultyDetails.findOne({ email });
            if (!user) {
                return res.status(404).json({ message: "invalid email or password" });
            }
         const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(404).json({ message: "invalid email or password" });
            }
        const token = jwt.sign(
            {
                facultyid: user.facultyid,
                collegeId: user.collegeId,
                email: user.email,
                role: "faculty", // Add role to JWT token
            },
            process.env.MY_SECRET_KEY,
            { expiresIn: '1d' }
        );
    return res.json({
        token,
        user: {
            facultyid: user.facultyid,
            collegeId: user.collegeId,
            email: user.email,
            hasProfilePic: !!user.image?.url,
        },
        });
    
  } catch (err) {
    console.error("error in above code:", err);
    return res.status(500).json({ message: "server error" });
  }
}