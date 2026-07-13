// scripts/corrigir-nota.js
/**
 * Script genérico para corrigir NOTAS de um aluno.
 *
 * Uso (dry-run por padrão):
 *  node scripts/corrigir-nota.js --nome "Wilckson Fernando da Silva Nascimento" --field "boletim.2025.Matemática.mediaFinal" --value 8.7
 *
 * Aplicando de fato:
 *  node scripts/corrigir-nota.js --nome "Wilckson Fernando da Silva Nascimento" --field "boletim.2025.Matemática.mediaFinal" --value 8.7 --apply
 *
 * Outras formas de filtro:
 *  node scripts/corrigir-nota.js --id 652fb8... --field "notas.matematica.b4" --value 9 --apply
 *
 * Informar conexão (se não houver .env):
 *  node scripts/corrigir-nota.js --nome "Wilckson..." --field "..." --value 8.7 --apply --uri "<MONGODB_URI>"
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const mongoose = require('mongoose');

// === Ajuste o caminho do seu Model conforme sua estrutura ===
const Aluno = require(path.join(process.cwd(), 'models/Aluno'));

// --------- Helpers simples de args ----------
function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith('--')) return true; // flags booleanas (ex.: --apply)
  return val;
}

const nome = getArg('--nome');        // busca por nome (regex, case-insensitive)
const id = getArg('--id');            // busca por _id
const field = getArg('--field');      // campo a atualizar (dot notation)
const valueRaw = getArg('--value');   // valor novo (string -> será parseado)
const apply = !!getArg('--apply');    // se presente, grava de fato
const mongoUri = getArg('--uri') || process.env.MONGODB_URI;

// Parser simples p/ números/boolean/JSON
function parseValue(input) {
  if (input === 'true') return true;
  if (input === 'false') return false;
  if (!isNaN(Number(input))) return Number(input);
  // tenta JSON (útil p/ objetos/arrays)
  try {
    return JSON.parse(input);
  } catch (_) {
    return input; // string literal
  }
}

(async () => {
  try {
    if (!mongoUri) {
      console.error('❌ Defina MONGODB_URI no .env ou passe --uri "<string de conexão>".');
      process.exit(1);
    }
    if (!field) {
      console.error('❌ Informe --field "<caminho.do.campo>" (ex.: boletim.2025.Matemática.mediaFinal).');
      process.exit(1);
    }
    if (valueRaw == null) {
      console.error('❌ Informe --value "<novo valor>" (número, string, true/false ou JSON).');
      process.exit(1);
    }
    if (!nome && !id) {
      console.error('❌ Informe --nome "<nome do aluno>" ou --id "<ObjectId>".');
      process.exit(1);
    }

    const newValue = parseValue(valueRaw);

    console.log('🔗 Conectando ao MongoDB...');
    await mongoose.connect(mongoUri, {
      autoIndex: false,
    });
    console.log('🟢 Conectado.');

    // Monta filtro de busca
    let filtro = {};
    if (id) {
      filtro._id = id;
    } else if (nome) {
      filtro.nome = { $regex: new RegExp(nome, 'i') }; // ajuste "nome" -> "nomeCompleto" se for o seu campo
    }

    console.log('🔎 Buscando aluno(s) com filtro:', filtro);
    const alunos = await Aluno.find(filtro).lean();

    if (!alunos.length) {
      console.log('⚠️ Nenhum aluno encontrado para o filtro informado.');
      process.exit(0);
    }

    // Se vierem vários, mostramos para conferência
    console.log(`👥 ${alunos.length} registro(s) encontrado(s):`);
    alunos.forEach((a, i) => {
      console.log(`  [${i + 1}] _id=${a._id} | nome=${a.nome || a.nomeCompleto || '(sem campo nome)'}`);
    });

    // Atualiza todos os encontrados (ou ajuste para apenas o primeiro, se quiser)
    for (const aluno of alunos) {
      console.log('\n────────────────────────────────────────');
      console.log(`🧑 Aluno: ${aluno.nome || aluno.nomeCompleto || aluno._id}`);
      console.log(`📝 Campo alvo: ${field}`);
      console.log('📄 Valor atual (preview, se existir):');

      // leitura segura do campo aninhado
      const before = field.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), aluno);
      console.dir(before, { depth: 6 });

      console.log('➡️ Novo valor:', newValue);

      if (!apply) {
        console.log('🧪 Dry-run: nada foi alterado. Use --apply para gravar.');
        continue;
      }

      // Aplicar update
      const res = await Aluno.updateOne({ _id: aluno._id }, { $set: { [field]: newValue } });

      if (res.modifiedCount > 0) {
        console.log('✅ Atualizado com sucesso no banco.');
      } else {
        console.log('⚠️ Nenhuma modificação aplicada (campo já possuía esse valor ou não foi encontrado).');
      }
    }

    console.log('\n🏁 Finalizado.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  }
})();
