const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinaryConfig');

const createUploader = (folderName) => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: folderName,
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
      public_id: `${file.fieldname}-${Date.now()}`,
      resource_type: 'auto',
      upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET,
    }),
  });

  return multer({ storage });
};

module.exports = {
  uploadConsultation: createUploader('online_consultations'),
  uploadInventory: createUploader('inventory_images'),
  uploadProfile: createUploader('profile_pictures'),
  uploadService: createUploader('services_images'),
  uploadMedicalRecord: createUploader("medical_pet_images")
};