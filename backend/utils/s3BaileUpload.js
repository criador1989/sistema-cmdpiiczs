'use strict';

const crypto = require('crypto');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const AWS_REGION = process.env.AWS_REGION || 'sa-east-1';
const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME;
const AWS_CDN_URL = (process.env.AWS_CDN_URL || '').replace(/\/+$/, '');
const AWS_S3_BASE_URL = (process.env.AWS_S3_BASE_URL || '').replace(/\/+$/, '');

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function limparNomeArquivo(nome = '') {
  return String(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function gerarKeyBaile({ instituicaoId, alunoId, tipo, originalname }) {
  const ext = path.extname(originalname || '').toLowerCase() || '.bin';
  const base = limparNomeArquivo(path.basename(originalname || 'arquivo', ext));
  const hash = crypto.randomBytes(8).toString('hex');

  return [
    'baile-formatura',
    String(instituicaoId || 'sem-instituicao'),
    String(alunoId || 'sem-aluno'),
    String(tipo || 'arquivo'),
    `${Date.now()}-${hash}-${base}${ext}`,
  ].join('/');
}

function montarUrlPublica(key) {
  if (AWS_S3_BASE_URL) {
    return `${AWS_S3_BASE_URL}/${key}`;
  }

  return `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
}

async function uploadArquivoBaile({
  file,
  instituicaoId,
  alunoId,
  tipo = 'arquivo',
}) {
  if (!AWS_BUCKET_NAME) {
    throw new Error('AWS_BUCKET_NAME não configurado no ambiente.');
  }

  if (!file || !file.buffer) {
    throw new Error('Arquivo inválido para upload.');
  }

  const key = gerarKeyBaile({
    instituicaoId,
    alunoId,
    tipo,
    originalname: file.originalname,
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream',
    })
  );

  return {
    key,
    url: montarUrlPublica(key),
  };
}

async function deletarArquivoBaile(key) {
  if (!key || !AWS_BUCKET_NAME) return;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
    })
  );
}

module.exports = {
  uploadArquivoBaile,
  deletarArquivoBaile,
};