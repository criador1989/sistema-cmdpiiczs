'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const requireSuperAdmin = require('../../middleware/requireSuperAdmin');
const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const ConfiguracaoDisciplinar = require('../../models/ConfiguracaoDisciplinar');
const { getPresetBase } = require('../../utils/configuracaoDisciplinar');

function normSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizarPreset(preset) {
  const p = String(preset || '').trim().toLowerCase();

  if (p === 'particular') return 'particular';
  if (p === 'personalizado') return 'personalizado';
  return 'militar';
}

function buildInstitutionLinks(slug) {
  const safeSlug = String(slug || '').trim();

  return {
    login: `/login.html?t=${encodeURIComponent(safeSlug)}`,
    cadastro: `/cadastro-usuario.html?t=${encodeURIComponent(safeSlug)}`,
    loginAluno: `/login-aluno.html?t=${encodeURIComponent(safeSlug)}`
  };
}

function gerarCodigoAcesso() {
  return 'AXR-' + Math.random().toString(36).substring(2, 7).toUpperCase();
}

function gerarSenhaSimples() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizarTurma(valor) {
  return String(valor || '').trim();
}

async function criarConfiguracaoDisciplinarInicial(instituicaoId, preset, session = null) {
  const base = getPresetBase(preset);

  const payload = {
    instituicao: instituicaoId,
    preset: base.preset || normalizarPreset(preset),
    tipoRegulamento: base.tipoRegulamento || (preset === 'militar' ? 'militar' : 'adaptavel'),

    comportamento: {
      notaInicial: base.comportamento?.notaInicial ?? 8.0,
      faixas: Array.isArray(base.comportamento?.faixas) ? base.comportamento.faixas : []
    },

    medidas: {
      advertenciaEscrita: Number(base.medidas?.advertenciaEscrita ?? -0.30),
      repreensao: Number(base.medidas?.repreensao ?? -0.50),
      aecdePorDia: Number(base.medidas?.aecdePorDia ?? -0.70),
      aiaPorDia: Number(base.medidas?.aiaPorDia ?? -1.20),
    },

    recompensas: {
      elogioVerbal: Number(base.recompensas?.elogioVerbal ?? 0.15),
      elogioIndividual: Number(base.recompensas?.elogioIndividual ?? 0.60),
      elogioColetivo: Number(base.recompensas?.elogioColetivo ?? 0.20),
      mediaAlta: Number(base.recompensas?.mediaAlta ?? 0.40),
    },

    tsmd: {
      ativo: !!base.tsmd?.ativo,
      diasParaIniciar: Number(base.tsmd?.diasParaIniciar ?? 60),
      incrementoPorDia: Number(base.tsmd?.incrementoPorDia ?? 0.01),
      limiteMaximo: Number(base.tsmd?.limiteMaximo ?? 10),
    },

    regulamento: {
      nome: String(base.regulamento?.nome || 'Regulamento Disciplinar').trim(),
      versao: String(base.regulamento?.versao || '1.0').trim(),
      textos: {
        cabecalho: String(base.regulamento?.textos?.cabecalho || '').trim(),
        notificacao: String(base.regulamento?.textos?.notificacao || '').trim(),
        observacaoPadrao: String(base.regulamento?.textos?.observacaoPadrao || '').trim(),
      }
    }
  };

  if (session) {
    const docs = await ConfiguracaoDisciplinar.create([payload], { session });
    return docs[0];
  }

  return ConfiguracaoDisciplinar.create(payload);
}

/* =========================================================================
 * INSTITUIÇÕES
 * ========================================================================= */

router.get('/instituicoes', requireSuperAdmin, async (_req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const list = await Instituicao.find({})
      .select('_id nome sigla slug ativo ativa')
      .sort({ nome: 1 })
      .lean();

    res.json({ instituicoes: list || [] });
  } catch (e) {
    res.status(500).json({
      mensagem: 'Erro ao listar instituições.',
      erro: String(e.message || e)
    });
  }
});

router.post('/instituicoes', requireSuperAdmin, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const nome = String(req.body?.nome || '').trim();
    const sigla = String(req.body?.sigla || '').trim();
    const slug = normSlug(req.body?.slug || sigla || nome);
    const preset = normalizarPreset(req.body?.preset);

    if (!nome || nome.length < 3) {
      return res.status(400).json({ mensagem: 'Informe um nome válido.' });
    }

    if (!slug || slug.length < 3) {
      return res.status(400).json({ mensagem: 'Slug inválido.' });
    }

    const exists = await Instituicao.findOne({ slug })
      .select('_id')
      .lean()
      .catch(() => null);

    if (exists) {
      return res.status(409).json({
        mensagem: 'Já existe uma instituição com esse slug.'
      });
    }

    let inst = null;
    let config = null;

    await session.withTransaction(async () => {
      const created = await Instituicao.create([{
        nome,
        sigla: sigla || null,
        slug,
        ativo: true,
        ativa: true,
      }], { session });

      inst = created[0];

      config = await criarConfiguracaoDisciplinarInicial(inst._id, preset, session);
    });

    return res.status(201).json({
      mensagem: 'Instituição criada.',
      instituicao: {
        id: String(inst._id),
        nome: inst.nome,
        sigla: inst.sigla,
        slug: inst.slug,
        ativo: inst.ativo,
        ativa: inst.ativa
      },
      configuracaoDisciplinar: {
        id: String(config._id),
        preset: config.preset,
        tipoRegulamento: config.tipoRegulamento
      },
      links: buildInstitutionLinks(slug)
    });
  } catch (e) {
    res.status(500).json({
      mensagem: 'Erro ao criar instituição.',
      erro: String(e.message || e)
    });
  } finally {
    await session.endSession().catch(() => null);
  }
});

router.patch('/instituicoes/:id', requireSuperAdmin, async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');
    const id = String(req.params.id || '').trim();
    const ativo = !!req.body?.ativo;

    const up = await Instituicao.findByIdAndUpdate(
      id,
      { $set: { ativo, ativa: ativo } },
      { new: true }
    )
      .select('_id nome sigla slug ativo ativa')
      .lean();

    if (!up) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    res.json({ mensagem: 'Atualizado.', instituicao: up });
  } catch (e) {
    res.status(500).json({
      mensagem: 'Erro ao atualizar.',
      erro: String(e.message || e)
    });
  }
});

router.delete('/instituicoes/:id', requireSuperAdmin, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');
    const instituicaoId = String(req.params.id || '').trim();

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome slug')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    await session.withTransaction(async () => {
      await Promise.all([
        Usuario.deleteMany({ instituicao: instituicaoId }, { session }).catch(() => null),
        Aluno.deleteMany({ instituicao: instituicaoId }, { session }).catch(() => null),
        Notificacao.deleteMany({ instituicao: instituicaoId }, { session }).catch(() => null),
        Observacao.deleteMany({ instituicao: instituicaoId }, { session }).catch(() => null),
        ConfiguracaoDisciplinar.deleteMany({ instituicao: instituicaoId }, { session }).catch(() => null),
      ]);

      await Instituicao.deleteOne({ _id: instituicaoId }, { session });
    });

    return res.json({
      mensagem: `Instituição "${instituicao.nome}" excluída com sucesso.`
    });
  } catch (e) {
    console.error('[masterInstituicoes][DELETE]', e);
    return res.status(500).json({
      mensagem: 'Erro ao excluir instituição.',
      erro: String(e.message || e)
    });
  } finally {
    await session.endSession().catch(() => null);
  }
});

/* =========================================================================
 * USUÁRIOS DA INSTITUIÇÃO
 * ========================================================================= */

router.post('/instituicoes/:id/usuarios', requireSuperAdmin, async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const instituicaoId = String(req.params.id || '').trim();
    const nome = String(req.body?.nome || '').trim();
    const email = normalizeEmail(req.body?.email);
    const senha = String(req.body?.senha || '');
    const tipo = String(req.body?.tipo || '').trim().toLowerCase();

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome sigla slug ativo ativa')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    if (!nome || nome.length < 3) {
      return res.status(400).json({ mensagem: 'Informe um nome válido.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
    }

    if (!senha || senha.length < 6) {
      return res.status(400).json({ mensagem: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    if (!['admin', 'monitor', 'professor'].includes(tipo)) {
      return res.status(400).json({
        mensagem: 'Tipo inválido. Use admin, monitor ou professor.'
      });
    }

    const existente = await Usuario.findOne({
      email,
      instituicao: instituicaoId
    }).select('_id');

    if (existente) {
      return res.status(409).json({
        mensagem: 'E-mail já cadastrado nesta instituição.'
      });
    }

    const novoUsuario = new Usuario({
      nome,
      email,
      senha,
      tipo,
      instituicao: instituicaoId,
      ativo: true,
      emailVerificado: true,
      emailVerificadoEm: new Date(),
      tokenVerificacaoHash: null,
      tokenVerificacaoExpiraEm: null,
    });

    await novoUsuario.save();

    return res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      usuario: {
        id: String(novoUsuario._id),
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        tipo: novoUsuario.tipo,
        instituicao: {
          id: String(instituicao._id),
          nome: instituicao.nome,
          sigla: instituicao.sigla || null,
          slug: instituicao.slug || null,
        }
      },
      links: buildInstitutionLinks(instituicao.slug || '')
    });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({
        mensagem: 'E-mail já cadastrado nesta instituição.'
      });
    }

    res.status(500).json({
      mensagem: 'Erro ao criar usuário.',
      erro: String(e.message || e)
    });
  }
});

/* =========================================================================
 * ALUNOS DA INSTITUIÇÃO PARA O MASTER
 * ========================================================================= */

async function listarTurmasAlunosMaster(req, res) {
  try {
    const instituicaoId = String(req.params.id || '').trim();

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    const turmas = await Aluno.distinct('turma', {
      instituicao: instituicaoId
    });

    turmas.sort((a, b) =>
      String(a).localeCompare(String(b), 'pt-BR', {
        numeric: true,
        sensitivity: 'base'
      })
    );

    return res.json({ ok: true, turmas });
  } catch (e) {
    console.error('[masterInstituicoes][listar-turmas-alunos]', e);
    return res.status(500).json({
      mensagem: 'Erro ao listar turmas dos alunos para o master.',
      erro: String(e.message || e)
    });
  }
}

router.get('/instituicoes/:id/alunos/turmas', requireSuperAdmin, listarTurmasAlunosMaster);

router.get('/:id/alunos/turmas', requireSuperAdmin, listarTurmasAlunosMaster);

async function listarAlunosTurmaMaster(req, res) {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const instituicaoId = String(req.params.id || '').trim();
    const turma = normalizarTurma(req.params.turma);

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    if (!turma) {
      return res.status(400).json({ mensagem: 'Turma inválida.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome sigla slug ativo ativa')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    const alunos = await Aluno.find({
      instituicao: instituicaoId,
      turma
    })
      .select('_id nome turma codigoAcesso usuarioId contatos instituicao tenantId')
      .sort({ nome: 1 })
      .lean();

    const alunoIds = alunos.map(a => a._id);

    const usuariosAlunos = await Usuario.find({
      instituicao: instituicaoId,
      tipo: 'aluno',
      alunoId: { $in: alunoIds }
    })
      .select('_id email alunoId')
      .lean();

    const usuarioPorAluno = new Map(
      usuariosAlunos.map(u => [String(u.alunoId), u])
    );

    const alunosNormalizados = [];

    for (const a of alunos) {
      const usuarioEncontrado = usuarioPorAluno.get(String(a._id));
      const usuarioIdFinal = a.usuarioId || usuarioEncontrado?._id || null;

      if (!a.usuarioId && usuarioEncontrado?._id) {
        await Aluno.updateOne(
          { _id: a._id, instituicao: instituicaoId },
          { $set: { usuarioId: usuarioEncontrado._id } }
        );
      }

      alunosNormalizados.push({
        _id: String(a._id),
        id: String(a._id),
        nome: a.nome || '',
        turma: a.turma || '',
        codigoAcesso: a.codigoAcesso || '',
        usuarioId: usuarioIdFinal ? String(usuarioIdFinal) : null,
        acessoCriado: !!usuarioIdFinal,
        temAcesso: !!usuarioIdFinal,
        contatos: {
          emailResponsavel: normalizeEmail(
            a?.contatos?.emailResponsavel ||
            usuarioEncontrado?.email ||
            ''
          )
        }
      });
    }

    return res.json({
      ok: true,
      instituicao: {
        id: String(instituicao._id),
        nome: instituicao.nome,
        sigla: instituicao.sigla || '',
        slug: instituicao.slug || ''
      },
      turma,
      alunos: alunosNormalizados
    });
  } catch (e) {
    console.error('[masterInstituicoes][listar-alunos-turma]', e);
    return res.status(500).json({
      mensagem: 'Erro ao listar alunos da turma para o master.',
      erro: String(e.message || e)
    });
  }
}
// Compatível com front usando MASTER_BASE = /api/master/instituicoes/instituicoes
router.get('/instituicoes/:id/alunos/turma/:turma', requireSuperAdmin, listarAlunosTurmaMaster);

// Compatível com front usando /api/master/instituicoes/:id/alunos/turma/:turma
router.get('/:id/alunos/turma/:turma', requireSuperAdmin, listarAlunosTurmaMaster);

/* =========================================================================
 * ACESSOS DOS ALUNOS EM LOTE
 * ========================================================================= */

router.post('/instituicoes/:id/gerar-acessos-alunos', requireSuperAdmin, async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const instituicaoId = String(req.params.id || '').trim();
    const alunosPayload = Array.isArray(req.body?.alunos) ? req.body.alunos : [];

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    if (!alunosPayload.length) {
      return res.status(400).json({ mensagem: 'Selecione pelo menos um aluno.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome sigla slug')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    const ids = alunosPayload
      .map(a => String(a?.alunoId || '').trim())
      .filter(id => mongoose.isValidObjectId(id));

    if (!ids.length) {
      return res.status(400).json({ mensagem: 'Nenhum aluno válido foi enviado.' });
    }

    const alunos = await Aluno.find({
      _id: { $in: ids },
      instituicao: instituicaoId
    })
      .select('_id nome turma codigoAcesso usuarioId contatos instituicao')
      .lean();

    if (!alunos.length) {
      return res.status(404).json({ mensagem: 'Nenhum aluno válido encontrado para esta instituição.' });
    }

    const emailPorAluno = new Map();

    for (const item of alunosPayload) {
      const alunoId = String(item?.alunoId || '').trim();
      const emailResponsavel = normalizeEmail(item?.emailResponsavel || '');

      if (alunoId) {
        emailPorAluno.set(alunoId, emailResponsavel);
      }
    }

    const acessos = [];
    const reutilizados = [];
    const ignorados = [];

    for (const aluno of alunos) {
      const alunoId = String(aluno._id);

      let emailResponsavel = emailPorAluno.get(alunoId) || '';

      if (!emailResponsavel) {
        emailResponsavel = normalizeEmail(
          aluno?.contatos?.emailResponsavel ||
          aluno?.emailResponsavel ||
          ''
        );
      }

      if (!isValidEmail(emailResponsavel)) {
        ignorados.push({
          alunoId,
          nome: aluno.nome,
          turma: normalizarTurma(aluno.turma),
          motivo: 'E-mail do responsável inválido ou ausente.'
        });
        continue;
      }

      let codigoAcesso = String(aluno.codigoAcesso || '').trim().toUpperCase();

      if (!codigoAcesso) {
        let tentativas = 0;

        do {
          codigoAcesso = gerarCodigoAcesso();
          tentativas++;

          if (tentativas > 30) {
            codigoAcesso = '';
            break;
          }
        } while (await Aluno.findOne({
          instituicao: instituicaoId,
          codigoAcesso
        }).select('_id').lean());
      }

      if (!codigoAcesso) {
        ignorados.push({
          alunoId,
          nome: aluno.nome,
          turma: normalizarTurma(aluno.turma),
          email: emailResponsavel,
          motivo: 'Não foi possível gerar um código de acesso único.'
        });
        continue;
      }

      const usuarioJaVinculadoAoAluno = await Usuario.findOne({
        instituicao: instituicaoId,
        alunoId: aluno._id
      })
        .select('_id nome email tipo portal alunoId')
        .lean();

      if (usuarioJaVinculadoAoAluno) {
        await Aluno.updateOne(
          { _id: aluno._id, instituicao: instituicaoId },
          {
            $set: {
              usuarioId: usuarioJaVinculadoAoAluno._id,
              codigoAcesso,
              'contatos.emailResponsavel': normalizeEmail(usuarioJaVinculadoAoAluno.email || emailResponsavel)
            }
          }
        );

        reutilizados.push({
          alunoId,
          usuarioId: String(usuarioJaVinculadoAoAluno._id),
          nome: aluno.nome,
          turma: normalizarTurma(aluno.turma),
          email: usuarioJaVinculadoAoAluno.email || emailResponsavel,
          codigoAcesso,
          senha: null,
          status: 'reutilizado',
          observacao: 'Este aluno já possuía usuário vinculado. A senha anterior foi mantida.'
        });

        continue;
      }

      if (aluno.usuarioId && mongoose.isValidObjectId(aluno.usuarioId)) {
        const usuarioDoAluno = await Usuario.findOne({
          _id: aluno.usuarioId,
          instituicao: instituicaoId
        })
          .select('_id nome email tipo portal alunoId')
          .lean();

        if (usuarioDoAluno) {
          const precisaCorrigirUsuario = (
            usuarioDoAluno.tipo !== 'aluno' ||
            usuarioDoAluno.portal !== 'aluno' ||
            String(usuarioDoAluno.alunoId || '') !== alunoId
          );

          if (precisaCorrigirUsuario) {
            await Usuario.updateOne(
              { _id: usuarioDoAluno._id, instituicao: instituicaoId },
              {
                $set: {
                  tipo: 'aluno',
                  portal: 'aluno',
                  alunoId: aluno._id,
                  ativo: true,
                  emailVerificado: true,
                  emailVerificadoEm: usuarioDoAluno.emailVerificadoEm || new Date()
                }
              }
            );
          }

          await Aluno.updateOne(
            { _id: aluno._id, instituicao: instituicaoId },
            {
              $set: {
                usuarioId: usuarioDoAluno._id,
                codigoAcesso,
                'contatos.emailResponsavel': normalizeEmail(usuarioDoAluno.email || emailResponsavel)
              }
            }
          );

          reutilizados.push({
            alunoId,
            usuarioId: String(usuarioDoAluno._id),
            nome: aluno.nome,
            turma: normalizarTurma(aluno.turma),
            email: usuarioDoAluno.email || emailResponsavel,
            codigoAcesso,
            senha: null,
            status: 'reutilizado',
            observacao: 'Usuário já vinculado ao cadastro do aluno. A senha anterior foi mantida.'
          });

          continue;
        }
      }

      const usuarioComMesmoEmail = await Usuario.findOne({
  email: emailResponsavel,
  instituicao: instituicaoId
})
  .select('_id nome email tipo portal alunoId instituicao')
  .lean();

let emailUsuarioAcesso = emailResponsavel;

if (usuarioComMesmoEmail && String(usuarioComMesmoEmail.alunoId || '') !== alunoId) {
  const baseTecnica = String(codigoAcesso || gerarCodigoAcesso())
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  emailUsuarioAcesso = `${baseTecnica}.${alunoId.slice(-6)}@aluno.axoriin.local`;
}

      const senha = gerarSenhaSimples();

      const emailUnicoUsuario = `${String(codigoAcesso).toLowerCase().replace(/[^a-z0-9]/g, '')}.${alunoId.slice(-6)}@aluno.axoriin.local`;

const novoUsuario = new Usuario({
  nome: aluno.nome,
  email: emailUnicoUsuario,
        senha,
        tipo: 'aluno',
        portal: 'aluno',
        alunoId: aluno._id,
        instituicao: instituicaoId,
        tenantId: instituicaoId,
        ativo: true,
        emailVerificado: true,
        emailVerificadoEm: new Date(),
        tokenVerificacaoHash: null,
        tokenVerificacaoExpiraEm: null,
      });

      await novoUsuario.save();

      await Aluno.updateOne(
        { _id: aluno._id, instituicao: instituicaoId },
        {
          $set: {
            usuarioId: novoUsuario._id,
            codigoAcesso,
            'contatos.emailResponsavel': emailResponsavel
          }
        }
      );

      acessos.push({
        alunoId,
        usuarioId: String(novoUsuario._id),
        nome: aluno.nome,
        turma: normalizarTurma(aluno.turma),
        email: emailResponsavel,
        codigoAcesso,
        senha,
        status: 'criado',
        observacao: 'Novo acesso criado com sucesso.'
      });
    }

    const totalCriados = acessos.length;
    const totalReutilizados = reutilizados.length;
    const totalIgnorados = ignorados.length;
    const totalProcessados = totalCriados + totalReutilizados + totalIgnorados;

    return res.json({
      ok: true,
      mensagem: `Processamento concluído. Criados: ${totalCriados}. Reutilizados: ${totalReutilizados}. Ignorados: ${totalIgnorados}.`,
      total: totalCriados,
      totalCriados,
      totalReutilizados,
      totalIgnorados,
      totalProcessados,
      acessos,
      reutilizados,
      ignorados,
      links: buildInstitutionLinks(instituicao.slug || '')
    });
  } catch (e) {
    console.error('[masterInstituicoes][gerar-acessos-alunos]', e);

    if (e?.code === 11000) {
      return res.status(409).json({
        mensagem: 'Já existe usuário cadastrado com este e-mail. Verifique se o aluno já possui acesso ou use outro e-mail.',
        erro: String(e.message || e)
      });
    }

    return res.status(500).json({
      mensagem: 'Erro ao gerar acessos dos alunos.',
      erro: String(e.message || e)
    });
  }
});

/* =========================================================================
 * REDEFINIR SENHA DO ACESSO DO ALUNO
 * ========================================================================= */

async function redefinirSenhaAlunoMaster(req, res) {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const instituicaoId = String(req.params.id || '').trim();
    const alunoId = String(req.params.alunoId || '').trim();

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    if (!mongoose.isValidObjectId(alunoId)) {
      return res.status(400).json({ mensagem: 'Aluno inválido.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome sigla slug')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    const aluno = await Aluno.findOne({
      _id: alunoId,
      instituicao: instituicaoId
    })
      .select('_id nome turma codigoAcesso usuarioId contatos instituicao')
      .lean();

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado nesta instituição.' });
    }

    let usuario = null;

    if (aluno.usuarioId && mongoose.isValidObjectId(aluno.usuarioId)) {
      usuario = await Usuario.findOne({
        _id: aluno.usuarioId,
        instituicao: instituicaoId
      });
    }

    if (!usuario) {
      usuario = await Usuario.findOne({
        instituicao: instituicaoId,
        alunoId: aluno._id,
        tipo: 'aluno'
      });
    }

    if (!usuario) {
      return res.status(404).json({
        mensagem: 'Este aluno ainda não possui usuário de acesso. Gere o acesso primeiro.'
      });
    }

    let codigoAcesso = String(aluno.codigoAcesso || '').trim().toUpperCase();

    if (!codigoAcesso) {
      let tentativas = 0;

      do {
        codigoAcesso = gerarCodigoAcesso();
        tentativas++;

        if (tentativas > 30) {
          codigoAcesso = '';
          break;
        }
      } while (await Aluno.findOne({
        instituicao: instituicaoId,
        codigoAcesso
      }).select('_id').lean());

      if (!codigoAcesso) {
        return res.status(500).json({
          mensagem: 'Não foi possível gerar um código de acesso único para o aluno.'
        });
      }
    }

    const novaSenha = gerarSenhaSimples();

    usuario.senha = novaSenha;
    usuario.tipo = 'aluno';
    usuario.portal = 'aluno';
    usuario.alunoId = aluno._id;
    usuario.instituicao = instituicaoId;
    usuario.tenantId = instituicaoId;
    usuario.ativo = true;
    usuario.emailVerificado = true;
    usuario.emailVerificadoEm = usuario.emailVerificadoEm || new Date();

    await usuario.save();

    await Aluno.updateOne(
      { _id: aluno._id, instituicao: instituicaoId },
      {
        $set: {
          usuarioId: usuario._id,
          codigoAcesso,
          'contatos.emailResponsavel': normalizeEmail(usuario.email || aluno?.contatos?.emailResponsavel || '')
        }
      }
    );

    return res.json({
      ok: true,
      mensagem: 'Senha redefinida com sucesso.',
      acesso: {
        alunoId: String(aluno._id),
        usuarioId: String(usuario._id),
        nome: aluno.nome || '',
        turma: aluno.turma || '',
        email: normalizeEmail(usuario.email || ''),
        codigoAcesso,
        senha: novaSenha,
        status: 'senha_redefinida',
        observacao: 'A senha anterior foi substituída por esta nova senha.'
      },
      links: buildInstitutionLinks(instituicao.slug || '')
    });
  } catch (e) {
    console.error('[masterInstituicoes][redefinir-senha-aluno]', e);
    return res.status(500).json({
      mensagem: 'Erro ao redefinir senha do aluno.',
      erro: String(e.message || e)
    });
  }
}

// Compatível com: /api/master/instituicoes/instituicoes/:id/alunos/:alunoId/redefinir-senha
router.post('/instituicoes/:id/alunos/:alunoId/redefinir-senha', requireSuperAdmin, redefinirSenhaAlunoMaster);

// Compatível com: /api/master/instituicoes/:id/alunos/:alunoId/redefinir-senha
router.post('/:id/alunos/:alunoId/redefinir-senha', requireSuperAdmin, redefinirSenhaAlunoMaster);

module.exports = router;
