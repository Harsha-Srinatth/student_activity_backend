// src/controllers/authController.js
import Joi from "joi";
import bcrypt from "bcryptjs";
import FacultyDetails from "../models/facultyDetails.js";
import StudentDetails from "../models/studentDetails.js";


// Validation schema
const facultySchema = Joi.object({
  facultyid: Joi.string().trim().required(),
  fullname: Joi.string().trim().min(2).required(),
  username: Joi.string().trim().min(3).required(),
  institution: Joi.string().trim().required(),
  dept: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().pattern(/^[0-9+ -]{7,20}$/).optional().allow(""),
  password: Joi.string().min(8).required(),
  dateofjoin: Joi.date().iso().required(),
});

//validate student details
const studentSchema = Joi.object({
  studentid: Joi.string().trim().required(),
  fullname: Joi.string().trim().min(2).required(),
  username: Joi.string().trim().min(3).required(),
  institution: Joi.string().trim().required(),
  dept: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  mobileno: Joi.string().pattern(/^[0-9+ -]{7,20}$/).required(),
  password: Joi.string().min(8).required(),
  programName: Joi.string().trim().required(),
  semester: Joi.string().trim().optional().allow(""),
  facultyid: Joi.string().trim().required(),
  dateofjoin: Joi.date().iso().required(),
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
      fullname: value.fullname,
      username: value.username,
      institution: value.institution,
      dept: value.dept,
      email: value.email,
      mobile: value.mobile,
      password: hashedPassword,
      dateofjoin: value.dateofjoin,
    };

    // Save to database
    await FacultyDetails.create(facultyDoc);

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
      fullname: value.fullname,
      username: value.username,
      institution: value.institution,
      dept: value.dept,
      email: value.email,
      mobileno: value.mobileno,
      password: hashedPassword,
      programName: value.programName,
      semester: value.semester,
      facultyid: value.facultyid,
      dateofjoin: value.dateofjoin,
    };

    // Save to database
    await StudentDetails.create(studentDoc);

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
