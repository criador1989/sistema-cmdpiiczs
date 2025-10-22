// backend/scripts/backfill_prazoDevolucao.js
/**
 * Backfill de prazoDevolucao:
 * - Seleciona notificações: status='deferido', entregue=true, devolvidoPeloAluno != true, prazoDevolucao null
 * - Define prazoDevolucao = addBusinessDays(entregueEm || updatedAt || createdAt, 2)
 * - Ajusta alertaAtivo = (agora > prazoDevolucao) && !devolvidoPeloAluno
 *
 * Uso:
 *   1) npm i dotenv
 *   2) node backend/scripts/backfill_prazoDevolucao.js
 *
 * Requer: process.env.MONGO_URI (ex.: "mongodb://localhost:27017/seu_banco")
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Notificacao = require('../models/Notificacao');
const { addBusinessDays } = require('../utils/businessDays');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ Defina MONGO_URI no .env antes de rodar.');
  process.exit(1);
}

(async function run() {
  const ini = Date.now();
  console.log('🔧 Conectando ao Mongo...');
  await mongoose.connect(MONGO_URI, {});

  try {
    const filtro = {
      status: 'deferido',
      entregue: true,
      devolvidoPeloAluno: { $ne: true },
      $or: [{ prazoDevolucao: null }, { prazoDevolucao: { $exists: false } }]
    };

    const total = await Notificacao.countDocuments(filtro);
    console.log(`🔍 Encontradas ${total} notificações para backfill.`);

    const cursor = Notificacao.find(filtro).cursor();
    let ok = 0, fail = 0;

    for await (const n of cursor) {
      try {
        const baseDate = n.entregueEm || n.updatedAt || n.createdAt || new Date();
        const prazo = addBusinessDays(baseDate, 2, { tz: 'America/Rio_Branco' });

        n.prazoDevolucao = prazo;
        n.alertaAtivo = (Date.now() > prazo.getTime()) && !n.devolvidoPeloAluno;

        await n.save();
        ok++;
        if (ok % 100 === 0) console.log(`... ${ok} atualizadas`);
      } catch (e) {
        fail++;
        console.warn(`⚠️ Falha ao atualizar ${n._id}: ${e.message}`);
      }
    }

    console.log(`✅ Concluído. Atualizadas: ${ok}. Falhas: ${fail}. Tempo: ${(Date.now()-ini)/1000}s`);
  } catch (err) {
    console.error('❌ Erro no backfill:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
