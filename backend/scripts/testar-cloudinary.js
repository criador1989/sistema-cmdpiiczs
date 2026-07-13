require('dotenv').config();
const cloudinary = require('../utils/cloudinary');

(async () => {
  try {
    const ping = await cloudinary.api.ping();
    console.log('✅ Cloudinary OK:', ping.status);
    process.exit(0);
  } catch (e) {
    console.error('❌ Erro Cloudinary:', e.message);
    process.exit(1);
  }
})();
