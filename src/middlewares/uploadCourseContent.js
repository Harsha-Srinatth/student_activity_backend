import cloudinary from "../utils/cloudinary.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "skill-exchange-content",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
    public_id: `content-${Date.now()}-${file.originalname.split(".")[0]}`,
  }),
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only images and PDFs allowed"), false);
  },
});

export default upload;
