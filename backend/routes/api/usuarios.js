// routes/api/usuarios.js
const express = require('express');
const router = express.Router();

const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const { autenticar } = require('../../middleware/autenticacao');

/** Somente ADMIN */
function verificarAdmin(req, res, next) {
  if (req.usuario?.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem acessar esta funcionalidade.' });
  }
  next();
}

function normalizaEmail(e) {
  return String(e || '').trim().toLowerCase();
}

/* =========================================================================
 *   ADMIN: CRUD de usuários
 * =========================================================================*/

/**
 * POST /api/usuarios
 * Cria usuário dentro da instituição informada (admin).
 * Observação: o model já faz o hash da senha no pre('save') e,
 * se tipo === 'professor' e não houver token, gera tokenAcesso automaticamente.
 */
router.post('/', autenticar, verificarAdmin, async (req, res) => {
  const { nome, email, senha, tipo, instituicao } = req.body;
  if (!nome || !email || !senha || !tipo || !instituicao) {
    return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios.' });
  }

  try {
    const emailNorm = normalizaEmail(email);

    // Evita duplicidade por instituição + e-mail
    const usuarioExistente = await Usuario.findOne({ email: emailNorm, instituicao });
    if (usuarioExistente) {
      return res.status(409).json({ mensagem: 'E-mail já cadastrado nesta instituição.' });
    }

    const novoUsuario = new Usuario({ nome, email: emailNorm, senha, tipo, instituicao });

    // NÃO gere JWT aqui como tokenAcesso; o model cuida de tokenAcesso se tipo=professor
    await novoUsuario.save();

    res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      usuario: {
        _id: novoUsuario._id,
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        tipo: novoUsuario.tipo,
        instituicao: novoUsuario.instituicao,
        tokenAcesso: novoUsuario.tokenAcesso || null, // se professor, deve existir após save
      },
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    res.status(500).json({ mensagem: 'Erro ao criar usuário.' });
  }
});

/**
 * GET /api/usuarios
 * Lista usuários (admin). Aceita filtros opcionais:
 *   ?instituicao=<id>
 *   ?q=<texto> (nome/email)
 *   ?tipo=admin|monitor|professor
 *   ?pagina=1&limite=20
 */
router.get('/', autenticar, verificarAdmin, async (req, res) => {
  try {
    const pagina = Math.max(parseInt(req.query.pagina || '1', 10), 1);
    const limite = Math.min(Math.max(parseInt(req.query.limite || '50', 10), 1), 200);

    const filtro = {};
    if (req.query.instituicao) filtro.instituicao = req.query.instituicao;
    if (req.query.tipo) filtro.tipo = req.query.tipo;

    const q = String(req.query.q || '').trim();
    if (q) {
      const rx = new RegExp(q, 'i');
      filtro.$or = [{ nome: rx }, { email: rx }];
    }

    const [items, total] = await Promise.all([
      Usuario.find(filtro).select('-senha').sort({ nome: 1 }).skip((pagina - 1) * limite).limit(limite),
      Usuario.countDocuments(filtro),
    ]);

    res.json({
      items,
      pagina,
      limite,
      total,
      paginas: Math.max(1, Math.ceil(total / limite)),
    });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    res.status(500).json({ mensagem: 'Erro ao buscar usuários.' });
  }
});

/**
 * ⚠️ IMPORTANTE: Colocamos /contatos ANTES de "/:id" para não conflitar.
 * GET /api/usuarios/contatos
 * Lista contatos da MESMA instituição do usuário logado, exclui a si mesmo.
 * Suporta ?q=busca e ?tipo=professor|admin|...
 */
router.get('/contatos', autenticar, async (req, res) => {
  try {
    const { q, tipo } = req.query;
    const where = {
      instituicao: req.usuario.instituicao,
      _id: { $ne: req.usuario.id },
    };

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
    res.status(500).json({ mensagem: 'Erro ao listar contatos.' });
  }
});

/**
 * GET /api/usuarios/:id
 */
router.get('/:id', autenticar, verificarAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select('-senha');
    if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    res.json(usuario);
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ mensagem: 'Erro ao buscar usuário.' });
  }
});

/**
 * PUT /api/usuarios/:id
 * Atualiza dados básicos. Se `senha` vier, o pre('save') do model fará o hash.
 */
router.put('/:id', autenticar, verificarAdmin, async (req, res) => {
  const { nome, tipo, instituicao, senha } = req.body;
  if (!nome || !tipo || !instituicao) {
    return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios.' });
  }

  try {
    const usuario = await Usuario.findById(req.params.id).select('+senha');
    if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });

    usuario.nome = nome;
    usuario.tipo = tipo;
    usuario.instituicao = instituicao;

    if (typeof senha === 'string' && senha.trim() !== '') {
      usuario.senha = senha; // o pre('save') fará o hash se a senha foi modificada
    }

    await usuario.save();

    // Não retorne senha; selecione novamente sem o campo
    const usuarioLimpo = await Usuario.findById(usuario._id).select('-senha');
    res.json({ mensagem: 'Usuário atualizado com sucesso.', usuario: usuarioLimpo });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(500).json({ mensagem: 'Erro ao atualizar usuário.' });
  }
});

/**
 * DELETE /api/usuarios/:id
 */
router.delete('/:id', autenticar, verificarAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findByIdAndDelete(req.params.id);
    if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    res.json({ mensagem: 'Usuário excluído com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    res.status(500).json({ mensagem: 'Erro ao excluir usuário.' });
  }
});

/* =========================================================================
 *  ACESSO VIA TOKEN (QR Code do professor)
 *  Mantenha apenas UM endpoint para esse acesso no projeto.
 *  GET /api/usuarios/acesso/:token
 * =========================================================================*/
router.get('/acesso/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(400).json({ mensagem: 'Token ausente.' });
    }

    const professor = await Usuario.findOne({ tokenAcesso: token, tipo: 'professor', ativo: true })
      .select('_id nome instituicao')
      .lean();

    if (!professor) {
      return res.status(404).json({ mensagem: 'Professor não encontrado ou token inválido.' });
    }

    // instituicao agora é ObjectId — usar diretamente
    const alunos = await Aluno.find({ instituicao: professor.instituicao })
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
    res.status(500).json({ mensagem: 'Erro ao acessar com token.' });
  }
});

module.exports = router;
