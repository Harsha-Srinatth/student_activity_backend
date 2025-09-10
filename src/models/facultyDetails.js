import mongoose from "mongoose";

// Sub-schema for approvals handled by faculty
const ApprovalActionSchema = new mongoose.Schema(
  {
    studentid: { type: String, required: true }, // link to student
    type: { 
      type: String, 
      enum: ["certificate", "workshop", "club", "other"], 
      required: true 
    },
    description: { type: String },
    status: { 
      type: String, 
      enum: ["approved", "rejected"], 
      required: true 
    },
    approvedOn: { type: Date, default: Date.now },
  },
  { _id: false }
);

const FacultySchema = new mongoose.Schema(
  {
    facultyid: { type: String, required: true, unique: true, index: true },
    fullname: { type: String, required: true },
    username: { type: String, required: true, unique: true, index: true },
    institution: { type: String, required: true },
    dept: { type: String, required: true },
    designation: { type: String, default: "Faculty" }, // NEW

    email: { type: String, required: true, unique: true, index: true },
    mobile: { type: String },
    password: { type: String, required: true },
    dateofjoin: { type: Date, required: true },

    image: {
      url: { type: String },
    },

    // NEW: approvals handled
    approvalsGiven: { type: [ApprovalActionSchema], default: [] },

    // NEW: quick count
    approvalsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

FacultySchema.index({ institution: 1, dept: 1 });

const FacultyDetails = mongoose.model("Faculty", FacultySchema);

export default FacultyDetails;