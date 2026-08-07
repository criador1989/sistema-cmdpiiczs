'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

require('../models/Instituicao');

const Usuario = require('../models/Usuario');
const UsuarioVinculoInstituicao = require('../models/UsuarioVinculoInstituicao');
const Termo = require('../models/TermoCompromissoProfessor');
const Aceite = require('../models/AceiteTermoProfessor');

async function obterIdsProfessores(instituicaoId) {
  const [primarios, vinculos] = await Promise.all([
    Usuario.find({
      tipo: 'professor',
      ativo: { $ne: false },
      $or: [{ instituicao: instituicaoId }, { tenantId: instituicaoId }],
    }).select('_id').lean(),
    UsuarioVinculoInstituicao.find({
      instituicao: instituicaoId,
      tipoInstitucional: 'professor',
      ativo: true,
    }).select('usuario').lean(),
  ]);

  return [...new Set([
    ...primarios.map((item) => String(item._id)),
    ...vinculos.map((item) => String(item.usuario)),
  ])];
}

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI/MONGO_URI não configurada.');

  await mongoose.connect(uri, { autoIndex: false });
  const termos = await Termo.find({ ativo: true })
    .populate('instituicao', 'nome nomeExibicao sigla slug')
    .lean();

  for (const termo of termos) {
    const instituicaoId = termo.instituicao?._id || termo.instituicao;
    const professorIds = await obterIdsProfessores(instituicaoId);
    const [aceites, aguardandoSenha] = await Promise.all([
      Aceite.countDocuments({
        instituicao: instituicaoId,
        termo: termo._id,
        revogadoEm: null,
      }),
      professorIds.length
        ? Usuario.countDocuments({
          _id: { $in: professorIds },
          ativo: { $ne: false },
          'onboardingProfessor.obrigarTrocaSenha': true,
        })
        : 0,
    ]);

    console.log(JSON.stringify({
      instituicao: termo.instituicao?.nomeExibicao || termo.instituicao?.nome || termo.instituicao?.sigla || String(instituicaoId),
      versao: termo.versao,
      hash: termo.conteudoHash,
      professores: professorIds.length,
      aceites,
      aguardandoSenha,
      aguardandoTermo: Math.max(professorIds.length - aceites, 0),
    }, null, 2));
  }

  if (!termos.length) console.log('Nenhum termo ativo encontrado.');
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
