'use strict';

require('dotenv').config();

const mongoose = require('mongoose');

const Usuario = require('../models/Usuario');
const Instituicao = require('../models/Instituicao');

const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.MONGO_URL;

async function main() {
  if (!MONGO_URI) {
    throw new Error('Variável MONGODB_URI, MONGO_URI ou MONGO_URL não encontrada no .env');
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Conectado ao MongoDB');

  const email = 'secretaria@axoriin.com.br';
  const senha = 'Axoriin2026';
  const nome = 'Secretaria de Educação';

  const instituicao =
    await Instituicao.findOne({ slug: 'cmdpii' }) ||
    await Instituicao.findOne({ sigla: 'CMDPII' }) ||
    await Instituicao.findOne({ ativo: true }) ||
    await Instituicao.findOne({});

  if (!instituicao) {
    throw new Error('Nenhuma instituição encontrada para vincular o usuário secretaria.');
  }

  const existente = await Usuario.findOne({
    email,
    instituicao: instituicao._id,
  });

  if (existente) {
    existente.tipo = 'secretaria';
    existente.ativo = true;
    existente.emailVerificado = true;
    existente.emailVerificadoEm = existente.emailVerificadoEm || new Date();
    existente.escopoObservatorio = {
      nivel: 'estadual',
      estado: 'AC',
      municipio: null,
      regional: null,
      rede: 'estadual',
      instituicoesPermitidas: [],
      podeVerDadosIndividuais: false,
    };

    if (senha) {
      existente.senha = senha;
    }

    await existente.save();

    console.log('✅ Usuário secretaria atualizado com sucesso.');
    console.log('E-mail:', email);
    console.log('Senha:', senha);
    console.log('Instituição vinculada:', instituicao.nome);
    console.log('Tipo:', existente.tipo);
    return;
  }

  const novoUsuario = new Usuario({
    nome,
    email,
    senha,
    tipo: 'secretaria',
    instituicao: instituicao._id,
    tenantId: instituicao._id,
    ativo: true,
    emailVerificado: true,
    emailVerificadoEm: new Date(),
    tokenVerificacaoHash: null,
    tokenVerificacaoExpiraEm: null,
    escopoObservatorio: {
      nivel: 'estadual',
      estado: 'AC',
      municipio: null,
      regional: null,
      rede: 'estadual',
      instituicoesPermitidas: [],
      podeVerDadosIndividuais: false,
    },
  });

  await novoUsuario.save();

  console.log('✅ Usuário secretaria criado com sucesso.');
  console.log('E-mail:', email);
  console.log('Senha:', senha);
  console.log('Instituição vinculada:', instituicao.nome);
  console.log('Tipo:', novoUsuario.tipo);
}

main()
  .catch((err) => {
    console.error('❌ Erro ao criar usuário secretaria:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
    console.log('🔌 Conexão encerrada.');
  });