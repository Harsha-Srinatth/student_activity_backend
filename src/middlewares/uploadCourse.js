import cloudinary from "../utils/cloudinary.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "skill-exchange-courses",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    public_id: `course-${Date.now()}-${file.originalname.split(".")[0]}`,
    transformation: [{ width: 800, height: 450, crop: "limit", quality: "auto" }],
  }),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed!"), false);
  },
});

export default upload;
