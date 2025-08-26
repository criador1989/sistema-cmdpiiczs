// backend/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Pasta real onde os arquivos vão (servida em /uploads via index.js)
const pastaUpload = path.join(__dirname, '..', 'uploads', 'alunos');

// Garante que existe
fs.mkdirSync(pastaUpload, { recursive: true });

// Nome único: timestamp-nome.ext (sem espaços)
function makeSafeName(original) {
  const ext = path.extname(original);
  const base = path.basename(original, ext)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .toLowerCase();
  return `${Date.now()}-${base}${ext.toLowerCase()}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pastaUpload),
  filename: (req, file, cb) => cb(null, makeSafeName(file.originalname))
});

// Aceita formatos comuns e HEIC/HEIF (vamos converter para JPG na rota)
function fileFilter(req, file, cb) {
  const ok = new Set([
    'image/jpeg', 'image/pjpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic', 'image/heif' // iPhone
  ]);
  if (!ok.has(file.mimetype)) {
    return cb(new Error('Formato não suportado. Envie JPG, PNG, WEBP, GIF ou HEIC/HEIF.'), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

module.exports = upload;
