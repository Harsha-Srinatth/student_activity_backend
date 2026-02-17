// src/controllers/authController.js
import Joi from "joi";
import bcrypt from "bcryptjs";
import FacultyDetails from "../models/faculty/facultyDetails.js";
import StudentDetails from "../models/student/studentDetails.js";
import HOD from "../models/Hod/hodDetails.js";
import { sendEmail } from "../utils/sendGmail.js";
import { sendWelcomeNotification } from "../utils/firebaseNotification.js";


// Validation schema
const facultySchema = Joi.object({
  facultyid: Joi.string().trim().required(),
  collegeId: Joi.string().trim().required(),
  fullname: Joi.string().trim().min(2).required(),
  username: Joi.string().trim().min(3).required(),
  dept: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().pattern(/^[0-9+ -]{7,20}$/).optional().allow(""),
  password: Joi.string().min(8).required(),
  dateofjoin: Joi.date().iso().required(),
  subjects: Joi.array().items(Joi.string().trim()).min(1).optional().default([]),
  fcmToken: Joi.string().trim().optional().allow("", null),
});

//validate student details
const studentSchema = Joi.object({
  studentid: Joi.string().trim().required(),
  collegeId: Joi.string().trim().required(),
  fullname: Joi.string().trim().min(2).required(),
  username: Joi.string().trim().min(3).required(),
  dept: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  mobileno: Joi.string().pattern(/^[0-9+ -]{7,20}$/).required(),
  password: Joi.string().min(8).required(),
  programName: Joi.string().trim().required(),
  semester: Joi.string().trim().optional().allow(""),
  facultyid: Joi.string().trim().required(),
  dateofjoin: Joi.date().iso().required(),
  fcmToken: Joi.string().trim().optional().allow("", null),
});

// Validation schema for HOD
const hodSchema = Joi.object({
  hodId: Joi.string().trim().required(),
  collegeId: Joi.string().trim().required(),
  department: Joi.string().trim().required(),
  fullname: Joi.string().trim().min(2).required(),
  username: Joi.string().trim().min(3).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  mobile: Joi.string().pattern(/^[0-9+ -]{7,20}$/).required(),
  fcmToken: Joi.string().trim().optional().allow("", null),
});

export const enqueueFacultyRegistration = async (req, res) => {
  try {
    const { error, value } = facultySchema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(value.password, 12);

    // Create faculty document
    const facultyDoc = {
      facultyid: value.facultyid,
      collegeId: value.collegeId,
      fullname: value.fullname,
      username: value.username,
      dept: value.dept,
      email: value.email,
      mobile: value.mobile,
      password: hashedPassword,
      dateofjoin: value.dateofjoin,
      subjects: value.subjects || [],
      fcmToken: value.fcmToken || null,
    };

    // Save to database
    await FacultyDetails.create(facultyDoc);
    
    // Send welcome email
    try {
      await sendEmail(
        facultyDoc.email,
        "Welcome to College360x 🎉",
        `
          <h2>Hello ${facultyDoc.fullname},</h2>
          <p>Your registration was successful!</p>
          <p>We're excited to have you onboard 🚀</p>
        `
      );
    } catch (err) {
      console.error("Email sending error:", err);
    }

    // Send welcome push notification if token is provided
    if (facultyDoc.fcmToken) {
      try {
        await sendWelcomeNotification(facultyDoc.fcmToken, facultyDoc.fullname, "faculty");
      } catch (err) {
        console.error("Push notification sending error:", err);
        // Don't fail registration if notification fails
      }
    }

    return res.status(201).json({
      message: "Faculty registration successful!",
    });
  } catch (err) {
    console.error("Faculty registration error:", err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0];
      return res.status(400).json({ 
        message: `${field} already exists. Please use a different ${field}.` 
      });
    }
    return res.status(500).json({ message: "Server error" });
  }
};

export const enqueueStudentRegistration = async (req, res) => {
  try {
    const { error, value } = studentSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message });

    // Hash password
    const hashedPassword = await bcrypt.hash(value.password, 12);

    // Create student document
    const studentDoc = {
      studentid: value.studentid,
      collegeId: value.collegeId,
      fullname: value.fullname,
      username: value.username,
      dept: value.dept,
      email: value.email,
      mobileno: value.mobileno,
      password: hashedPassword,
      programName: value.programName,
      semester: value.semester,
      facultyid: value.facultyid,
      dateofjoin: value.dateofjoin,
      fcmToken: value.fcmToken || null,
    };

    // Save to database
    await StudentDetails.create(studentDoc);
    
    // Send welcome email
    try {
      await sendEmail(
        studentDoc.email,
        "Welcome to College360x 🎉",
        `
          <h2>Hello ${studentDoc.fullname},</h2>
          <p>Your registration was successful!</p>
          <p>We're excited to have you onboard 🚀</p>
        `
      );
    } catch (err) {
      console.error("Email sending error:", err);
    }

    // Send welcome push notification if token is provided
    if (studentDoc.fcmToken) {
      try {
        await sendWelcomeNotification(studentDoc.fcmToken, studentDoc.fullname, "student");
      } catch (err) {
        console.error("Push notification sending error:", err);
        // Don't fail registration if notification fails
      }
    }

    return res.status(201).json({
      message: "Student registration successful!",
    });
  } catch (err) {
    console.error("Student registration error:", err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0];
      return res.status(400).json({ 
        message: `${field} already exists. Please use a different ${field}.` 
      });
    }
    return res.status(500).json({ message: "Server error" });
  }
};

export const enqueueHODRegistration = async (req, res) => {
  try {
    const { error, value } = hodSchema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(value.password, 12);

    // Create HOD document
    const hodDoc = {
      hodId: value.hodId,
      collegeId: value.collegeId,
      department: value.department,
      fullname: value.fullname,
      username: value.username,
      email: value.email.toLowerCase(),
      password: hashedPassword,
      mobile: value.mobile,
      isActive: true,
      fcmToken: value.fcmToken || null,
    };

    // Save to database
    await HOD.create(hodDoc);
    
    // Send welcome email
    try {
      await sendEmail(
        hodDoc.email,
        "Welcome to College360x 🎉",
        `
          <h2>Hello ${hodDoc.fullname},</h2>
          <p>Your HOD registration was successful!</p>
          <p>We're excited to have you onboard 🚀</p>
          <p><strong>Department:</strong> ${hodDoc.department}</p>
        `
      );
    } catch (err) {
      console.error("Email sending error:", err);
    }

    // Send welcome push notification if token is provided
    if (hodDoc.fcmToken) {
      try {
        await sendWelcomeNotification(hodDoc.fcmToken, hodDoc.fullname, "hod");
      } catch (err) {
        console.error("Push notification sending error:", err);
        // Don't fail registration if notification fails
      }
    }

    return res.status(201).json({
      message: "HOD registration successful!",
    });
  } catch (err) {
    console.error("HOD registration error:", err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0];
      return res.status(400).json({ 
        message: `${field} already exists. Please use a different ${field}.` 
      });
    }
    return res.status(500).json({ message: "Server error" });
  }
};
