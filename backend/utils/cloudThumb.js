const cloudinary = require('./cloudinary');

/**
 * Gera URL de miniatura Cloudinary
 * @param {string} publicId - ID público salvo no aluno
 * @param {number} w - largura
 * @param {number} h - altura
 */
function cloudThumb(publicId, w = 120, h = 120) {
  if (!publicId) return null;
  return cloudinary.url(publicId, {
    width: w,
    height: h,
    crop: 'fill',
    gravity: 'face',
    format: 'jpg',
    quality: 'auto'
  });
}

module.exports = cloudThumb;
