require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Aluno = require('../models/Aluno');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const PASTA_FOTOS = path.join(__dirname, '..', 'uploads', 'alunos');
const EXT_RE = /\.(jpg|jpeg|png|webp)$/i;

function toMsFromName(nomeArquivo) {
  const m = nomeArquivo.match(/-(\d+)\.(jpg|jpeg|png|webp)$/i);
  if (!m) return 0;
  return Number(m[1]) || 0;
}

function existeArquivoPublico(foto) {
  if (!foto) return false;
  const rel = String(foto).trim().replace(/^\/+/, '');
  const abs = path.join(__dirname, '..', rel);
  return fs.existsSync(abs);
}

async function main() {
  if (!MONGO_URI) {
    throw new Error('Defina MONGODB_URI ou MONGO_URI no .env');
  }

  if (!fs.existsSync(PASTA_FOTOS)) {
    throw new Error(`Pasta não encontrada: ${PASTA_FOTOS}`);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Conectado ao MongoDB');

  const arquivos = fs.readdirSync(PASTA_FOTOS)
    .filter(nome => EXT_RE.test(nome))
    .sort((a, b) => toMsFromName(b) - toMsFromName(a)); // mais recente primeiro

  console.log(`📂 Arquivos encontrados em uploads/alunos: ${arquivos.length}`);

  // Mapa: alunoId -> arquivo mais recente
  const maisRecentePorAluno = new Map();

  for (const nomeArquivo of arquivos) {
    const match = nomeArquivo.match(/^([a-f0-9]{24})-(\d+)\.(jpg|jpeg|png|webp)$/i);
    if (!match) continue;

    const alunoId = match[1];
    if (!maisRecentePorAluno.has(alunoId)) {
      maisRecentePorAluno.set(alunoId, nomeArquivo);
    }
  }

  console.log(`🧩 IDs de aluno detectados pelos nomes dos arquivos: ${maisRecentePorAluno.size}`);

  const alunos = await Aluno.find({}, 'nome turma foto').lean();
  console.log(`👥 Alunos no banco: ${alunos.length}`);

  let restaurados = 0;
  let corrigidos = 0;
  let jaOk = 0;
  let semArquivo = 0;
  let erros = 0;

  for (const aluno of alunos) {
    try {
      const alunoId = String(aluno._id);
      const arquivoRecente = maisRecentePorAluno.get(alunoId);

      const fotoAtual = String(aluno.foto || '').trim();
      const fotoAtualExiste = fotoAtual ? existeArquivoPublico(fotoAtual) : false;

      // Caso 1: já está tudo certo
      if (fotoAtual && fotoAtualExiste) {
        jaOk++;
        continue;
      }

      // Caso 2: há arquivo correspondente no disco e a foto está vazia ou quebrada
      if (arquivoRecente) {
        const publicPath = `/uploads/alunos/${arquivoRecente}`;

        await Aluno.updateOne(
          { _id: aluno._id },
          { $set: { foto: publicPath } }
        );

        if (!fotoAtual) restaurados++;
        else corrigidos++;

        console.log(`🔁 ${aluno.nome} [${aluno.turma}] -> ${publicPath}`);
      } else {
        semArquivo++;
      }
    } catch (err) {
      erros++;
      console.error(`❌ Erro ao processar aluno ${aluno?.nome || aluno?._id}:`, err.message);
    }
  }

  console.log('\n===== RESUMO =====');
  console.log(`✅ Já estavam ok: ${jaOk}`);
  console.log(`🆕 Restaurados (foto vazia): ${restaurados}`);
  console.log(`🛠️ Corrigidos (foto quebrada): ${corrigidos}`);
  console.log(`📭 Sem arquivo correspondente: ${semArquivo}`);
  console.log(`❌ Erros: ${erros}`);

  // Relatório extra: listar alunos ainda sem foto válida
  const alunosDepois = await Aluno.find({}, 'nome turma foto').sort({ turma: 1, nome: 1 }).lean();

  const pendentes = alunosDepois.filter(a => {
    const foto = String(a.foto || '').trim();
    return !foto || !existeArquivoPublico(foto);
  });

  if (pendentes.length) {
    console.log('\n===== ALUNOS AINDA SEM FOTO VÁLIDA =====');
    pendentes.forEach(a => {
      console.log(`- ${a.nome} | ${a.turma} | foto="${a.foto || ''}"`);
    });
  } else {
    console.log('\n🎉 Todos os alunos ficaram com foto válida.');
  }

  await mongoose.disconnect();
  console.log('\n✅ Finalizado.');
}

main().catch(err => {
  console.error('❌ Falha geral:', err);
  process.exit(1);
});