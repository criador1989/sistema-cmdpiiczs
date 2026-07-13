'use strict';

const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  try {
    console.log('🔌 Conectando ao MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);

    const db = mongoose.connection.db;

    console.log('🔍 Buscando usuários sem tenantId...');

    const filtro = {
      $or: [
        { tenantId: { $exists: false } },
        { tenantId: null }
      ]
    };

    const totalAntes = await db.collection('usuarios').countDocuments(filtro);

    console.log(`📊 Usuários sem tenantId: ${totalAntes}`);

    if (!totalAntes) {
      console.log('✅ Nenhum usuário precisa de correção.');
      process.exit();
    }

    console.log('⚙️ Corrigindo...');

    const resultado = await db.collection('usuarios').updateMany(
      filtro,
      [
        {
          $set: {
            tenantId: "$instituicao"
          }
        }
      ]
    );

    console.log('-----------------------------');
    console.log('✅ CORREÇÃO FINALIZADA');
    console.log(`✔ Atualizados: ${resultado.modifiedCount}`);
    console.log('-----------------------------');

    // 🔍 Verificação extra
    const aindaComProblema = await db.collection('usuarios').countDocuments(filtro);

    console.log(`🔎 Restantes sem tenantId: ${aindaComProblema}`);

    console.log('🚀 Pronto! Pode testar o login agora.');

    process.exit();

  } catch (err) {
    console.error('❌ Erro ao executar script:', err);
    process.exit(1);
  }
}

run();