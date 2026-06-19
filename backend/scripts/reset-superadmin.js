require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SuperAdmin = require('../models/SuperAdmin');
const { generateTemporaryPassword } = require('../utils/passwordPolicy');

async function run() {
  try {
    console.log('🔌 Conectando ao MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);

    const email = process.env.SUPERADMIN_EMAIL || 'jardesson.2008@hotmail.com';
    const senha = process.env.SUPERADMIN_PASSWORD || generateTemporaryPassword();

    const senhaHash = await bcrypt.hash(senha, 10);

    let admin = await SuperAdmin.findOne({ email });

    if (admin) {
      console.log('🔄 Atualizando senha do superadmin...');
      admin.senhaHash = senhaHash;
      await admin.save();

      console.log('✅ Senha atualizada com sucesso!');
    } else {
      console.log('🆕 Criando novo superadmin...');

      await SuperAdmin.create({
        email,
        senhaHash: senhaHash,
        nome: process.env.SUPERADMIN_NAME || 'Super Admin',
        ativo: true
      });

      console.log('✅ Superadmin criado com sucesso!');
    }

    console.log('----------------------------------');
    console.log('📧 Email:', email);
    console.log('🔑 Senha:', senha);
    console.log('----------------------------------');

    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err);
    process.exit(1);
  }
}

run();