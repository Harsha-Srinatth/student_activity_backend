import Admin from "../../models/shared/Administrator.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const loginAsAdmin = async (req, res) => {
  const { adminId, password } = req.body;
  
  if (!adminId || !password) {
    return res.status(400).json({ message: "Admin ID and password are required" });
  }

  try {
    const admin = await Admin.findOne({ adminId: adminId }).select("+password");
    
    if (!admin) {
      return res.status(404).json({ message: "Invalid admin ID or password" });
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: "Admin account is inactive" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    
    if (!isMatch) {
      return res.status(404).json({ message: "Invalid admin ID or password" });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign(
      {
        adminId: admin.adminId,
        collegeId: admin.collegeId,
        role: "admin",
      },
      process.env.MY_SECRET_KEY,
      { expiresIn: '1d' }
    );

    return res.json({
      token,
      user: {
        adminId: admin.adminId,
        collegeId: admin.collegeId,
        name: admin.fullname,
        email: admin.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

