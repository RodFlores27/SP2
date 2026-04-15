const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const DEFAULT_BASE_FOLDER = process.env.CLOUDINARY_FOLDER || 'ptcf/dev';

function resolveCloudinaryFolder(folder) {
  if (!folder) return DEFAULT_BASE_FOLDER;

  // Preserve fully-qualified paths for backward compatibility.
  if (folder.startsWith('ptcf/')) return folder;

  return `${DEFAULT_BASE_FOLDER}/${folder}`;
}

const uploadToCloudinary = async (
  fileBuffer,
  folder
) => {
  return new Promise((resolve, reject) => {
    const resolvedFolder = resolveCloudinaryFolder(folder);
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: resolvedFolder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );

    uploadStream.end(fileBuffer);
  });
};

module.exports = {
  uploadToCloudinary,
  cloudinary,
};
