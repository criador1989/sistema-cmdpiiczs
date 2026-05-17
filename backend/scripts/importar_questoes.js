'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Questao = require('../models/Questao');

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL;

async function conectar() {
  if (!MONGO_URI) {
    throw new Error('Defina MONGO_URI, MONGODB_URI ou DATABASE_URL no .env');
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Conectado ao MongoDB');
}

function normalizarTexto(valor) {
  return String(valor || '').trim();
}

function normalizarAlternativas(alternativas) {
  if (!Array.isArray(alternativas)) return [];

  return alternativas
    .map((a) => ({
      letra: normalizarTexto(a.letra).toUpperCase(),
      texto: normalizarTexto(a.texto)
    }))
    .filter((a) => a.letra && a.texto);
}

function validarQuestao(q, index) {
  const erros = [];

  if (!normalizarTexto(q.area)) erros.push('area obrigatória');
  if (!normalizarTexto(q.enunciado)) erros.push('enunciado obrigatório');
  if (!normalizarTexto(q.gabarito)) erros.push('gabarito obrigatório');

  const alternativas = normalizarAlternativas(q.alternativas);
  if (alternativas.length < 2) erros.push('mínimo de 2 alternativas');

  const letras = alternativas.map((a) => a.letra);
  if (!letras.includes(normalizarTexto(q.gabarito).toUpperCase())) {
    erros.push('gabarito não corresponde às alternativas');
  }

  if (erros.length) {
    throw new Error(`Questão ${index + 1} inválida: ${erros.join(', ')}`);
  }
}

function montarCodigoUnico(q) {
  const origem = normalizarTexto(q.origem || 'autor');
  const area = normalizarTexto(q.area);
  const habilidade = normalizarTexto(q.habilidade);
  const tema = normalizarTexto(q.tema);
  const codigoOrigem = normalizarTexto(q.codigoOrigem);

  if (codigoOrigem) return codigoOrigem;

  const base = `${origem}|${area}|${habilidade}|${tema}|${normalizarTexto(q.enunciado).slice(0, 80)}`;

  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

async function importarQuestoes(arquivoJson) {
  const caminho = path.resolve(process.cwd(), arquivoJson);

  if (!fs.existsSync(caminho)) {
    throw new Error(`Arquivo não encontrado: ${caminho}`);
  }

  const conteudo = fs.readFileSync(caminho, 'utf8');
  const questoes = JSON.parse(conteudo);

  if (!Array.isArray(questoes)) {
    throw new Error('O arquivo JSON precisa conter um array de questões.');
  }

  let criadas = 0;
  let atualizadas = 0;
  let ignoradas = 0;

  for (let i = 0; i < questoes.length; i += 1) {
    const q = questoes[i];

    try {
      validarQuestao(q, i);

      const codigoOrigem = montarCodigoUnico(q);
      const escopo = q.escopo === 'instituicao' ? 'instituicao' : 'global';

      const payload = {
        instituicao: escopo === 'global' ? null : q.instituicao || null,
        escopo,
        area: normalizarTexto(q.area),
        disciplina: normalizarTexto(q.disciplina),
        competencia: normalizarTexto(q.competencia),
        habilidade: normalizarTexto(q.habilidade),
        tema: normalizarTexto(q.tema),
        subtema: normalizarTexto(q.subtema),
        dificuldade: ['facil', 'medio', 'dificil'].includes(q.dificuldade) ? q.dificuldade : 'medio',
        estilo: ['enem', 'enem_adaptado', 'autor', 'ia'].includes(q.estilo) ? q.estilo : 'enem',
        origem: ['enem', 'ia', 'autor'].includes(q.origem) ? q.origem : 'autor',
        anoReferencia: q.anoReferencia ? Number(q.anoReferencia) : null,
        codigoOrigem,
        enunciado: normalizarTexto(q.enunciado),
        apoioTexto: normalizarTexto(q.apoioTexto),
        imagemUrl: normalizarTexto(q.imagemUrl),
        alternativas: normalizarAlternativas(q.alternativas),
        gabarito: normalizarTexto(q.gabarito).toUpperCase(),
        explicacao: normalizarTexto(q.explicacao),
        comentarioPedagogico: normalizarTexto(q.comentarioPedagogico),
        tags: Array.isArray(q.tags) ? q.tags.map(normalizarTexto).filter(Boolean) : [],
        ativa: q.ativa !== false,
        publicada: q.publicada !== false,
        metadadosIA: q.metadadosIA || {},
        criadoPor: q.criadoPor || null
      };

      const existente = await Questao.findOne({
        codigoOrigem: payload.codigoOrigem
      });

      if (existente) {
        await Questao.updateOne(
          { _id: existente._id },
          { $set: payload }
        );

        atualizadas += 1;
        console.log(`♻️ Atualizada: ${payload.codigoOrigem}`);
      } else {
        await Questao.create(payload);
        criadas += 1;
        console.log(`✅ Criada: ${payload.codigoOrigem}`);
      }
    } catch (error) {
      ignoradas += 1;
      console.warn(`⚠️ Ignorada questão ${i + 1}: ${error.message}`);
    }
  }

  console.log('\n====== RESULTADO ======');
  console.log(`✅ Criadas: ${criadas}`);
  console.log(`♻️ Atualizadas: ${atualizadas}`);
  console.log(`⚠️ Ignoradas: ${ignoradas}`);
  console.log('=======================\n');
}

async function main() {
  const arquivo = process.argv[2] || 'data/questoes_seed_enem_estilo.json';

  await conectar();
  await importarQuestoes(arquivo);
  await mongoose.disconnect();

  console.log('✅ Importação finalizada.');
}

main().catch(async (error) => {
  console.error('❌ Erro na importação:', error);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});