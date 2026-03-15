const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const Instituicao = require('../../models/Instituicao');
const { autenticar } = require('../../middleware/autenticacao');
const {
  requireTenant,
  tenantFilter,
  isMasterLike,
  resolveInstitutionId,
  assertSameInstitution
} = require('../../middleware/tenantScope');

/** Somente ADMIN */
function verificarAdmin(req, res, next) {
  if (req.usuario?.tipo !== 'admin' && !isMasterLike(req)) {
    return res.status(403).json({ mensagem: 'Apenas administradores podem acessar esta funcionalidade.' });
  }
  next();
}

function normalizaEmail(e) {
  return String(e || '').trim().toLowerCase();
}

function escapeRx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolve instituição: aceita _id (24 hex) ou nome/sigla (case-insensitive) */
async function resolveInstituicaoId(valor) {
  const v = String(valor || '').trim();
  if (!v) return null;

  if (mongoose.isValidObjectId(v)) return v;

  const rx = new RegExp(`^${escapeRx(v)}$`, 'i');
  const doc = await Instituicao.findOne({ $or: [{ nome: rx }, { sigla: rx }] })
    .select('_id')
    .lean();

  return doc?._id || null;
}

/** Mapeia erros comuns do Mongo/Mongoose para respostas amigáveis */
function mapErro(res, err, defMsg) {
  if (err?.code === 11000) {
    return res.status(409).json({ mensagem: 'E-mail já cadastrado nesta instituição.' });
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ mensagem: 'Dados inválidos (verifique a instituição e o tipo).' });
  }
  return res.status(500).json({ mensagem: defMsg || 'Erro interno.' });
}

/* =========================================================================
 *   ADMIN: CRUD de usuários
 * =========================================================================*/

/** POST /api/usuarios  (cria usuário) */
router.post('/', autenticar, requireTenant, verificarAdmin, async (req, res) => {
  try {
    const { nome, email, senha, tipo, instituicao } = req.body;

    if (!nome || !email || !senha || !tipo) {
      return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios.' });
    }

    let instId = null;

    if (isMasterLike(req) && instituicao) {
      instId = await resolveInstituicaoId(instituicao);
    } else {
      instId = resolveInstitutionId(req);
    }

    if (!instId) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    const emailNorm = normalizaEmail(email);

    const ja = await Usuario.findOne({
      email: emailNorm,
      instituicao: instId
    }).select('_id');

    if (ja) {
      return res.status(409).json({ mensagem: 'E-mail já cadastrado nesta instituição.' });
    }

    const novoUsuario = new Usuario({
      nome,
      email: emailNorm,
      senha,
      tipo,
      instituicao: instId
    });

    await novoUsuario.save();

    res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      usuario: {
        _id: novoUsuario._id,
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        tipo: novoUsuario.tipo,
        instituicao: novoUsuario.instituicao,
        tokenAcesso: novoUsuario.tokenAcesso || null,
      },
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    return mapErro(res, err, 'Erro ao criar usuário.');
  }
});

/**
 * GET /api/usuarios
 * School admin: vê só usuários da própria instituição
 * Master/Superadmin: pode filtrar outra instituição
 */
router.get('/', autenticar, requireTenant, verificarAdmin, async (req, res) => {
  try {
    const pagina = Math.max(parseInt(req.query.pagina || '1', 10), 1);
    const limite = Math.min(Math.max(parseInt(req.query.limite || '50', 10), 1), 200);

    let instituicaoFiltro = null;

    if (isMasterLike(req) && req.query.instituicao) {
      instituicaoFiltro = await resolveInstituicaoId(req.query.instituicao);
    } else {
      instituicaoFiltro = resolveInstitutionId(req);
    }

    const filtro = tenantFilter(req, {}, instituicaoFiltro);

    if (req.query.tipo) filtro.tipo = req.query.tipo;

    const q = String(req.query.q || '').trim();
    if (q) {
      const rx = new RegExp(q, 'i');
      filtro.$or = [{ nome: rx }, { email: rx }];
    }

    const [items, total] = await Promise.all([
      Usuario.find(filtro)
        .select('-senha')
        .populate('instituicao', 'nome sigla slug')
        .sort({ nome: 1 })
        .skip((pagina - 1) * limite)
        .limit(limite),

      Usuario.countDocuments(filtro),
    ]);

    res.json({
      items,
      pagina,
      limite,
      total,
      paginas: Math.max(1, Math.ceil(total / limite))
    });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return mapErro(res, err, 'Erro ao buscar usuários.');
  }
});

/** GET /api/usuarios/contatos */
router.get('/contatos', autenticar, requireTenant, async (req, res) => {
  try {
    const { q, tipo } = req.query;

    const where = tenantFilter(req, {
      _id: { $ne: req.usuario.id }
    });

    if (tipo) where.tipo = tipo;

    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), 'i');
      where.$or = [{ nome: rx }, { email: rx }];
    }

    const contatos = await Usuario.find(where)
      .select('_id nome tipo email')
      .sort({ nome: 1 });

    res.json(contatos);
  } catch (err) {
    console.error('Erro ao listar contatos:', err);
    return mapErro(res, err, 'Erro ao listar contatos.');
  }
});

/** GET /api/usuarios/:id */
router.get('/:id', autenticar, requireTenant, verificarAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id)
      .select('-senha')
      .populate('instituicao', 'nome sigla slug');

    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }

    if (!assertSameInstitution(req, usuario.instituicao?._id || usuario.instituicao)) {
      return res.status(403).json({ mensagem: 'Sem permissão para acessar usuário de outra instituição.' });
    }

    res.json(usuario);
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    return mapErro(res, err, 'Erro ao buscar usuário.');
  }
});

/** PUT /api/usuarios/:id */
router.put('/:id', autenticar, requireTenant, verificarAdmin, async (req, res) => {
  try {
    const { nome, tipo, instituicao, senha } = req.body;

    if (!nome || !tipo) {
      return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios.' });
    }

    const usuario = await Usuario.findById(req.params.id).select('+senha');
    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }

    if (!assertSameInstitution(req, usuario.instituicao)) {
      return res.status(403).json({ mensagem: 'Sem permissão para editar usuário de outra instituição.' });
    }

    let instId = String(usuario.instituicao);

    if (isMasterLike(req) && instituicao) {
      const resolved = await resolveInstituicaoId(instituicao);
      if (!resolved) {
        return res.status(400).json({ mensagem: 'Instituição inválida.' });
      }
      instId = resolved;
    }

    usuario.nome = nome;
    usuario.tipo = tipo;
    usuario.instituicao = instId;

    if (typeof senha === 'string' && senha.trim() !== '') {
      usuario.senha = senha;
    }

    await usuario.save();

    const usuarioLimpo = await Usuario.findById(usuario._id)
      .select('-senha')
      .populate('instituicao', 'nome sigla slug');

    res.json({ mensagem: 'Usuário atualizado com sucesso.', usuario: usuarioLimpo });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    return mapErro(res, err, 'Erro ao atualizar usuário.');
  }
});

/** DELETE /api/usuarios/:id */
router.delete('/:id', autenticar, requireTenant, verificarAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select('_id instituicao');

    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }

    if (!assertSameInstitution(req, usuario.instituicao)) {
      return res.status(403).json({ mensagem: 'Sem permissão para excluir usuário de outra instituição.' });
    }

    await Usuario.findByIdAndDelete(req.params.id);

    res.json({ mensagem: 'Usuário excluído com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    return mapErro(res, err, 'Erro ao excluir usuário.');
  }
});

/* =========================================================================
 *  ACESSO VIA TOKEN (QR Code do professor)
 *  GET /api/usuarios/acesso/:token
 * =========================================================================*/
router.get('/acesso/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ mensagem: 'Token ausente.' });

    const professor = await Usuario.findOne({
      tokenAcesso: token,
      tipo: 'professor',
      ativo: true
    })
      .select('_id nome instituicao')
      .lean();

    if (!professor) {
      return res.status(404).json({ mensagem: 'Professor não encontrado ou token inválido.' });
    }

    const alunos = await Aluno.find({
      instituicao: professor.instituicao
    })
      .select('nome turma comportamento foto')
      .sort({ turma: 1, nome: 1 })
      .lean();

    res.json({
      professor: professor.nome,
      instituicao: String(professor.instituicao),
      totalAlunos: alunos.length,
      alunos,
    });
  } catch (err) {
    console.error('Erro ao acessar com token do professor:', err);
    return mapErro(res, err, 'Erro ao acessar com token.');
  }
});

module.exports = router;