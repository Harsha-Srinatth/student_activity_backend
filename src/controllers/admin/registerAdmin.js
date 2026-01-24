import Admin from "../../models/shared/Administrator.js";
import bcrypt from "bcryptjs";
import Joi from "joi";

const adminSchema = Joi.object({
  adminId: Joi.string().trim().required(),
  collegeId: Joi.string().trim().required(),
  fullname: Joi.string().trim().min(2).required(),
  username: Joi.string().trim().min(3).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  mobile: Joi.string().trim().min(7).max(20).required(),
});

export const registerAdmin = async (req, res) => {
  try {
    console.log("Received registration data:", req.body);
    const { error, value } = adminSchema.validate(req.body);
    
    if (error) {
      console.log("Validation error:", error.details);
      return res.status(400).json({ 
        message: "Validation error", 
        details: error.details.map(d => d.message).join(", ") 
      });
    }

    console.log("Validated data:", value);
    const { adminId, collegeId, fullname, username, email, password, mobile } = value;

    // Ensure all required fields are present
    if (!fullname || !username) {
      console.error("Missing required fields - fullname:", fullname, "username:", username);
      return res.status(400).json({ 
        message: "Missing required fields: fullname and username are required" 
      });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
      $or: [
        { adminId },
        { email: email.toLowerCase() },
        { username }
      ]
    });

    if (existingAdmin) {
      return res.status(400).json({ 
        message: "Admin with this ID, email, or username already exists" 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const admin = new Admin({
      adminId,
      collegeId,
      fullname,
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      mobile: mobile || "",
      isActive: true,
    });

    await admin.save();

    return res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      data: {
        adminId: admin.adminId,
        collegeId: admin.collegeId,
        fullname: admin.fullname,
        username: admin.username,
        email: admin.email,
      },
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

