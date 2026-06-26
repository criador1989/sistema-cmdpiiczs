// backend/scripts/setup-observatorio-instituicoes.js
'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const Instituicao = require('../models/Instituicao');
const Usuario = require('../models/Usuario');

const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.MONGO_URL;

async function atualizarPorBusca(busca, set, label) {
  const inst = await Instituicao.findOne(busca);
  if (!inst) {
    console.log(`⚠️  Não encontrada: ${label}`);
    return null;
  }

  Object.assign(inst, set);
  await inst.save();

  console.log(`✅ ${label}: ${inst.nome}`);
  console.log({
    estado: inst.estado,
    municipio: inst.municipio,
    redeEnsino: inst.redeEnsino,
    tipoEscola: inst.tipoEscola,
    observatorioAtivo: inst.observatorioAtivo,
    visivelParaSecretaria: inst.visivelParaSecretaria,
    ambienteTeste: inst.ambienteTeste,
  });

  return inst;
}

async function main() {
  if (!MONGO_URI) {
    throw new Error('Variável MONGODB_URI, MONGO_URI ou MONGO_URL não encontrada no .env');
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Conectado ao MongoDB');

  await atualizarPorBusca(
    { $or: [{ slug: 'cmdpii' }, { sigla: /CMDPII-CZS/i }, { nome: /CMDPII.*CZS|Dom Pedro.*Cruzeiro/i }] },
    {
      estado: 'AC',
      municipio: 'Cruzeiro do Sul',
      redeEnsino: 'estadual',
      tipoEscola: 'militar',
      observatorioAtivo: true,
      visivelParaSecretaria: true,
      ambienteTeste: false,
      ativo: true,
      ativa: true,
    },
    'CMDPII-CZS'
  );

  await atualizarPorBusca(
    { $or: [{ slug: /cmdpii.*rbr/i }, { sigla: /CMDPII.*RBR/i }, { nome: /CMDPII.*RBR|Dom Pedro.*Rio Branco/i }] },
    {
      estado: 'AC',
      municipio: 'Rio Branco',
      redeEnsino: 'estadual',
      tipoEscola: 'militar',
      observatorioAtivo: true,
      visivelParaSecretaria: true,
      ambienteTeste: false,
      ativo: true,
      ativa: true,
    },
    'CMDPII-RBR'
  );

  await atualizarPorBusca(
    { $or: [{ slug: /santa.*terezinha/i }, { nome: /Santa Terezinha/i }] },
    {
      estado: 'AC',
      municipio: 'Cruzeiro do Sul',
      redeEnsino: 'privada',
      tipoEscola: 'privada',
      observatorioAtivo: false,
      visivelParaSecretaria: false,
      ambienteTeste: true,
      ativo: true,
      ativa: true,
    },
    'Instituto Santa Terezinha'
  );

  const secretaria = await Usuario.findOne({ email: 'secretaria@axoriin.com.br' });
  if (secretaria) {
    secretaria.tipo = 'secretaria';
    secretaria.ativo = true;
    secretaria.emailVerificado = true;
    secretaria.emailVerificadoEm = secretaria.emailVerificadoEm || new Date();
    secretaria.escopoObservatorio = {
      ...(secretaria.escopoObservatorio || {}),
      nivel: 'estadual',
      estado: 'AC',
      municipio: null,
      regional: null,
      rede: 'estadual',
      redesPermitidas: ['estadual'],
      podeVerPrivadas: false,
      podeVerDadosIndividuais: false,
    };
    await secretaria.save();
    console.log('✅ Usuário secretaria ajustado para rede estadual do AC.');
  } else {
    console.log('⚠️  Usuário secretaria@axoriin.com.br não encontrado.');
  }
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
    console.log('🔌 Conexão encerrada.');
  });
