// middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Caminho da pasta onde as imagens serão salvas
const pastaUpload = path.join(__dirname, '..', 'public', 'uploads');

// Garante que a pasta exista antes de usar
if (!fs.existsSync(pastaUpload)) {
  fs.mkdirSync(pastaUpload, { recursive: true });
}

// Configuração do armazenamento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, pastaUpload);
  },
  filename: (req, file, cb) => {
    const extensao = path.extname(file.originalname);
    const nomeBase = path.basename(file.originalname, extensao)
      .replace(/\s+/g, '_')
      .toLowerCase();

    const nomeUnico = `${Date.now()}-${nomeBase}${extensao}`;
    cb(null, nomeUnico);
  }
});

// Exporta o middleware de upload
const upload = multer({ storage });

module.exports = upload;
