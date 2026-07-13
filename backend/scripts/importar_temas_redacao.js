'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const RedacaoTema = require('../models/RedacaoTema');

const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  process.env.MONGO_URI ||
  process.env.DATABASE_URL;

const arquivo = process.argv[2] || 'data/temas_redacao_enem_001.json';
const instituicao = process.argv[3] || process.env.TENANT_ID || process.env.INSTITUICAO_ID || 'cmdpii';
const ativarPrimeiro = process.argv.includes('--ativar-primeiro');

function normalizarTexto(valor) {
  return String(valor || '').trim();
}

async function main() {
  if (!MONGO_URI) {
    throw new Error('URI do MongoDB não encontrada no .env.');
  }

  const caminho = path.resolve(process.cwd(), arquivo);

  if (!fs.existsSync(caminho)) {
    throw new Error(`Arquivo não encontrado: ${caminho}`);
  }

  const raw = fs.readFileSync(caminho, 'utf8');
  const temas = JSON.parse(raw);

  if (!Array.isArray(temas)) {
    throw new Error('O arquivo precisa conter um array de temas.');
  }

  await mongoose.connect(MONGO_URI);

  console.log(`✅ Mongo conectado`);
  console.log(`📄 Arquivo: ${arquivo}`);
  console.log(`🏫 Instituição: ${instituicao}`);
  console.log(`🧠 Temas encontrados: ${temas.length}`);

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (let i = 0; i < temas.length; i += 1) {
    const item = temas[i];

    const titulo = normalizarTexto(item.titulo);
    const proposta = normalizarTexto(item.proposta);

    if (!titulo || !proposta) {
      ignorados += 1;
      console.warn(`⚠️ Tema ignorado na posição ${i + 1}: título/proposta ausente.`);
      continue;
    }

    const statusFinal =
      ativarPrimeiro && i === 0
        ? 'ativo'
        : ['ativo', 'inativo', 'arquivado'].includes(item.status)
          ? item.status
          : 'inativo';

    const payload = {
      instituicao,
      titulo,
      proposta,
      eixoTematico: normalizarTexto(item.eixoTematico) || 'Redação ENEM',
      palavrasChave: Array.isArray(item.palavrasChave)
        ? item.palavrasChave.map(normalizarTexto).filter(Boolean)
        : [],
      textosMotivadores: Array.isArray(item.textosMotivadores)
        ? item.textosMotivadores.map((t) => ({
            titulo: normalizarTexto(t?.titulo),
            conteudo: normalizarTexto(t?.conteudo),
            fonte: normalizarTexto(t?.fonte)
          })).filter((t) => t.titulo || t.conteudo)
        : [],
      tempoSugeridoMinutos: Number(item.tempoSugeridoMinutos) || 60,
      minimoPalavras: Number(item.minimoPalavras) || 120,
      maximoPalavras: Number(item.maximoPalavras) || 400,
      status: statusFinal,
      dataInicio: item.dataInicio ? new Date(item.dataInicio) : null,
      dataFim: item.dataFim ? new Date(item.dataFim) : null
    };

    const existente = await RedacaoTema.findOne({
      instituicao,
      titulo
    });

    if (existente) {
      await RedacaoTema.updateOne(
        { _id: existente._id },
        { $set: payload }
      );

      atualizados += 1;
      console.log(`♻️ Atualizado: ${titulo}`);
    } else {
      await RedacaoTema.create(payload);

      criados += 1;
      console.log(`➕ Criado: ${titulo}`);
    }
  }

  console.log('\n===== RESULTADO =====');
  console.log(`➕ Criados: ${criados}`);
  console.log(`♻️ Atualizados: ${atualizados}`);
  console.log(`⚠️ Ignorados: ${ignorados}`);
  console.log('✅ Importação concluída.');

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('❌ Erro ao importar temas:', error);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});