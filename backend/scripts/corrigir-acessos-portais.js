'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Instituicao = require('../models/Instituicao');
const Aluno = require('../models/Aluno');
const Usuario = require('../models/Usuario');

const URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const aplicar = process.argv.includes('--aplicar');

function arg(nome) {
  const index = process.argv.indexOf(nome);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function normalizarEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function emailInternoAluno(value) {
  return normalizarEmail(value).endsWith('@aluno.axoriin.local');
}

async function localizarInstituicao(valor) {
  if (!valor) return null;

  if (mongoose.isValidObjectId(valor)) {
    const porId = await Instituicao.findById(valor).lean();
    if (porId) return porId;
  }

  return Instituicao.findOne({
    $or: [
      { slug: valor.toLowerCase() },
      { sigla: valor.toUpperCase() }
    ]
  }).lean();
}

async function main() {
  const alvo = arg('--instituicao');

  if (!URI) {
    throw new Error('MONGODB_URI ou MONGO_URI não configurada no .env.');
  }

  if (!alvo) {
    throw new Error('Informe --instituicao ID_OU_SLUG.');
  }

  await mongoose.connect(URI, {
    serverSelectionTimeoutMS: 30000,
    maxPoolSize: 5,
    family: 4
  });

  const instituicao = await localizarInstituicao(alvo);
  if (!instituicao?._id) {
    throw new Error('Instituição não encontrada.');
  }

  const instituicaoId = instituicao._id;
  const alunos = await Aluno.find({ instituicao: instituicaoId })
    .select('_id nome turma codigoAcesso usuarioId contatos instituicao tenantId')
    .sort({ nome: 1 });

  const resumo = {
    alunosAnalisados: alunos.length,
    alunosSemUsuario: 0,
    alunosComMultiplosUsuarios: 0,
    responsaveisAusentes: 0,
    responsaveisMultiplos: 0,
    emailsInternosRemovidos: 0,
    emailsSincronizados: 0,
    usuariosAlunoCorrigidos: 0,
    usuariosResponsavelCorrigidos: 0,
    vinculosAlunoCorrigidos: 0,
    codigosDuplicados: 0,
    alteracoesAplicadas: aplicar
  };

  const codigos = new Map();

  for (const aluno of alunos) {
    const codigo = String(aluno.codigoAcesso || '').trim().toUpperCase();
    if (codigo) {
      const lista = codigos.get(codigo) || [];
      lista.push(String(aluno._id));
      codigos.set(codigo, lista);
    }

    const usuariosAluno = await Usuario.find({
      instituicao: instituicaoId,
      alunoId: aluno._id,
      tipo: 'aluno'
    }).sort({ createdAt: 1 });

    const usuariosResponsavel = await Usuario.find({
      instituicao: instituicaoId,
      alunoId: aluno._id,
      tipo: 'responsavel'
    }).sort({ createdAt: 1 });

    if (!usuariosAluno.length) resumo.alunosSemUsuario++;
    if (usuariosAluno.length > 1) resumo.alunosComMultiplosUsuarios++;
    if (!usuariosResponsavel.length) resumo.responsaveisAusentes++;
    if (usuariosResponsavel.length > 1) resumo.responsaveisMultiplos++;

    const usuarioAluno = usuariosAluno[0] || null;
    const usuarioResponsavel = usuariosResponsavel[0] || null;

    if (usuarioAluno) {
      const precisaCorrigir =
        usuarioAluno.portal !== 'aluno' ||
        String(usuarioAluno.alunoId || '') !== String(aluno._id) ||
        String(usuarioAluno.instituicao || '') !== String(instituicaoId) ||
        String(usuarioAluno.tenantId || '') !== String(instituicaoId) ||
        usuarioAluno.ativo === false;

      if (precisaCorrigir) {
        resumo.usuariosAlunoCorrigidos++;
        if (aplicar) {
          usuarioAluno.tipo = 'aluno';
          usuarioAluno.portal = 'aluno';
          usuarioAluno.alunoId = aluno._id;
          usuarioAluno.instituicao = instituicaoId;
          usuarioAluno.tenantId = instituicaoId;
          usuarioAluno.ativo = true;
          usuarioAluno.emailVerificado = true;
          usuarioAluno.emailVerificadoEm = usuarioAluno.emailVerificadoEm || new Date();
          await usuarioAluno.save();
        }
      }

      if (String(aluno.usuarioId || '') !== String(usuarioAluno._id)) {
        resumo.vinculosAlunoCorrigidos++;
        if (aplicar) aluno.usuarioId = usuarioAluno._id;
      }
    }

    if (usuarioResponsavel) {
      const precisaCorrigir =
        usuarioResponsavel.portal !== 'responsavel' ||
        String(usuarioResponsavel.alunoId || '') !== String(aluno._id) ||
        String(usuarioResponsavel.instituicao || '') !== String(instituicaoId) ||
        String(usuarioResponsavel.tenantId || '') !== String(instituicaoId) ||
        usuarioResponsavel.ativo === false;

      if (precisaCorrigir) {
        resumo.usuariosResponsavelCorrigidos++;
        if (aplicar) {
          usuarioResponsavel.tipo = 'responsavel';
          usuarioResponsavel.portal = 'responsavel';
          usuarioResponsavel.alunoId = aluno._id;
          usuarioResponsavel.instituicao = instituicaoId;
          usuarioResponsavel.tenantId = instituicaoId;
          usuarioResponsavel.ativo = true;
          usuarioResponsavel.emailVerificado = true;
          usuarioResponsavel.emailVerificadoEm = usuarioResponsavel.emailVerificadoEm || new Date();
          await usuarioResponsavel.save();
        }
      }
    }

    const emailCadastro = normalizarEmail(aluno.contatos?.emailResponsavel);
    const emailResponsavel = normalizarEmail(usuarioResponsavel?.email);
    let novoEmail = emailCadastro;

    if (emailResponsavel && emailCadastro !== emailResponsavel) {
      novoEmail = emailResponsavel;
      resumo.emailsSincronizados++;
    } else if (!emailResponsavel && emailInternoAluno(emailCadastro)) {
      novoEmail = '';
      resumo.emailsInternosRemovidos++;
    }

    if (novoEmail !== emailCadastro && aplicar) {
      aluno.contatos = aluno.contatos || {};
      aluno.contatos.emailResponsavel = novoEmail || null;
    }

    if (aplicar && aluno.isModified()) {
      await aluno.save();
    }
  }

  for (const ids of codigos.values()) {
    if (ids.length > 1) resumo.codigosDuplicados += ids.length;
  }

  console.log(`Instituição: ${instituicao.nome} (${instituicao.slug || instituicao._id})`);
  console.log(aplicar ? 'MODO: APLICAÇÃO' : 'MODO: SIMULAÇÃO');
  console.table(resumo);

  if (!aplicar) {
    console.log('Nenhuma alteração foi feita. Para corrigir, repita com --aplicar.');
  }
}

main()
  .catch(error => {
    console.error('Erro:', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => null);
    }
  });
