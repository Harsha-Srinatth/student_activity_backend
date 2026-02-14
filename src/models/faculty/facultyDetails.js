import mongoose from "mongoose";

// Sub-Schemas

// Section Assignment Schema
const SectionAssignmentSchema = new mongoose.Schema(
  {
    section: { type: String, required: true },
    assignmentType: { 
      type: String, 
      required: true,
      enum: ["Mentor", "Academic Advisor", "Project Guide", "Research Supervisor", "Course Coordinator"],
      default: "Mentor"
    },
    notes: { type: String },
    assignedBy: { type: String }, // HOD ID who assigned
    assignedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, _id: false }
);

// Leave approval tracking schema
const LeaveApprovalActionSchema = new mongoose.Schema(
  {
    studentid: { type: String, required: true, index: true },
    leaveRequestId: { type: String, required: true },
    leaveType: {
      type: String,
      enum: ["medical", "personal", "emergency", "family", "academic", "other"],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalDays: { type: Number, required: true },
    reason: { type: String, required: true },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      required: true,
    },
    status: {
      type: String,
      enum: ["approved", "rejected"],
      required: true,
    },
    approvedOn: { type: Date, default: Date.now, index: true },
    approvalRemarks: { type: String, maxlength: 300 },
  },
  { _id: false }
);

// Achievement/activity approval tracking schema
const ApprovalActionSchema = new mongoose.Schema(
  {
    studentid: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["certificate", "workshop", "club", "internship", "project", "other"],
      required: true,
      index: true,
    },
    description: { type: String },
    status: {
      type: String,
      enum: ["approved", "rejected"],
      required: true,
    },
    approvedOn: { type: Date, default: Date.now, index: true },
    imageUrl: { type: String },
    message: { type: String, maxlength: 500 },
  },
  { _id: false }
);
//Mian Faculty Schema
const FacultySchema = new mongoose.Schema(
  {
    // Basic Information
    facultyid: { type: String, required: true, unique: true, index: true },
    fullname: { type: String, required: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    collegeId: { type: String, required: true, index: true },
    dept: { type: String, required: true, index: true },
    designation: { type: String, default: "Faculty" },

    // Contact Information
    email: { type: String, required: true, unique: true, index: true },
    mobile: { type: String, index: true },
    password: { type: String, required: true },
    dateofjoin: { type: Date, required: true },

    // Profile Image
    image: {
      url: { type: String },
    },

    // Login Tracking
    lastLogin: { type: Date, index: true },

    // Approval Tracking
    leaveApprovalsGiven: { type: [LeaveApprovalActionSchema], default: [] },
    approvalsGiven: { type: [ApprovalActionSchema], default: [] },

    // Preferences
    notificationsEnabled: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },

    // Assignment Tracking
    sectionsAssigned: { type: [SectionAssignmentSchema], default: [] },
  },
  { timestamps: true }
);

// Compound indexes for common queries
FacultySchema.index({ collegeId: 1, dept: 1 });
FacultySchema.index({ "approvalsGiven.approvedOn": -1 }); // For efficient recent activities query
FacultySchema.index({ "leaveApprovalsGiven.approvedOn": -1 }); // For efficient recent activities query

/**
 * Record an approval action
 * Used when faculty approves/rejects student achievements
 */
FacultySchema.methods.recordApproval = function (approvalData) {
  this.approvalsGiven.push({
    ...approvalData,
    approvedOn: new Date(),
  });
  return this.save();
};

/**
 * Record a leave approval action
 * Used when faculty approves/rejects leave requests
 */
FacultySchema.methods.recordLeaveApproval = function (leaveApprovalData) {
  this.leaveApprovalsGiven.push({
    ...leaveApprovalData,
    approvedOn: new Date(),
  });
  return this.save();
};

/**
 * Get recent activities for faculty (derived from approvals)
 * Returns last N activities sorted by timestamp
 * Student names are fetched by studentid when needed
 */
FacultySchema.statics.getRecentActivities = async function (facultyId, limit = 30) {
  const faculty = await this.findOne({ facultyid: facultyId })
    .select("approvalsGiven leaveApprovalsGiven")
    .lean();
  
  if (!faculty) return [];
  
  const activities = [];
  const studentIds = new Set();
  
  // Collect all student IDs
  (faculty.approvalsGiven || []).forEach(approval => {
    if (approval.studentid) studentIds.add(approval.studentid);
  });
  (faculty.leaveApprovalsGiven || []).forEach(leaveApproval => {
    if (leaveApproval.studentid) studentIds.add(leaveApproval.studentid);
  });
  
  // Fetch student names by studentid
  const StudentDetails = (await import("../student/studentDetails.js")).default;
  const students = await StudentDetails.find({ studentid: { $in: Array.from(studentIds) } })
    .select('studentid fullname')
    .lean();
  const studentMap = new Map(students.map(s => [s.studentid, s.fullname]));
  
  // Convert approvalsGiven to activity format
  // Normalize status: "verified" -> "approved" for backward compatibility
  (faculty.approvalsGiven || []).forEach(approval => {
    const normalizedStatus = approval.status === 'verified' ? 'approved' : (approval.status || 'approved');
    activities.push({
      studentid: approval.studentid,
      studentName: studentMap.get(approval.studentid) || approval.studentid,
      action: normalizedStatus,
      type: approval.type,
      description: approval.description,
      timestamp: approval.approvedOn,
      imageUrl: approval.imageUrl,
      message: approval.message,
    });
  });
  
  // Convert leaveApprovalsGiven to activity format
  (faculty.leaveApprovalsGiven || []).forEach(leaveApproval => {
    activities.push({
      studentid: leaveApproval.studentid,
      studentName: studentMap.get(leaveApproval.studentid) || leaveApproval.studentid,
      action: leaveApproval.status,
      type: "leave_request",
      description: `${leaveApproval.status.charAt(0).toUpperCase() + leaveApproval.status.slice(1)} ${leaveApproval.leaveType} leave request`,
      timestamp: leaveApproval.approvedOn,
      approvalRemarks: leaveApproval.approvalRemarks,
    });
  });
  
  // Sort by timestamp (newest first) and return last N
  return activities
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

const FacultyDetails = mongoose.model("Faculty", FacultySchema);

export default FacultyDetails;
