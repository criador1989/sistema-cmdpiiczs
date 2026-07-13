const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const path = require('path');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'sa-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BUCKET = process.env.AWS_BUCKET_NAME;
const CDN = process.env.AWS_CDN_URL || process.env.AWS_S3_BASE_URL || '';

function extSegura(nome = '') {
  const ext = path.extname(nome).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext;
  return '.jpg';
}

async function uploadFotoRedacao({ buffer, originalname, mimetype, tenantId, alunoId }) {
  if (!BUCKET) throw new Error('AWS_BUCKET_NAME não configurado.');

  const id = crypto.randomBytes(12).toString('hex');
  const ext = extSegura(originalname);

  const key = `redacoes-manuscritas/${tenantId || 'sem-tenant'}/${alunoId || 'sem-aluno'}/${Date.now()}-${id}${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype || 'image/jpeg'
  }));

  return {
    key,
    url: CDN ? `${CDN.replace(/\/$/, '')}/${key}` : null,
    bucket: BUCKET
  };
}

async function deletarFotoRedacao(key) {
  if (!BUCKET || !key) return;

  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key
  }));
}

module.exports = {
  uploadFotoRedacao,
  deletarFotoRedacao
};