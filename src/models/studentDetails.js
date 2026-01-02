import mongoose from "mongoose";

// Verification Schema for achievements
const VerificationSchema = new mongoose.Schema(
  {
    verifiedBy: { type: String }, // Faculty ID who verified
    date: { type: Date }, // Date of verification
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    remarks: { type: String }, // Additional remarks from faculty
  },
  { _id: false }
);

// Leave Request Schema (embedded in Student)
const LeaveRequestSchema = new mongoose.Schema(
  {
    leaveType: {
      type: String,
      enum: ["medical", "personal", "emergency", "family", "academic", "other"],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalDays: { type: Number, required: true },
    reason: { type: String, required: true, maxlength: 500 },
    
    // Status and Approval
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    
    // Faculty Response
    reviewedBy: { type: String }, // Faculty ID who reviewed
    reviewedAt: { type: Date },
    approvalRemarks: { type: String, maxlength: 300 },
    
    // System Timestamps
    submittedAt: { type: Date, default: Date.now },
    
    // Priority Level
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    
    // Emergency Contact (for emergency leaves)
    emergencyContact: {
      name: { type: String },
      phone: { type: String },
      relation: { type: String },
    },
    
    // Academic Impact
    alternateAssessmentRequired: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Enrollments (track enrollment requests)
const EnrollmentSchema = new mongoose.Schema(
  {
    enrollmentId: { type: String, required: true },
    enrollmentName: { type: String, required: true },
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
    verification: VerificationSchema,
  }
);

// Sub-schema for workshops
const WorkshopSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    organizer: { type: String },
    date: { type: Date },
    certificateUrl: { type: String },
    imageUrl: { type: String },
    verification: VerificationSchema,
  }
);

// Sub-schema for clubs
const ClubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    clubId: { type: String },
    role: { type: String, default: "member" },
    joinedOn: { type: Date, default: Date.now },
    amountPaid: { type: Number, default: 0 },
    imageUrl: { type: String },
    verification: VerificationSchema,
  }
);

const InternshipSchema = new mongoose.Schema(
  {
    organization: { type: String, required: true },
    role: { type: String, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    description: { type: String },
    recommendationUrl: { type: String },
    projectUrl: { type: String },
    imageUrl: { type: String },
    verification: VerificationSchema,
  },
  { _id: false }
);

// Projects
const ProjectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    technologies: [String],
    outcome: { type: String },
    repoLink: { type: String },
    demoLink: { type: String },
    imageUrl: { type: String },
    verification: VerificationSchema,
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
    collegeId: { type: String, required: true },
    fullname: { type: String, required: true },
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },

    image: {
      url: {
        type: String,
        default: "",
      },
    },

    role: {
      type: String,
      enum: ["student", "faculty"],
      default: "student",
      required: true,
    },
    // Contact Information
    mobileno: { type: String, unique: true, required: true, index: true },
    programName: { type: String, required: true },
    dept: { type: String, required: true, index: true },
    semester: { type: String },
    dateofjoin: { type: Date, required: true },
    facultyid: {type: String, required: true},

    // Certifications
    certifications: { type: [CertificationSchema], default: [] },
    // Workshops
    workshops: { type: [WorkshopSchema], default: [] },
    // Clubs
    clubsJoined: { type: [ClubSchema], default: [] },
    // Enrollments 
    enrollments: { type: [EnrollmentSchema], default: [] },
    // Internships
    internships: { type: [InternshipSchema], default: [] },
    // Projects
    projects: { type: [ProjectSchema], default: [] },
    // Leave Requests Array
    leaveRequests: { type: [LeaveRequestSchema], default: [] },
    // Attendance: Individual daily-period entries
    attendance: { type: [AttendanceEntrySchema], default: [] },
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