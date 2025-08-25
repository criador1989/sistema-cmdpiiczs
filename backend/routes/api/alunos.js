const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const { autenticar } = require('../../middleware/autenticacao');
const autenticarTokenProfessor = require('../../middleware/tokenProfessor');
const calcularNotaTSMD = require('../../utils/calculoNota'); // cálculo oficial
const Log = require('../../models/Log');

// ---------- Helpers ----------
const BASE_SELECT_LISTA = 'nome turma foto'; // mínimo necessário
function anexarThumbNaPlain(a) {
  return { ...a, fotoThumbUrl: `/api/imagens/thumb/${a._id}` };
}
function anexarThumb(alunoDoc) {
  const obj = alunoDoc.toObject ? alunoDoc.toObject() : alunoDoc;
  return anexarThumbNaPlain(obj);
}
// Converte "DD/MM/AAAA" -> Date (meia-noite). Se já for Date/ISO, retorna como veio.
function parsePtBrDateToDate(d) {
  if (typeof d === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(d.trim())) {
    const [dd, mm, yyyy] = d.trim().split('/');
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0, 0);
  }
  return d;
}
async function calcularNotaComportamento(alunoId) {
  const aluno = await Aluno.findById(alunoId).select('dataEntrada');
  const notificacoes = await Notificacao.find({ aluno: alunoId }).select('data valorNumerico createdAt');
  return calcularNotaTSMD(aluno?.dataEntrada, new Date(), notificacoes);
}

// ============= LISTAS =============

// GET /api/alunos  -> aceita ?semNota=1 para lista rápida
router.get('/', autenticar, async (req, res) => {
  try {
    const semNota = String(req.query.semNota || '').toLowerCase() === '1' || String(req.query.semNota || '').toLowerCase() === 'true';
    const filtro = { instituicao: req.usuario.instituicao };
    const turma = req.query.turma;
    if (turma) filtro.turma = turma;

    if (semNota) {
      // ✅ Lista super rápida: sem calcular notas, lean e payload mínimo
      const alunos = await Aluno.find(filtro).select(BASE_SELECT_LISTA).lean();
      return res.json(alunos.map(anexarThumbNaPlain));
    }

    // (modo antigo) calcula nota de todos — pode ser pesado
    const alunos = await Aluno.find(filtro).select('nome turma foto instituicao');
    const alunosComNota = await Promise.all(
      alunos.map(async (aluno) => {
        let nota = 8.0;
        try { nota = await calcularNotaComportamento(aluno._id); } catch (e) {}
        return { ...anexarThumb(aluno), comportamento: nota };
      })
    );
    res.json(alunosComNota);
  } catch (error) {
    console.error('Erro GET /api/alunos:', error);
    res.status(500).json({ message: 'Erro ao buscar alunos', error });
  }
});

// GET /api/alunos/professor -> idem, aceita ?semNota=1 e ?turma=
router.get('/professor', autenticarTokenProfessor, async (req, res) => {
  try {
    const semNota = String(req.query.semNota || '').toLowerCase() === '1' || String(req.query.semNota || '').toLowerCase() === 'true';
    const filtro = { instituicao: req.professor.instituicao };
    const turma = req.query.turma;
    if (turma) filtro.turma = turma;

    if (semNota) {
      const alunos = await Aluno.find(filtro).select(BASE_SELECT_LISTA).lean();
      return res.json(alunos.map(anexarThumbNaPlain));
    }

    const alunos = await Aluno.find(filtro).select('nome turma foto instituicao');
    const alunosComNota = await Promise.all(
      alunos.map(async (aluno) => {
        let nota = 8.0;
        try { nota = await calcularNotaComportamento(aluno._id); } catch (e) {}
        return { ...anexarThumb(aluno), comportamento: nota };
      })
    );
    res.json(alunosComNota);
  } catch (error) {
    console.error('Erro GET /api/alunos/professor:', error);
    res.status(500).json({ message: 'Erro ao buscar alunos', error });
  }
});

// GET /api/alunos/:id/nota -> calcula só a nota deste aluno (usado no modal)
router.get('/:id/nota', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: req.usuario.instituicao }).select('_id');
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });
    const nota = await calcularNotaComportamento(aluno._id);
    res.json({ comportamento: nota });
  } catch (error) {
    console.error('Erro GET /api/alunos/:id/nota:', error);
    res.status(500).json({ message: 'Erro ao calcular nota do aluno', error });
  }
});

// (opcional) GET /api/alunos/professor/:id/nota -> se usar fluxo com token de professor
router.get('/professor/:id/nota', autenticarTokenProfessor, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: req.professor.instituicao }).select('_id');
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });
    const nota = await calcularNotaComportamento(aluno._id);
    res.json({ comportamento: nota });
  } catch (error) {
    console.error('Erro GET /api/alunos/professor/:id/nota:', error);
    res.status(500).json({ message: 'Erro ao calcular nota do aluno', error });
  }
});

// ===== ROTAS DE APOIO (mantidas) =====

// GET /api/alunos/baixorendimento
router.get('/baixorendimento', autenticar, async (req, res) => {
  try {
    const alunos = await Aluno.find({ instituicao: req.usuario.instituicao }).select('nome turma foto instituicao');
    const alunosFiltrados = [];
    for (const aluno of alunos) {
      let nota = 8.0;
      try { nota = await calcularNotaComportamento(aluno._id); } catch (e) {}
      if (nota < 5.0) alunosFiltrados.push({ ...anexarThumb(aluno), comportamento: nota });
    }
    res.json(alunosFiltrados);
  } catch (error) {
    console.error('Erro ao buscar alunos com baixo rendimento:', error);
    res.status(500).json({ message: 'Erro ao buscar alunos com baixo rendimento', error });
  }
});

// GET /api/alunos/insuficientes
router.get('/insuficientes', autenticar, async (req, res) => {
  try {
    const alunos = await Aluno.find({ instituicao: req.usuario.instituicao }).select('nome turma foto instituicao');
    const alunosFiltrados = [];
    for (const aluno of alunos) {
      let nota = 8.0;
      try { nota = await calcularNotaComportamento(aluno._id); } catch (e) {}
      if (nota < 5.0) alunosFiltrados.push({ ...anexarThumb(aluno), comportamento: nota });
    }
    res.json(alunosFiltrados);
  } catch (error) {
    console.error('Erro ao buscar alunos insuficientes:', error);
    res.status(500).json({ message: 'Erro ao buscar alunos insuficientes', error });
  }
});

// POST /api/alunos
router.post('/', autenticar, async (req, res) => {
  try {
    const {
      nome, turma, dataEntrada, nascimento, telefone, endereco,
      nomePai, nomeMae, foto
    } = req.body;

    const turmaNormalizada = turma
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[ºº°]/g, 'º').replace(/[ª]/g, 'ª').trim();

    // ✅ Normaliza dataEntrada se vier como "DD/MM/AAAA"
    const dataEntradaNormalizada = parsePtBrDateToDate(dataEntrada);

    const novoAluno = new Aluno({
      nome,
      turma: turmaNormalizada,
      dataEntrada: dataEntradaNormalizada,
      nascimento,
      telefone,
      endereco,
      nomePai,
      nomeMae,
      foto: foto || null,
      instituicao: req.usuario.instituicao
    });

    const alunoSalvo = await novoAluno.save();

    await Log.create({
      usuario: req.usuario._id,
      acao: 'Cadastro de Aluno',
      entidade: 'Aluno',
      entidadeId: alunoSalvo._id
    });

    res.status(201).json(anexarThumb(alunoSalvo));
  } catch (error) {
    console.error('Erro POST /api/alunos:', error);
    res.status(400).json({ message: 'Erro ao criar aluno', error });
  }
});

// PUT /api/alunos/transferir
router.put('/transferir', autenticar, async (req, res) => {
  try {
    const { ids, novaTurma } = req.body;
    if (!Array.isArray(ids) || !novaTurma) {
      return res.status(400).json({ mensagem: 'IDs e nova turma são obrigatórios.' });
    }
    const turmaNormalizada = novaTurma
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[ºº°]/g, 'º').replace(/[ª]/g, 'ª').trim();

    const resultado = await Aluno.updateMany(
      { _id: { $in: ids }, instituicao: req.usuario.instituicao },
      { $set: { turma: turmaNormalizada } }
    );

    res.json({ mensagem: `✅ ${resultado.modifiedCount} aluno(s) transferido(s) com sucesso.` });
  } catch (error) {
    console.error('Erro ao transferir alunos:', error);
    res.status(500).json({ mensagem: 'Erro interno ao transferir alunos.' });
  }
});

// GET /api/alunos/:id
router.get('/:id', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });
    res.json(anexarThumb(aluno));
  } catch (error) {
    console.error('Erro GET /api/alunos/:id:', error);
    res.status(500).json({ message: 'Erro ao buscar aluno', error });
  }
});

// PUT /api/alunos/:id  (ajustado p/ normalizar dataEntrada e recalcular nota)
router.put('/:id', autenticar, async (req, res) => {
  try {
    const dadosAtualizados = { ...req.body };

    // Normaliza turma (como já fazia)
    if (dadosAtualizados.turma) {
      dadosAtualizados.turma = dadosAtualizados.turma
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[ºº°]/g, 'º').replace(/[ª]/g, 'ª').trim();
    }

    // ✅ Normaliza dataEntrada quando vier como "DD/MM/AAAA"
    if (dadosAtualizados.dataEntrada !== undefined) {
      dadosAtualizados.dataEntrada = parsePtBrDateToDate(dadosAtualizados.dataEntrada);
    }

    const alunoAntes = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    }).select('_id dataEntrada');

    if (!alunoAntes) return res.status(404).json({ message: 'Aluno não encontrado' });

    const mudouDataEntrada = dadosAtualizados.dataEntrada !== undefined &&
      String(new Date(dadosAtualizados.dataEntrada).getTime()) !== String(new Date(alunoAntes.dataEntrada).getTime());

    // Atualiza o aluno
    const alunoAtualizado = await Aluno.findOneAndUpdate(
      { _id: req.params.id, instituicao: req.usuario.instituicao },
      dadosAtualizados,
      { new: true }
    );

    // Decide se recalcula: mudou dataEntrada OU query ?recalcular=1|true
    const force = String(req.query.recalcular || '').toLowerCase();
    const forcarRecalculo = force === '1' || force === 'true';

    if (mudouDataEntrada || forcarRecalculo) {
      // Busca todas as notificações do aluno
      const notificacoes = await Notificacao.find({ aluno: alunoAtualizado._id })
        .select('data valorNumerico createdAt')
        .sort({ data: 1, createdAt: 1 });

      // Recalcula a nota com TSMD por DIAS ÚTEIS a partir da nova data de entrada
      const nota = calcularNotaTSMD(alunoAtualizado.dataEntrada, new Date(), notificacoes);

      alunoAtualizado.comportamento = nota;
      await alunoAtualizado.save();
    }

    await Log.create({
      usuario: req.usuario._id,
      acao: 'Edição de Aluno',
      entidade: 'Aluno',
      entidadeId: alunoAtualizado._id
    });

    res.json(anexarThumb(alunoAtualizado));
  } catch (error) {
    console.error('Erro PUT /api/alunos/:id:', error);
    res.status(400).json({ message: 'Erro ao atualizar aluno', error });
  }
});

// DELETE /api/alunos/:id
router.delete('/:id', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });

    await Promise.all([
      Notificacao.deleteMany({ aluno: aluno._id }),
      Observacao.deleteMany({ aluno: aluno._id }),
      Aluno.deleteOne({ _id: aluno._id })
    ]);

    await Log.create({
      usuario: req.usuario._id,
      acao: 'Exclusão de Aluno',
      entidade: 'Aluno',
      entidadeId: aluno._id
    });

    res.json({ message: 'Aluno e dados relacionados deletados com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar aluno:', error);
    res.status(500).json({ message: 'Erro ao deletar aluno', error });
  }
});

module.exports = router;
