import mongoose from "mongoose";

// Sub-schema for approvals handled by faculty
const ApprovalActionSchema = new mongoose.Schema(
  {
    studentid: { type: String, required: true }, // link to student
    studentName: { type: String, required: true }, // for quick reference
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
    message: { type: String }, // feedback message
  },
  { _id: false }
);

// Sub-schema for faculty dashboard statistics
const FacultyStatsSchema = new mongoose.Schema(
  {
    totalStudents: { type: Number, default: 0 },
    pendingApprovals: { type: Number, default: 0 },
    approvedCertifications: { type: Number, default: 0 },
    approvedWorkshops: { type: Number, default: 0 },
    approvedClubs: { type: Number, default: 0 },
    totalApproved: { type: Number, default: 0 },
    totalApprovals: { type: Number, default: 0 },
    approvalRate: { type: Number, default: 0 }, // percentage
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
      enum: ["certificate", "workshop", "club", "other"], 
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

    // Approvals and statistics tracking
    approvalsGiven: { type: [ApprovalActionSchema], default: [] },
    dashboardStats: { type: FacultyStatsSchema, default: {} },
    recentActivities: { type: [RecentActivitySchema], default: [] },
    
    // Legacy field for backward compatibility
    approvalsCount: { type: Number, default: 0 },
    
    // Performance metrics
    averageApprovalTime: { type: Number, default: 0 }, // in hours
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
  // Keep only last 50 activities
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

// Static methods
FacultySchema.statics.getFacultyStats = function(facultyId) {
  return this.findOne({ facultyid: facultyId })
    .select('dashboardStats approvalsGiven recentActivities')
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