'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const SuperAdmin = require('../models/SuperAdmin');
const { validatePasswordStrength } = require('../utils/passwordPolicy');

async function main() {
  const mongoUri = process.env.MONGO_URI;
  const nome = process.argv[2];
  const email = String(process.argv[3] || '').trim().toLowerCase();
  const senha = process.argv[4];

  if (!mongoUri) {
    throw new Error('MONGO_URI não configurado no .env');
  }

  if (!nome || !email || !senha) {
    throw new Error(
      'Uso: node scripts/createSuperAdmin.js "Seu Nome" "email@dominio.com" "senhaforte"'
    );
  }

  const check = validatePasswordStrength(senha);
  if (!check.ok) {
    throw new Error(`Senha inválida: ${check.message || 'não atende à política de segurança'}`);
  }

  await mongoose.connect(mongoUri);

  const existente = await SuperAdmin.findOne({ email });
  if (existente) {
    console.log('Já existe um SuperAdmin com esse e-mail.');
    process.exit(0);
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  const novo = await SuperAdmin.create({
    nome,
    email,
    senhaHash,
    ativo: true
  });

  console.log('SuperAdmin criado com sucesso:', {
    id: String(novo._id),
    nome: novo.nome,
    email: novo.email
  });

  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao criar SuperAdmin:', err.message);
  process.exit(1);
});