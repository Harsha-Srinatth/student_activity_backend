import mongoose from "mongoose";


// Enrollments (track club joining requests)
const EnrollmentSchema = new mongoose.Schema(
  {
    clubId: { type: String, required: true },
    clubName: { type: String, required: true },
    studentName: { type: String, required: true },
    regno: { type: String, required: true },
    branch: { type: String, required: true },
    section: { type: String, required: true },
    dept: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

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

// Attendance and Academic Records
const AttendanceEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    period: { type: Number, required: true, min: 1, max: 8 },
    present: { type: Boolean, default: true },
    markedByFacultyId: { type: String, required: true },
  },
  { _id: false }
);

const MidMarkSchema = new mongoose.Schema(
  {
    subjectCode: { type: String, required: true },
    subjectName: { type: String },
    max: { type: Number, default: 30 },
    obtained: { type: Number, default: 0 },
  },
  { _id: false }
);

const SemesterRecordSchema = new mongoose.Schema(
  {
    semesterNumber: { type: Number, required: true, min: 1, max: 8 },
    // Each semester has two mids; each mid can have up to 6 subjects as per requirement
    mid1: { type: [MidMarkSchema], default: [] },
    mid2: { type: [MidMarkSchema], default: [] },
  },
  { _id: false }
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

    // Attendance: Individual daily-period entries
    attendance: { type: [AttendanceEntrySchema], default: [] },
    // Enrollments 
    enrollments: { type: [EnrollmentSchema], default: [] },
    // Academic records: Up to 8 semesters, each with two mids
    academicRecords: { type: [SemesterRecordSchema], default: [] },
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