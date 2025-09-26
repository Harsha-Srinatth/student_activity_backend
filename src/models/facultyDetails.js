import mongoose from "mongoose";

// Sub-schema for leave request approvals handled by faculty
const LeaveApprovalActionSchema = new mongoose.Schema(
  {
    studentid: { type: String, required: true },
    studentName: { type: String, required: true },
    leaveRequestId: { type: String, required: true }, // ObjectId as string
    leaveType: { 
      type: String, 
      enum: ["medical", "personal", "emergency", "family", "academic", "other"], 
      required: true 
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
      required: true 
    },
    approvedOn: { type: Date, default: Date.now },
    reviewedBy: { type: String, required: true },
    approvalRemarks: { type: String, maxlength: 300 },
  },
  { _id: false }
);

// Sub-schema for approvals handled by faculty
const ApprovalActionSchema = new mongoose.Schema(
  {
    studentid: { type: String, required: true },
    studentName: { type: String, required: true },
    institution: { type: String },
    type: { 
      type: String, 
      enum: ["certificate", "workshop", "club", "internship", "project", "other"], 
      required: true 
    },
    description: { type: String },
    status: { 
      type: String, 
      enum: ["approved", "rejected"], 
      required: true 
    },
    approvedOn: { type: Date, default: Date.now },
    reviewedBy: { type: String },
    imageUrl: { type: String },
    message: { type: String },
  },
  { _id: false }
);

// Sub-schema for faculty dashboard statistics
const FacultyStatsSchema = new mongoose.Schema(
  {
    totalStudents: { type: Number, default: 0 },
    pendingApprovals: { type: Number, default: 0 },
    pendingLeaveRequests: { type: Number, default: 0 },
    approvedLeaveRequests: { type: Number, default: 0 },
    rejectedLeaveRequests: { type: Number, default: 0 },
    totalLeaveRequests: { type: Number, default: 0 },
    approvedCertifications: { type: Number, default: 0 },
    approvedWorkshops: { type: Number, default: 0 },
    approvedClubs: { type: Number, default: 0 },
    totalApproved: { type: Number, default: 0 },
    totalApprovals: { type: Number, default: 0 },
    approvalRate: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Sub-schema for recent activity tracking
const RecentActivitySchema = new mongoose.Schema(
  {
    studentid: { type: String, required: true },
    studentName: { type: String, required: true },
    action: { 
      type: String, 
      enum: ["approved", "rejected", "viewed"], 
      required: true 
    },
    type: { 
      type: String, 
      enum: ["certificate", "workshop", "club", "internship", "project", "leave_request", "other"], 
      required: true 
    },
    description: { type: String },
    timestamp: { type: Date, default: Date.now },
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
    designation: { type: String, default: "Faculty" },

    email: { type: String, required: true, unique: true, index: true },
    mobile: { type: String },
    password: { type: String, required: true },
    dateofjoin: { type: Date, required: true },

    image: {
      url: { type: String },
    },

    // Leave request approvals
    leaveApprovalsGiven: { type: [LeaveApprovalActionSchema], default: [] },
    
    // Other approvals and statistics tracking
    approvalsGiven: { type: [ApprovalActionSchema], default: [] },
    dashboardStats: { type: FacultyStatsSchema, default: {} },
    recentActivities: { type: [RecentActivitySchema], default: [] },
    
    // Legacy field for backward compatibility
    approvalsCount: { type: Number, default: 0 },
    
    // Performance metrics
    averageApprovalTime: { type: Number, default: 0 },
    totalHoursWorked: { type: Number, default: 0 },
    lastLogin: { type: Date, default: Date.now },
    
    // Preferences
    notificationsEnabled: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
  },
  { timestamps: true }
);

FacultySchema.index({ institution: 1, dept: 1 });

// Instance methods
FacultySchema.methods.updateStats = function(stats) {
  this.dashboardStats = { ...this.dashboardStats, ...stats, lastUpdated: new Date() };
  return this.save();
};

FacultySchema.methods.addRecentActivity = function(activity) {
  if (this.recentActivities.length >= 50) {
    this.recentActivities = this.recentActivities.slice(-49);
  }
  this.recentActivities.push(activity);
  return this.save();
};

FacultySchema.methods.recordApproval = function(approvalData) {
  this.approvalsGiven.push(approvalData);
  this.approvalsCount = this.approvalsGiven.length;
  return this.save();
};

FacultySchema.methods.recordLeaveApproval = function(leaveApprovalData) {
  this.leaveApprovalsGiven.push(leaveApprovalData);
  return this.save();
};

// Static methods
FacultySchema.statics.getFacultyStats = function(facultyId) {
  return this.findOne({ facultyid: facultyId })
    .select('dashboardStats approvalsGiven leaveApprovalsGiven recentActivities')
    .lean();
};

FacultySchema.statics.updateFacultyStats = async function(facultyId, stats) {
  return this.findOneAndUpdate(
    { facultyid: facultyId },
    { 
      $set: { 
        'dashboardStats': { ...stats, lastUpdated: new Date() },
        'lastLogin': new Date()
      }
    },
    { new: true }
  );
};

const FacultyDetails = mongoose.model("Faculty", FacultySchema);

export default FacultyDetails;