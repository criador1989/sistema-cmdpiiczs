const sharp = require('sharp');

async function processarFotoAluno(fileBuffer) {
  const originalBuffer = await sharp(fileBuffer)
    .rotate()
    .resize({
      width: 1200,
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();

  const thumbBuffer = await sharp(fileBuffer)
    .rotate()
    .resize(150, 150, {
      fit: 'cover',
      position: 'centre',
    })
    .webp({ quality: 80 })
    .toBuffer();

  return {
    originalBuffer,
    thumbBuffer,
  };
}

module.exports = {
  processarFotoAluno,
};