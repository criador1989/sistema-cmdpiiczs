// scripts/fix-notificacoes-visibilidade.js
const mongoose = require('mongoose');
const Notificacao = require('../models/Notificacao');

const MONGO_URI = 'mongodb+srv://admin:admin123@cluster0.yyf7zhy.mongodb.net/colegiomilitar?retryWrites=true&w=majority';

(async () => {
  try {
    await mongoose.connect(MONGO_URI);

    // Preenche SOMENTE onde o campo não existe
    const res = await Notificacao.updateMany(
      {
        $or: [
          { lida: { $exists: false } },
          { arquivada: { $exists: false } },
          { ativo: { $exists: false } },
        ],
      },
      {
        $set: {
          lida: false,
          arquivada: false,
          ativo: true,
        },
      }
    );
    console.log('Docs atualizados (flags lida/arquivada/ativo):', res.modifiedCount);

    // Resumo pós-fix
    const resumo = await Notificacao.aggregate([
      { $group: { _id: { lida: '$lida', arquivada: '$arquivada', ativo: '$ativo' }, n: { $sum: 1 } } },
      { $sort: { '._id.ativo': -1, '._id.arquivada': 1, '._id.lida': 1 } },
    ]);
    console.log('Resumo por flags após fix:', resumo);
  } catch (e) {
    console.error('ERRO no fix:', e);
  } finally {
    await mongoose.disconnect();
  }
})();
