import mongoose from "mongoose";

const HODSchema = new mongoose.Schema(
  {
    hodId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    collegeId: {
      type: String,
      required: true,
      index: true
    },
    department: {
      type: String,
      required: true,
      index: true
    },
    mobile: {
      type: String,
      required: true,
      index: true
    },
    username: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    fullname: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true
    },

    password: {
      type: String,
      required: true,
      select: false // prevents password from being returned in queries
    },

    isActive: {
      type: Boolean,
      default: true
    },

    lastLogin: {
      type: Date
    },

    // Firebase Cloud Messaging Tokens for push notifications (multi-device support)
    // Array of device objects: { deviceId, token, deviceName, lastUsed }
    fcmDevices: [{
      deviceId: { type: String, required: true, index: true },
      token: { type: String, required: true, index: true },
      deviceName: { type: String, default: "Unknown Device" },
      lastUsed: { type: Date, default: Date.now },
      createdAt: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

const HOD = mongoose.model("HOD", HODSchema);
export default HOD;

