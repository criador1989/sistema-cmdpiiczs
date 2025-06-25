const mongoose = require('mongoose');
const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const dotenv = require('dotenv');

dotenv.config();

async function corrigir() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB.');

    const todasNotificacoes = await Notificacao.find({});

    let totalCorrigidas = 0;
    for (const notif of todasNotificacoes) {
      const alunoId = notif.aluno;
      const alunoExiste = await Aluno.findById(alunoId);

      if (!alunoExiste) {
        // Se aluno com esse ID não existe mais, tentamos encontrar pelo nome
        const alunoCorreto = await Aluno.findOne({ nome: notif.nomeAluno });
        if (alunoCorreto) {
          notif.aluno = alunoCorreto._id;

          // Corrige também o número sequencial se estiver ausente
          if (!notif.numeroSequencial) {
            const ano = new Date(notif.data).getFullYear();
            const notificacoesDoAno = await Notificacao.find({
              aluno: alunoCorreto._id,
              numeroSequencial: { $regex: `\\/` + ano }
            }).sort({ createdAt: 1 });
            const numero = String(notificacoesDoAno.length + 1).padStart(2, '0');
            notif.numeroSequencial = `${numero}/${ano}`;
          }

          await notif.save();
          totalCorrigidas++;
        } else {
          console.warn(`⚠️ Aluno não encontrado para notificação com ID: ${notif._id}`);
        }
      }
    }

    console.log(`🔧 Correções aplicadas: ${totalCorrigidas} notificações atualizadas.`);
    process.exit(0);
  } catch (erro) {
    console.error('❌ Erro durante a execução:', erro);
    process.exit(1);
  }
}

corrigir();
