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
      // Admin fields (for admin-created announcements)
      adminId: {
        type: String,
        required: false
      },
      adminName: {
        type: String,
        required: false
      },
      // HOD fields (for HOD-created announcements)
      hodId: {
        type: String,
        required: false
      },
      // Creator role for easier querying
      creatorRole: {
        type: String,
        enum: ["admin", "hod"],
        default: "admin"
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
    },
    // Club announcement fields (optional)
    clubId: {
      type: String,
      default: null,
      index: true
    },
    targetYears: {
      type: [String],
      enum: ["1st", "2nd", "3rd", "4th"],
      default: []
    },
    eventDate: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Custom validation: Either adminId+adminName OR hodId must be present
AnnouncementSchema.pre('validate', function(next) {
  const createdBy = this.createdBy;
  
  // Check if admin fields are present
  const hasAdminFields = createdBy?.adminId && createdBy?.adminName;
  
  // Check if HOD field is present
  const hasHodField = createdBy?.hodId;
  
  // At least one set must be present
  if (!hasAdminFields && !hasHodField) {
    this.invalidate('createdBy', 'Either adminId+adminName or hodId must be provided');
  }
  
  // Both sets should not be present (mutually exclusive)
  if (hasAdminFields && hasHodField) {
    this.invalidate('createdBy', 'Cannot have both admin and HOD fields. Use either adminId+adminName or hodId');
  }
  
  next();
});

// Index for efficient queries
AnnouncementSchema.index({ collegeId: 1, isActive: 1, createdAt: -1 });
AnnouncementSchema.index({ collegeId: 1, targetAudience: 1, isActive: 1 });
AnnouncementSchema.index({ clubId: 1, isActive: 1, createdAt: -1 });

const Announcement = mongoose.model("Announcement", AnnouncementSchema);
export default Announcement;

