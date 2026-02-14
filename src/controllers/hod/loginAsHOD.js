import HOD from "../../models/Hod/hodDetails.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const loginAsHOD = async (req, res) => {
  const { hodId, password } = req.body;
  
  if (!hodId || !password) {
    return res.status(400).json({ message: "HOD ID and password are required" });
  }

  try {
    const hod = await HOD.findOne({ hodId: hodId }).select("+password");
    
    if (!hod) {
      return res.status(404).json({ message: "Invalid HOD ID or password" });
    }

    if (!hod.isActive) {
      return res.status(403).json({ message: "HOD account is inactive" });
    }

    const isMatch = await bcrypt.compare(password, hod.password);
    
    if (!isMatch) {
      return res.status(404).json({ message: "Invalid HOD ID or password" });
    }

    // Update last login
    hod.lastLogin = new Date();
    await hod.save();

    const token = jwt.sign(
      {
        hodId: hod.hodId,
        collegeId: hod.collegeId,
        department: hod.department,
        role: "hod",
      },
      process.env.MY_SECRET_KEY,
      { expiresIn: '1d' }
    );

    return res.json({
      token,
      user: {
        hodId: hod.hodId,
        collegeId: hod.collegeId,
        department: hod.department,
        name: hod.fullname,
        email: hod.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

