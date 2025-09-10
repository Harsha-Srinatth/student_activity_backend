import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../utils/cloudinary.js";

// Multer Storage linked with Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "student_uploads", // Cloudinary folder name
    allowed_formats: ["jpg", "jpeg", "png", "pdf"],
  },
});

const upload = multer({ storage });

export default upload;