import mongoose from "mongoose";
import crypto from "crypto";

const generateCourseId = () => crypto.randomBytes(4).toString("hex").toUpperCase();

// Content item: frontend sends type + (url | file) + optional caption; backend stores below
const CourseContentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["text", "image", "pdf", "video"], default: "text" },
    url: { type: String }, // text content or file/video URL
    caption: { type: String },
    createdBy: { type: String },
  },
  { timestamps: true }
);

const CourseSchema = new mongoose.Schema(
  {
    courseId: { type: String, required: true, unique: true, default: generateCourseId },
    collegeId: { type: String, required: true, index: true },
    creatorId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    durationDays: { type: Number, required: true, min: 1 },
    coverImage: { url: { type: String }, publicId: { type: String } },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvalDetails: {
      approvedBy: { type: String },
      approvedAt: { type: Date },
      rejectedBy: { type: String },
      rejectedAt: { type: Date },
      reason: { type: String },
    },
    joinedStudents: [{ studentId: { type: String, required: true }, joinedAt: { type: Date, default: Date.now } }],
    // Student feedback/reviews submitted after course duration ends (before faculty awards points)
    studentReviews: [{
      studentId: { type: String, required: true },
      rating: { type: Number, min: 1, max: 5 }, // optional 1–5 stars
      reviewText: { type: String, maxlength: 1000 },
      submittedAt: { type: Date, default: Date.now },
    }],
    content: [CourseContentSchema],
    isPaid: { type: Boolean, default: false },
    joinAmount: { type: Number, default: 0, min: 0 }, // Amount (e.g. in rupees) to join when isPaid is true
    creatorName: { type: String },
    creatorContact: { type: String },
    groupId: { type: String, index: true }, // creator shares this so others can join by group ID
    groupStatus: { type: String, enum: ["on-going", "completed"], default: "on-going" }, // on-going until faculty completes all joined students
    completedBy: [{
      studentId: { type: String, required: true },
      completedAt: { type: Date, default: Date.now },
      facultyFeedback: { type: String },
      pointsAwarded: { type: Number, min: 0, max: 50, default: 50 },
    }],
  },
  { timestamps: true }
);

CourseSchema.index({ collegeId: 1, status: 1 });
CourseSchema.index({ creatorId: 1 });
CourseSchema.index({ courseId: 1 });
CourseSchema.index({ status: 1, "approvalDetails.approvedAt": -1 }); // for getCoursesForCompletion

const Course = mongoose.model("Course", CourseSchema);
export default Course;
