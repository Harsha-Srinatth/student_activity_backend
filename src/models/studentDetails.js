import mongoose from "mongoose";

// Sub-schema for certifications
const CertificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    issuer: { type: String },
    dateIssued: { type: Date },
    imageUrl: { type: String },
    verification: {
      verifiedBy: { type: String },
      date: { type: Date },
      status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
      remarks: { type: String },
    },
  }
);

// Sub-schema for workshops
const WorkshopSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    organizer: { type: String },
    date: { type: Date },
    certificateUrl: { type: String },
    verification: {
      verifiedBy: { type: String },
      date: { type: Date },
      status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
      remarks: { type: String },
    },
  }
);

// Sub-schema for clubs
const ClubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    role: { type: String, default: "member" },
    joinedOn: { type: Date, default: Date.now },
    imageUrl: { type: String },
    verification: {
      verifiedBy: { type: String },
      date: { type: Date },
      status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
      remarks: { type: String },
    },
  }
);

const InternshipSchema = new mongoose.Schema(
  {
    organization: { type: String, required: true },
    role: { type: String, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    description: { type: String },
    projects: [String],
    recommendationUrl: { type: String },
    imageUrl: {type: String},
    verification: {
      verifiedBy: { type: String },
      date: { type: Date },
      status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
      remarks: { type: String },
    },
  },
  { _id: false }
);
//Projects
const ProjectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    technologies: [String],
    outcome: { type: String },
    repoLink: { type: String },
    demoLink: { type: String },
    imageUrl: { type: String },
    verification: {
      verifiedBy: { type: String },
      date: { type: Date },
      status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
      remarks: { type: String },
    },
  }
);

// Sub-schema for pending approvals
const ApprovalSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "certificate",
        "workshop",
        "club",
        "internship",
        "project",
        "other",
      ],
      required: true,
    },
    description: { type: String },
    requestedOn: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedOn: { type: Date },
    reviewedBy: { type: String }, // facultyid or name
    message: { type: String }, // remarks/feedback
  }
);

// Main Student Schema
const StudentDetailSchema = new mongoose.Schema(
  {
    studentid: { type: String, required: true, unique: true, index: true },
    fullname: { type: String, required: true },
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },

    image: {
      url: {
        type: String,
        default:
          "",
      },
    },

    role: {
      type: String,
      enum: ["student", "faculty"],
      default: "student",
      required: true,
    },

    mobileno: { type: String, unique: true, required: true, index: true },
    institution: { type: String, required: true, index: true },
    programName: { type: String, required: true },
    dept: { type: String, required: true, index: true },
    semester: { type: String },
    dateofjoin: { type: Date, required: true },
    facultyid: {type: String,required: true},

    // Arrays with defaults
    certifications: { type: [CertificationSchema], default: [] },
    workshops: { type: [WorkshopSchema], default: [] },
    clubsJoined: { type: [ClubSchema], default: [] },
    pendingApprovals: { type: [ApprovalSchema], default: [] },

    internships: { type: [InternshipSchema], default: [] },
    projects: { type: [ProjectSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

// Compound index
StudentDetailSchema.index({
  institution: 1,
  dept: 1,
  studentid: 1,
  mobileno: 1,
  username: 1,
  email: 1,
  facultyid: 1,
});

const StudentDetails = mongoose.model("StudentDetails", StudentDetailSchema);

export default StudentDetails;