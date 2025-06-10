const multer = require('multer');
const path = require('path');
const fs = require('fs');

const pastaUpload = path.join(__dirname, '..', 'public', 'uploads');

// Garante que a pasta exista
fs.mkdirSync(pastaUpload, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, pastaUpload);
  },
  filename: (req, file, cb) => {
    const nomeSeguro = file.originalname.replace(/\s+/g, '_').toLowerCase();
    const nomeUnico = Date.now() + '-' + nomeSeguro;
    cb(null, nomeUnico);
  }
});

const upload = multer({ storage });

module.exports = upload;
