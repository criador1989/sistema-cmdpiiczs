'use strict';

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Caminhos seguros
const BACKEND_DIR = path.resolve(__dirname, '..'); // ...\backend
const ROOT_DIR = path.resolve(BACKEND_DIR, '..');  // ...\PLATAFORMA_COLEGIO_MILITAR

// Carrega .env (raiz OU backend)
function loadEnvSmart() {
  const candidates = [
    path.join(ROOT_DIR, '.env'),
    path.join(BACKEND_DIR, '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return p;
    }
  }
  return null;
}
const envLoadedFrom = loadEnvSmart();

// Model
const Aluno = require(path.join(BACKEND_DIR, 'models', 'Aluno'));

async function main() {
  console.log("🚀 Gerando relatório comportamental...\n");
  console.log("🧾 .env usado:", envLoadedFrom || "NENHUM (.env não encontrado)");

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error("\n❌ Não encontrei MONGO_URI/MONGODB_URI no .env.");
    console.error("➡️ Verifique se existe em:");
    console.error("   -", path.join(ROOT_DIR, ".env"));
    console.error("   -", path.join(BACKEND_DIR, ".env"));
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log("\n✅ Conectado ao MongoDB\n");

    // Campos corretos: nome, turma, comportamento
    const alunos = await Aluno.find(
      {},
      { nome: 1, turma: 1, comportamento: 1, _id: 0 }
    )
      .sort({ turma: 1, nome: 1 })
      .lean();

    if (!alunos.length) {
      console.log("⚠ Nenhum aluno encontrado.");
      return;
    }

    const lista = alunos.map(a => ({
      Nome: a.nome ?? "Não informado",
      Turma: a.turma ?? "Não informada",
      NotaComportamental:
        (typeof a.comportamento === "number")
          ? Number(a.comportamento.toFixed(2))
          : "Sem registro"
    }));

    console.table(lista);
    console.log("\n📊 Total de alunos:", lista.length);

  } catch (erro) {
    console.error("\n❌ Erro ao gerar relatório:");
    console.error(erro);
  } finally {
    try {
      await mongoose.disconnect();
      console.log("\n🔌 Conexão encerrada");
    } catch {}
  }
}

main();