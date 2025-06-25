const mongoose = require('mongoose');
const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');

// Conexão direta com o MongoDB Atlas (Render)
mongoose.connect('mongodb+srv://admin:admin123@cluster0.yyf7zhy.mongodb.net/colegiomilitar?retryWrites=true&w=majority')
  .then(() => {
    console.log('✅ Conectado ao MongoDB Atlas.');
    corrigirNotificacoes();
  })
  .catch((err) => {
    console.error('❌ Erro na conexão com MongoDB Atlas:', err);
  });

// Lista de correções manuais com nome do aluno e notificações por data
const correcoes = [
  {
    nome: 'Aluno Exemplo 1',
    datas: ['2024-04-16', '2024-05-12']
  },
  {
    nome: 'Quirino Alessandro Cordeiro Gomes',
    datas: ['2024-04-16']
  },
  {
    nome: 'Aluno Exemplo 2',
    datas: ['2024-04-10']
  }
  // Adicione mais alunos e datas conforme necessário
];

async function corrigirNotificacoes() {
  try {
    for (const item of correcoes) {
      const aluno = await Aluno.findOne({ nome: item.nome });
      if (!aluno) {
        console.warn(`⚠️ Aluno não encontrado: ${item.nome}`);
        continue;
      }

      for (const dataStr of item.datas) {
        const dataInicial = new Date(dataStr);
        dataInicial.setHours(0, 0, 0, 0);
        const dataFinal = new Date(dataStr);
        dataFinal.setHours(23, 59, 59, 999);

        const resultado = await Notificacao.updateMany(
          {
            data: { $gte: dataInicial, $lte: dataFinal }
          },
          {
            $set: { aluno: aluno._id }
          }
        );

        console.log(`🔧 Corrigidas ${resultado.modifiedCount} notificações para: ${item.nome} em ${dataStr}`);
      }
    }

    console.log('✅ Correção concluída.');
    mongoose.disconnect();
  } catch (erro) {
    console.error('❌ Erro ao atualizar notificações:', erro);
    mongoose.disconnect();
  }
}
