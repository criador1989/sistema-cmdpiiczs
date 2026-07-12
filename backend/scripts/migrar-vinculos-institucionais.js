#!/usr/bin/env node
'use strict';

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Instituicao = require('../models/Instituicao');
const Usuario = require('../models/Usuario');
const UsuarioVinculoInstituicao = require('../models/UsuarioVinculoInstituicao');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI/MONGO_URI não configurada.');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000, maxPoolSize: 10 });
  console.log('[vinculos] MongoDB conectado.');

  const associacoes = await Instituicao.find({
    $or: [
      { categoriaInstituicao: 'associacao' },
      { 'associacaoConfig.ativo': true },
      { modulosAtivos: 'associacao' },
    ],
  }).select('_id nome sigla slug').lean();

  let encontrados = 0;
  let criados = 0;
  let atualizados = 0;

  for (const associacao of associacoes) {
    const usuarios = await Usuario.find({
      instituicao: associacao._id,
      $or: [
        { 'acessosModulos.associacao.ativo': true },
        { tipo: 'admin' },
      ],
    }).select('_id nome email tipo ativo acessosModulos').lean();

    for (const usuario of usuarios) {
      encontrados += 1;
      const perfil = usuario.acessosModulos?.associacao?.perfil || (usuario.tipo === 'admin' ? 'presidente' : 'consulta');
      const existing = await UsuarioVinculoInstituicao.findOne({
        usuario: usuario._id,
        instituicao: associacao._id,
      }).lean();

      const action = existing ? 'atualizar' : 'criar';
      console.log(`[vinculos] ${action}: ${usuario.email} -> ${associacao.slug || associacao.sigla || associacao.nome} (${perfil})`);

      if (!dryRun) {
        await UsuarioVinculoInstituicao.findOneAndUpdate(
          { usuario: usuario._id, instituicao: associacao._id },
          {
            $set: {
              tenantId: associacao._id,
              ativo: usuario.ativo !== false,
              tipoInstitucional: usuario.tipo || 'admin',
              portal: 'institucional',
              origem: 'migracao_legado',
              'acessosModulos.associacao.ativo': usuario.ativo !== false,
              'acessosModulos.associacao.perfil': perfil,
            },
            $setOnInsert: {
              usuario: usuario._id,
              instituicao: associacao._id,
            },
          },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
      }

      if (existing) atualizados += 1;
      else criados += 1;
    }
  }

  console.log(JSON.stringify({
    dryRun,
    associacoes: associacoes.length,
    usuariosEncontrados: encontrados,
    vinculosNovos: criados,
    vinculosAtualizados: atualizados,
  }, null, 2));
}

main()
  .catch(error => {
    console.error('[vinculos] erro:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
  });
