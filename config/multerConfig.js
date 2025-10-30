const multer = require('multer');
const cloudinary = require('./cloudinaryConfig');
const path = require('path');
const fs = require('fs');

const storage = multer.memoryStorage();

const createUploader = (folderName) => {
  const upload = multer({ storage });

  const uploadToCloudinary = async (req, res, next) => {
    try {
      if (!req.file) return next();

      const fileBuffer = req.file.buffer;
      const tempFilePath = path.join(__dirname, 'tmp', `${Date.now()}-${req.file.originalname}`);

      fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });

      fs.writeFileSync(tempFilePath, fileBuffer);

      const result = await cloudinary.uploader.upload(tempFilePath, {
        folder: folderName,
        resource_type: 'auto',
        upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET,
      });

      req.file.path = result.secure_url;

      fs.unlinkSync(tempFilePath);

      next();
    } catch (err) {
      console.error('Cloudinary upload error:', err);
      res.status(500).json({ success: false, error: 'Image upload failed' });
    }
  };

  return [upload.single('photo'), uploadToCloudinary];
};

module.exports = {
  uploadConsultation: createUploader('online_consultations'),
  uploadInventory: createUploader('inventory_images'),
  uploadProfile: createUploader('profile_pictures'),
  uploadService: createUploader('services_images'),
  uploadMedicalRecord: createUploader('medical_pet_images'),
};
