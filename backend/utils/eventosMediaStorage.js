'use strict';

const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const REGION = process.env.AWS_REGION || 'sa-east-1';
const BUCKET = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME || '';
const CDN = String(process.env.AWS_CDN_URL || process.env.AWS_S3_BASE_URL || '').replace(/\/+$/, '');

function s3Configured() {
  return Boolean(BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

function s3Client() {
  if (!s3Configured()) return null;
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function safeName(name = 'arquivo') {
  const ext = path.extname(name || '').toLowerCase();
  const base = path.basename(name || 'arquivo', ext)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'arquivo';
  return `${base}${ext}`;
}

function makeKey({ eventSlug, tipo, originalname }) {
  const id = crypto.randomBytes(10).toString('hex');
  return ['eventos', eventSlug, tipo || 'media', `${Date.now()}-${id}-${safeName(originalname)}`].join('/');
}

function gridBucket() {
  if (!mongoose.connection?.db) throw new Error('MongoDB ainda não está conectado.');
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'evento_media' });
}

async function uploadGrid(file, metadata = {}) {
  return new Promise((resolve, reject) => {
    const stream = gridBucket().openUploadStream(file.originalname || `media-${Date.now()}`, {
      contentType: file.mimetype || 'application/octet-stream',
      metadata,
    });
    stream.on('error', reject);
    stream.on('finish', () => resolve({
      mediaId: String(stream.id),
      storageProvider: 'gridfs',
      storageKey: '',
      storageUrl: '',
    }));
    stream.end(file.buffer);
  });
}

async function uploadS3(file, { eventSlug, tipo }) {
  const key = makeKey({ eventSlug, tipo, originalname: file.originalname });
  await s3Client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return {
    mediaId: crypto.randomBytes(16).toString('hex'),
    storageProvider: 's3',
    storageKey: key,
    storageUrl: CDN ? `${CDN}/${key}` : '',
  };
}

async function saveEventMedia(file, { eventSlug, tipo = 'media', metadata = {} } = {}) {
  if (!file?.buffer) throw new Error('Arquivo inválido para armazenamento.');
  if (!eventSlug) throw new Error('eventSlug é obrigatório.');
  if (s3Configured()) return uploadS3(file, { eventSlug, tipo });
  return uploadGrid(file, { eventSlug, tipo, ...metadata });
}

async function deleteGrid(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return;
  try { await gridBucket().delete(new mongoose.Types.ObjectId(String(id))); } catch (e) {
    if (!/FileNotFound/i.test(String(e?.message || ''))) throw e;
  }
}

async function deleteS3(key) {
  if (!key || !s3Configured()) return;
  await s3Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function deleteEventMedia(ref = {}) {
  if (ref.storageProvider === 's3') return deleteS3(ref.storageKey);
  if (ref.storageProvider === 'gridfs' || (!ref.storageProvider && ref.mediaId)) return deleteGrid(ref.mediaId);
}

function contentDisposition(filename, download) {
  if (!filename) return null;
  const safe = String(filename).replace(/[\r\n"]/g, '_');
  return `${download ? 'attachment' : 'inline'}; filename="${safe}"`;
}

function parseByteRange(rangeHeader, size) {
  const raw = String(rangeHeader || '').trim();
  if (!raw || !Number.isFinite(size) || size <= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!m) return null;
  let start = m[1] ? Number(m[1]) : null;
  let end = m[2] ? Number(m[2]) : null;
  if (start == null && end == null) return null;
  if (start == null) {
    const suffix = end;
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    if (!Number.isFinite(start) || start < 0 || start >= size) return { invalid: true };
    if (end == null || !Number.isFinite(end) || end >= size) end = size - 1;
    if (end < start) return { invalid: true };
  }
  return { start, end };
}

async function streamGrid(res, ref, opts = {}) {
  const id = ref.mediaId;
  if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(404).end();
  const objectId = new mongoose.Types.ObjectId(String(id));
  const bucket = gridBucket();
  const file = await bucket.find({ _id: objectId }).next();
  if (!file) return res.status(404).end();
  const size = Number(file.length || 0);
  const range = parseByteRange(opts.range, size);
  if (range?.invalid) {
    res.status(416).setHeader('Content-Range', `bytes */${size}`);
    return res.end();
  }
  const contentType = opts.contentType || file.contentType || 'application/octet-stream';
  res.type(contentType);
  const disp = contentDisposition(opts.filename, opts.download);
  if (disp) res.setHeader('Content-Disposition', disp);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', opts.publicCache ? 'public, max-age=3600' : 'private, max-age=0, no-cache');
  if (range) {
    const len = range.end - range.start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader('Content-Length', String(len));
    const stream = bucket.openDownloadStream(objectId, { start: range.start, end: range.end + 1 });
    stream.on('error', () => { if (!res.headersSent) res.status(404); res.end(); });
    return stream.pipe(res);
  }
  if (size > 0) res.setHeader('Content-Length', String(size));
  const stream = bucket.openDownloadStream(objectId);
  stream.on('error', () => { if (!res.headersSent) res.status(404); res.end(); });
  return stream.pipe(res);
}

async function streamS3(res, ref, opts = {}) {
  if (!s3Configured() || !ref.storageKey) return res.status(404).end();
  const input = { Bucket: BUCKET, Key: ref.storageKey };
  if (opts.range) input.Range = String(opts.range);
  let obj;
  try {
    obj = await s3Client().send(new GetObjectCommand(input));
  } catch (e) {
    if (opts.range && (e?.$metadata?.httpStatusCode === 416 || /InvalidRange/i.test(String(e?.name || e?.message || '')))) {
      return res.status(416).end();
    }
    throw e;
  }
  if (obj.ContentType || opts.contentType) res.type(opts.contentType || obj.ContentType);
  if (obj.ContentLength != null) res.setHeader('Content-Length', String(obj.ContentLength));
  if (obj.AcceptRanges) res.setHeader('Accept-Ranges', obj.AcceptRanges);
  else res.setHeader('Accept-Ranges', 'bytes');
  if (obj.ContentRange) {
    res.status(206);
    res.setHeader('Content-Range', obj.ContentRange);
  }
  const disp = contentDisposition(opts.filename, opts.download);
  if (disp) res.setHeader('Content-Disposition', disp);
  res.setHeader('Cache-Control', opts.publicCache ? 'public, max-age=3600' : 'private, max-age=0, no-cache');
  obj.Body.on('error', () => { if (!res.headersSent) res.status(500); res.end(); });
  return obj.Body.pipe(res);
}

async function streamEventMedia(res, ref = {}, opts = {}) {
  if (ref.storageProvider === 'static') {
    if (!ref.storageUrl) return res.status(404).end();
    return res.redirect(302, ref.storageUrl);
  }
  if (ref.storageProvider === 's3') return streamS3(res, ref, opts);
  return streamGrid(res, ref, opts);
}

function publicStorageStatus() {
  return {
    provider: s3Configured() ? 's3' : 'gridfs',
    label: s3Configured() ? 'Amazon S3' : 'MongoDB GridFS (ambiente local/fallback)',
    bucket: s3Configured() ? BUCKET : '',
    region: s3Configured() ? REGION : '',
  };
}

module.exports = { saveEventMedia, deleteEventMedia, streamEventMedia, publicStorageStatus, s3Configured };
