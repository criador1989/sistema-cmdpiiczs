'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const { generateTemporaryPassword } = require('../utils/passwordPolicy');

async function run() {
  try {
    const email = process.env.RESET_PASSWORD_EMAIL || 'jardesson.2008@hotmail.com';
    const novaSenha = process.env.RESET_PASSWORD_VALUE || generateTemporaryPassword();

    console.log('🔌 Conectando ao Mongo...');
    await mongoose.connect(process.env.MONGO_URI);

    const hash = await bcrypt.hash(novaSenha, 10);

    const res = await mongoose.connection.db.collection('usuarios').updateOne(
      { email },
      { $set: { senha: hash } }
    );

    if (res.matchedCount === 0) {
      console.log('❌ Usuário não encontrado.');
    } else {
      console.log('✅ Senha redefinida com sucesso!');
      console.log(`📧 Email: ${email}`);
      console.log(`🔑 Nova senha: ${novaSenha}`);
    }

    process.exit();

  } catch (err) {
    console.error('❌ Erro:', err);
    process.exit(1);
  }
}

run();