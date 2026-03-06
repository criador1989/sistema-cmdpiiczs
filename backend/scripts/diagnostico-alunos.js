'use strict';

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const BACKEND_DIR = path.resolve(__dirname, '..'); // ...\backend
const ROOT_DIR = path.resolve(BACKEND_DIR, '..');  // ...\PLATAFORMA_COLEGIO_MILITAR

function loadEnvSmart() {
  const candidates = [
    path.join(ROOT_DIR, '.env'),
    path.join(BACKEND_DIR, '.env'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return p;
    }
  }
  return null;
}

const envLoadedFrom = loadEnvSmart();

const Aluno = require(path.join(BACKEND_DIR, 'models', 'Aluno'));

async function main() {
  console.log('\n🔎 DIAGNÓSTICO DO MODEL ALUNO');
  console.log('📁 ROOT_DIR   :', ROOT_DIR);
  console.log('📁 BACKEND_DIR:', BACKEND_DIR);
  console.log('🧾 .env usado :', envLoadedFrom || 'NENHUM (.env não encontrado)');

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.log('\n❌ Não encontrei MONGO_URI/MONGODB_URI.');
    console.log('➡️ Procurei em:');
    console.log('   -', path.join(ROOT_DIR, '.env'));
    console.log('   -', path.join(BACKEND_DIR, '.env'));
    console.log('\n✅ Solução rápida: coloque MONGO_URI no .env que você realmente usa (raiz ou backend).');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('\n✅ Conectado ao MongoDB');

  const schemaFields = Object.keys(Aluno.schema.paths);
  console.log('\n📦 Campos definidos no Schema (Aluno.schema.paths):');
  console.table(schemaFields);

  const one = await Aluno.findOne().lean();
  console.log('\n👤 Exemplo (findOne) completo:');
  console.log(one);

  console.log('\n🧠 Campos encontrados no documento (Object.keys):');
  console.table(Object.keys(one || {}).sort());

  const amostra = await Aluno.find().limit(15).lean();
  const allKeys = new Set();
  amostra.forEach(doc => Object.keys(doc || {}).forEach(k => allKeys.add(k)));

  console.log('\n🧩 União de campos encontrados em 15 alunos:');
  console.table([...allKeys].sort());

  await mongoose.disconnect();
  console.log('\n🔌 Conexão encerrada\n');
}

main().catch(async (err) => {
  console.error('\n❌ Erro no diagnóstico:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});