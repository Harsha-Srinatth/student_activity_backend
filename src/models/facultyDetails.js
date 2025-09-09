// src/models/Faculty.js
import mongoose from "mongoose";

const FacultySchema = new mongoose.Schema(
  {
    facultyid: { type: String, required: true, unique: true, index: true },
    fullname: { type: String, required: true },
    username: { type: String, required: true, unique: true, index: true },
    institution: { type: String, required: true },
    dept: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    mobile: { type: String },
    password: { type: String, required: true },
    dateofjoin: { type: Date, required: true },
    image:{
        url: {
            type : String
        }
    }
  },
  { timestamps: true }
);

// Compound indexes can be added if needed
FacultySchema.index({ institution: 1, dept: 1 });

const FacultyDetails = mongoose.model("Faculty", FacultySchema);

export default FacultyDetails
