// src/controllers/authController.js
import Joi from "joi";
import bcrypt from "bcryptjs";
import FacultyDetails from "../models/faculty/facultyDetails.js";
import StudentDetails from "../models/student/studentDetails.js";
import HOD from "../models/Hod/hodDetails.js";
import { sendEmail } from "../utils/sendGmail.js";
import {
  getStudentWelcomeEmailHtml,
  getFacultyWelcomeEmailHtml,
  getHODWelcomeEmailHtml,
} from "../utils/welcomeEmailTemplates.js";

// Validation schema (dateofjoin: accept ISO string or YYYY-MM-DD from HTML date input)
const facultySchema = Joi.object({
  facultyid: Joi.string().trim().required(),
  collegeId: Joi.string().trim().required(),
  fullname: Joi.string().trim().min(2).required(),
  username: Joi.string().trim().min(3).required(),
  dept: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().pattern(/^[0-9+ -]{7,20}$/).optional().allow(""),
  password: Joi.string().min(8).required(),
  dateofjoin: Joi.alternatives().try(Joi.date().iso(), Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)).required(),
  subjects: Joi.array().items(Joi.string().trim()).min(1).required().messages({
    "array.min": "At least one subject is required.",
    "any.required": "At least one subject is required."
  }),
  // fcmToken removed - use fcmTokenData in settings endpoint after login
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
  // fcmToken removed - use fcmTokenData in settings endpoint after login
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
  // fcmToken removed - use fcmTokenData in settings endpoint after login
});

export const enqueueFacultyRegistration = async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.subjects !== undefined) {
      if (Array.isArray(body.subjects)) {
        body.subjects = body.subjects.map((s) => (typeof s === "string" ? s : String(s)).trim()).filter(Boolean);
      } else if (typeof body.subjects === "string" && body.subjects.trim()) {
        body.subjects = [body.subjects.trim()];
      } else {
        body.subjects = [];
      }
    }
    const { error, value } = facultySchema.validate(body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(value.password, 12);

    // Create faculty document (ensure dateofjoin is a Date for MongoDB)
    const facultyDoc = {
      facultyid: value.facultyid,
      collegeId: value.collegeId,
      fullname: value.fullname,
      username: value.username,
      dept: value.dept,
      email: value.email,
      mobile: value.mobile || "",
      password: hashedPassword,
      dateofjoin: value.dateofjoin ? new Date(value.dateofjoin) : new Date(),
      subjects: Array.isArray(value.subjects) ? value.subjects : [],
      // fcmToken removed - users should register tokens via settings endpoint after login
    };

    // Save to database
    await FacultyDetails.create(facultyDoc);

    // Send welcome email in background (do not await – avoids blocking response and SMTP timeouts)
    sendEmail(
      facultyDoc.email,
      "Welcome to College360x – Your Faculty Account is Ready 👩‍🏫",
      getFacultyWelcomeEmailHtml(facultyDoc.fullname, facultyDoc.facultyid, facultyDoc.dept)
    ).catch((err) => console.error("Email sending error (background):", err));

    // Respond immediately so the user is not stuck on loading
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
      // fcmToken removed - users should register tokens via settings endpoint after login
    };

    // Save to database
    await StudentDetails.create(studentDoc);

    // Send welcome email in background (do not await – avoids blocking response and SMTP timeouts)
    sendEmail(
      studentDoc.email,
      "Welcome to College360x – Your Student Account is Ready 🎓",
      getStudentWelcomeEmailHtml(studentDoc.fullname, studentDoc.studentid, studentDoc.programName)
    ).catch((err) => console.error("Email sending error (background):", err));

    // Respond immediately so the user is not stuck on loading
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
      // fcmToken removed - users should register tokens via settings endpoint after login
    };

    // Save to database
    await HOD.create(hodDoc);

    // Send welcome email in background (do not await – avoids blocking response and SMTP timeouts)
    sendEmail(
      hodDoc.email,
      "Welcome to College360x – Your HOD Portal is Ready 🏛️",
      getHODWelcomeEmailHtml(hodDoc.fullname, hodDoc.hodId, hodDoc.department)
    ).catch((err) => console.error("Email sending error (background):", err));

    // Respond immediately so the user is not stuck on loading
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
