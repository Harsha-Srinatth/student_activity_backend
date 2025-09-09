import mongoose from "mongoose";

const StudentDetailSchema = new mongoose.Schema(
  {
    studentid: { type: String, required: true, unique: true,index: true },
    fullname: { type: String, required: true },
    username: { type: String, required: true, unique: true,index: true },
    email: { type: String, required: true, unique: true,index: true },
    password: { type: String, required: true },
    image: {
      url: {
        type: String,
        default: 'https://res.cloudinary.com/demo/image/upload/v1/default_avatar.png'
      },
    },
    role: { type: String, enum: ['student', 'faculty'], default: 'student', required: true },
    mobileno: { type: String, unique: true, required: true,index: true },
    institution: { type: String, required: true ,index: true},
    programName: { type: String, required: true },
    dept: { type: String, required: true,index: true },
    semester: { type: String },
    dateofjoin: { type: Date, required: true },
  },
  { timestamps: true }
);

StudentDetailSchema.index({ institution: 1, dept: 1, studentid: 1, mobileno: 1 ,username: 1,email: 1});

const StudentDetails = mongoose.model('StudentDetails', StudentDetailSchema);

export default StudentDetails;
