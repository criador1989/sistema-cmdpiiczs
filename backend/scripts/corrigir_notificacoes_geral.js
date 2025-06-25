const mongoose = require('mongoose');
require('dotenv').config();

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB.');

    const anoAtual = new Date().getFullYear();

    const notificacoes = await Notificacao.find({
      $or: [
        { aluno: null },
        { aluno: { $exists: false } },
        { numeroSequencial: null },
        { numeroSequencial: { $regex: /^\d+\/\d{4}$/ } }
      ]
    });

    let contadorPorAno = {};

    let totalCorrigidas = 0;
    let totalIgnoradas = 0;

    for (const n of notificacoes) {
      if (!n.nomeAluno) {
        totalIgnoradas++;
        continue;
      }

      const aluno = await Aluno.findOne({ nome: new RegExp(n.nomeAluno, 'i') });
      if (!aluno) {
        totalIgnoradas++;
        continue;
      }

      n.aluno = aluno._id;

      // Garante data
      if (!n.data) {
        n.data = new Date(`${anoAtual}-01-01T12:00:00Z`);
      }

      const ano = n.data.getFullYear();

      // Inicializa contador do ano
      if (!contadorPorAno[ano]) {
        const ultima = await Notificacao.find({
          numeroSequencial: { $regex: `/${ano}$` }
        }).sort({ createdAt: -1 }).limit(1);

        let contador = 1;
        if (ultima.length > 0) {
          const ultNum = parseInt(ultima[0].numeroSequencial?.split('/')[0]);
          if (!isNaN(ultNum)) contador = ultNum + 1;
        }

        contadorPorAno[ano] = contador;
      }

      // Corrige numeroSequencial se faltando
      if (!n.numeroSequencial) {
        n.numeroSequencial = `${String(contadorPorAno[ano]).padStart(2, '0')}/${ano}`;
        contadorPorAno[ano]++;
      }

      await n.save();
      totalCorrigidas++;
    }

    console.log(`✅ Total de notificações corrigidas: ${totalCorrigidas}`);
    console.log(`⚠️ Notificações ignoradas (sem nome ou aluno não encontrado): ${totalIgnoradas}`);
    mongoose.disconnect();
  } catch (err) {
    console.error('❌ Erro durante a correção:', err);
    mongoose.disconnect();
  }
})();
