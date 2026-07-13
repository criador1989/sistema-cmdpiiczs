'use strict';

require('dotenv').config();

// scripts/diag-notificacoes.js
const mongoose = require('mongoose');

// 🔧 ajuste o caminho se seu model exporta o mongoose.model('Notificacao', ...)
const Notificacao = require('../models/Notificacao');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;

if (!MONGO_URI) {
  throw new Error('Variável MONGODB_URI, MONGO_URI ou MONGO_URL não encontrada no ambiente.');
}

(async () => {
  try {
    await mongoose.connect(MONGO_URI);

    const count = await Notificacao.countDocuments();
    console.log('Total de notificações no banco:', count);

    const exemplo = await Notificacao.findOne({})
      .sort({ criadaEm: -1, createdAt: -1, _id: -1 })
      .lean();

    console.log('Exemplo:', exemplo);

    // Alguns agregados úteis para entender porque não aparecem no painel
    const porLida = await Notificacao.aggregate([{ $group: { _id: '$lida', n: { $sum: 1 } } }]);
    const porArquivada = await Notificacao.aggregate([{ $group: { _id: '$arquivada', n: { $sum: 1 } } }]);
    const porAtivo = await Notificacao.aggregate([{ $group: { _id: '$ativo', n: { $sum: 1 } } }]);

    console.log('Distribuição lida:', porLida);
    console.log('Distribuição arquivada:', porArquivada);
    console.log('Distribuição ativo:', porAtivo);

  } catch (err) {
    console.error('ERRO no diagnóstico:', err);
  } finally {
    await mongoose.disconnect();
  }
})();
