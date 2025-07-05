require('dotenv').config();
const mongoose = require('mongoose');
const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const calcularNotaTSMD = require('../utils/calculoNota');

// Verifica se o ID foi passado via terminal
const alunoId = process.argv[2];

if (!alunoId) {
  console.error('❌ Você precisa informar o ID do aluno. Exemplo: node scripts/recalcularNota.js 6862f6874f2b1651342caa2c');
  process.exit(1);
}

// Conecta ao MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('🟢 Conectado ao MongoDB'))
  .catch(err => {
    console.error('❌ Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });

async function recalcularNota(alunoId) {
  try {
    const aluno = await Aluno.findById(alunoId);
    if (!aluno) {
      console.log('❌ Aluno não encontrado');
      process.exit(1);
    }

    const notificacoes = await Notificacao.find({
      aluno: alunoId,
      instituicao: aluno.instituicao
    }).sort({ data: 1 });

    const novaNota = calcularNotaTSMD(aluno.dataEntrada, new Date(), notificacoes);
    aluno.comportamento = parseFloat(novaNota.toFixed(2));
    await aluno.save();

    console.log(`✅ Nota recalculada: ${aluno.nome} = ${aluno.comportamento}`);
    process.exit();
  } catch (err) {
    console.error('❌ Erro ao recalcular nota:', err);
    process.exit(1);
  }
}

recalcularNota(alunoId);
