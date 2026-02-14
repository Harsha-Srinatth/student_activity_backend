import HOD from "../../models/Hod/hodDetails.js";
import bcrypt from "bcryptjs";
import Joi from "joi";

const hodSchema = Joi.object({
  hodId: Joi.string().trim().required(),
  collegeId: Joi.string().trim().required(),
  department: Joi.string().trim().required(),
  fullname: Joi.string().trim().min(2).required(),
  username: Joi.string().trim().min(3).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  mobile: Joi.string().trim().min(7).max(20).required(),
});

export const registerHOD = async (req, res) => {
  try {
    console.log("Received registration data:", req.body);
    const { error, value } = hodSchema.validate(req.body);
    
    if (error) {
      console.log("Validation error:", error.details);
      return res.status(400).json({ 
        message: "Validation error", 
        details: error.details.map(d => d.message).join(", ") 
      });
    }

    console.log("Validated data:", value);
    const { hodId, collegeId, department, fullname, username, email, password, mobile } = value;

    // Ensure all required fields are present
    if (!fullname || !username || !department) {
      console.error("Missing required fields - fullname:", fullname, "username:", username, "department:", department);
      return res.status(400).json({ 
        message: "Missing required fields: fullname, username, and department are required" 
      });
    }

    // Check if HOD already exists
    const existingHOD = await HOD.findOne({
      $or: [
        { hodId: hodId },
        { email: email.toLowerCase() },
        { username }
      ]
    });

    if (existingHOD) {
      return res.status(400).json({ 
        message: "HOD with this ID, email, or username already exists" 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create HOD using HOD model
    const hod = new HOD({
      hodId,
      collegeId,
      department,
      fullname,
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      mobile: mobile || "",
      isActive: true,
    });

    await hod.save();

    return res.status(201).json({
      success: true,
      message: "HOD registered successfully",
      data: {
        hodId: hod.hodId,
        collegeId: hod.collegeId,
        department: hod.department,
        fullname: hod.fullname,
        username: hod.username,
        email: hod.email,
      },
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

