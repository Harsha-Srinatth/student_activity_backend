import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema(
  {
    adminId: {
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
    }
  },
  { timestamps: true }
);

const Admin = mongoose.model("Admin", AdminSchema);
export default Admin;
