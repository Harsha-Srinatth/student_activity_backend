// src/controllers/authController.js
import Joi from "joi";
import { registrationQueue } from "../queue/registrationQueue.js";


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
  dateofjoin: Joi.date().iso().required(),
});

export const enqueueFacultyRegistration = async (req, res) => {
  try {
    const { error, value } = facultySchema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Create a job id derived from unique field to avoid accidental duplicates in queue
    const jobId = `faculty:${value.email || value.facultyid || value.username}`;

    // add job to queue (fast)
    await registrationQueue.add("faculty-register", value, {
      jobId,
      removeOnComplete: { age: 3600, count: 1000 }, // keep short
      removeOnFail: { age: 3600, count: 1000 },
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
    });

    // immediately respond — background worker will handle DB insertion
    return res.status(202).json({
      message: "Registration submitted. Processing in background.",
      jobId,
    });
  } catch (err) {
    console.error("enqueue error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const enqueueStudentRegistration = async (req, res) => {
  try {
    const { error, value } = studentSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message });

    // Unique job ID
    const jobId = `student:${value.email || value.studentid || value.username}`;

    // Add to queue
    await registrationQueue.add("student-register", value, {
      jobId,
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 3600, count: 1000 },
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
    });

    return res.status(202).json({
      message: "Student registration submitted. Processing in background.",
      jobId,
    });
  } catch (err) {
    console.error("enqueue error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
