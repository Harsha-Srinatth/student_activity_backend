import mongoose from "mongoose";

const AnnouncementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true
    },
    collegeId: {
      type: String,
      required: true,
      index: true
    },
    targetAudience: {
      type: [String],
      enum: ["student", "faculty", "both"],
      default: ["both"],
      required: true
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium"
    },
    createdBy: {
      adminId: {
        type: String,
        required: true
      },
      adminName: {
        type: String,
        required: true
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    expiresAt: {
      type: Date
    },
    image: {
      url: {
        type: String,
        default: null
      },
      publicId: {
        type: String,
        default: null
      }
    }
  },
  { timestamps: true }
);

// Index for efficient queries
AnnouncementSchema.index({ collegeId: 1, isActive: 1, createdAt: -1 });
AnnouncementSchema.index({ collegeId: 1, targetAudience: 1, isActive: 1 });

const Announcement = mongoose.model("Announcement", AnnouncementSchema);
export default Announcement;

