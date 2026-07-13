// backend/routes/api/instituicoes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Instituicao = require('../../models/Instituicao');
const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const { autenticar } = require('../../middleware/autenticacao');

/** ==== helpers ==== */
function apenasAdmin(req, res, next) {
  if (req?.usuario?.tipo === 'admin') return next();
  return res.status(403).json({ mensagem: 'Apenas administradores podem realizar esta ação.' });
}

function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.isValidObjectId(id);
}

function normalizaTexto(s) {
  return String(s || '')
    .trim();
}

/** ==== GET /api/instituicoes (lista com busca e paginação) ==== */
router.get('/', autenticar, async (req, res) => {
  try {
    const pagina = Math.max(parseInt(req.query.pagina || '1', 10), 1);
    const limite = Math.min(Math.max(parseInt(req.query.limite || '20', 10), 1), 100);
    const q = normalizaTexto(req.query.q || '');

    const filtro = {};
    if (q) {
      filtro.$or = [
        { nome: { $regex: q, $options: 'i' } },
        { sigla: { $regex: q, $options: 'i' } },
        { municipio: { $regex: q, $options: 'i' } },
        { estado: { $regex: q, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      Instituicao.find(filtro)
        .sort({ ativo: -1, nome: 1 })
        .skip((pagina - 1) * limite)
        .limit(limite)
        .lean(),
      Instituicao.countDocuments(filtro),
    ]);

    res.json({
      items,
      pagina,
      limite,
      total,
      paginas: Math.max(1, Math.ceil(total / limite)),
    });
  } catch (err) {
    console.error('Erro GET /api/instituicoes:', err);
    res.status(500).json({ mensagem: 'Erro ao listar instituições.' });
  }
});

/** ==== GET /api/instituicoes/:id ==== */
router.get('/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ mensagem: 'ID inválido.' });
    }
    const inst = await Instituicao.findById(id).lean();
    if (!inst) return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    res.json(inst);
  } catch (err) {
    console.error('Erro GET /api/instituicoes/:id:', err);
    res.status(500).json({ mensagem: 'Erro ao obter instituição.' });
  }
});

/** ==== POST /api/instituicoes (admin) ==== */
router.post('/', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { nome, sigla, cnpj, municipio, estado, endereco, telefone, email, ativo } = req.body;

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ mensagem: 'Nome é obrigatório.' });
    }

    // Evita duplicar nomes
    const jaExiste = await Instituicao.findOne({ nome: String(nome).trim() }).lean();
    if (jaExiste) {
      return res.status(409).json({ mensagem: 'Já existe uma instituição com este nome.' });
    }

    const doc = await Instituicao.create({
      nome: normalizaTexto(nome),
      sigla: normalizaTexto(sigla).toUpperCase() || undefined,
      cnpj: normalizaTexto(cnpj) || undefined,
      municipio: normalizaTexto(municipio) || undefined,
      estado: normalizaTexto(estado).toUpperCase() || undefined,
      endereco: normalizaTexto(endereco) || undefined,
      telefone: normalizaTexto(telefone) || undefined,
      email: normalizaTexto(email).toLowerCase() || undefined,
      ativo: typeof ativo === 'boolean' ? ativo : true,
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error('Erro POST /api/instituicoes:', err);
    res.status(400).json({ mensagem: 'Erro ao criar instituição.', erro: err?.message });
  }
});

/** ==== PUT /api/instituicoes/:id (admin) ==== */
router.put('/:id', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ mensagem: 'ID inválido.' });
    }

    const payload = { ...req.body };

    // Normalizações
    if (payload.nome !== undefined) payload.nome = normalizaTexto(payload.nome);
    if (payload.sigla !== undefined) payload.sigla = normalizaTexto(payload.sigla).toUpperCase();
    if (payload.cnpj !== undefined) payload.cnpj = normalizaTexto(payload.cnpj);
    if (payload.municipio !== undefined) payload.municipio = normalizaTexto(payload.municipio);
    if (payload.estado !== undefined) payload.estado = normalizaTexto(payload.estado).toUpperCase();
    if (payload.endereco !== undefined) payload.endereco = normalizaTexto(payload.endereco);
    if (payload.telefone !== undefined) payload.telefone = normalizaTexto(payload.telefone);
    if (payload.email !== undefined) payload.email = normalizaTexto(payload.email).toLowerCase();

    // Não permitir mudar _id
    delete payload._id;
    delete payload.id;

    const atualizado = await Instituicao.findByIdAndUpdate(id, payload, { new: true, runValidators: true }).lean();
    if (!atualizado) return res.status(404).json({ mensagem: 'Instituição não encontrada.' });

    res.json(atualizado);
  } catch (err) {
    console.error('Erro PUT /api/instituicoes/:id:', err);
    res.status(400).json({ mensagem: 'Erro ao atualizar instituição.', erro: err?.message });
  }
});

/** ==== PATCH /api/instituicoes/:id/status (admin) ==== */
router.patch('/:id/status', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ativo } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ mensagem: 'ID inválido.' });
    }
    if (typeof ativo !== 'boolean') {
      return res.status(400).json({ mensagem: 'Informe { ativo: true|false }.' });
    }

    const inst = await Instituicao.findByIdAndUpdate(id, { ativo }, { new: true }).lean();
    if (!inst) return res.status(404).json({ mensagem: 'Instituição não encontrada.' });

    res.json({ mensagem: `Instituição ${ativo ? 'ativada' : 'desativada'} com sucesso.`, instituicao: inst });
  } catch (err) {
    console.error('Erro PATCH /api/instituicoes/:id/status:', err);
    res.status(400).json({ mensagem: 'Erro ao atualizar status.', erro: err?.message });
  }
});

/** ==== DELETE /api/instituicoes/:id (admin, seguro) ==== 
 * Bloqueia exclusão se houver vínculos (usuários ou alunos).
 */
router.delete('/:id', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ mensagem: 'ID inválido.' });
    }

    // Verifica vínculos
    const [qtdUsuarios, qtdAlunos] = await Promise.all([
      Usuario.countDocuments({ instituicao: id }),
      Aluno.countDocuments({ instituicao: id }),
    ]);

    if (qtdUsuarios > 0 || qtdAlunos > 0) {
      return res.status(409).json({
        mensagem: 'Não é possível excluir: existem vínculos.',
        detalhes: { usuarios: qtdUsuarios, alunos: qtdAlunos },
        dica: 'Desative a instituição (PATCH /status) ou remova/realocar os vínculos antes de excluir.',
      });
    }

    const apagada = await Instituicao.findByIdAndDelete(id).lean();
    if (!apagada) return res.status(404).json({ mensagem: 'Instituição não encontrada.' });

    res.json({ mensagem: 'Instituição excluída com sucesso.' });
  } catch (err) {
    console.error('Erro DELETE /api/instituicoes/:id:', err);
    res.status(500).json({ mensagem: 'Erro ao excluir instituição.' });
  }
});

module.exports = router;
