const express = require('express');
const router = express.Router();

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const Observacao = require('../models/Observacao');
const { autenticar } = require('../middleware/autenticacao'); // usa cookie JWT
const calcularNotaTSMD = require('../utils/calculoNota');
const Log = require('../models/Log');

// ---------- Upload de foto (multer) ----------
const pastaAlunos = path.join(__dirname, '../uploads/alunos');
fs.mkdirSync(pastaAlunos, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pastaAlunos),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  }
});
const fileFilter = (req, file, cb) => {
  if (!file?.mimetype?.startsWith('image/')) {
    return cb(new Error('Envie um arquivo de imagem.'), false);
  }
  cb(null, true);
};
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ---------- Helpers ----------
const BASE_SELECT_LISTA = 'nome turma'; // mínimo necessário

function anexarThumbNaPlain(a) {
  return { ...a, fotoThumbUrl: `/api/imagens/thumb/${a._id}` };
}
function anexarThumb(alunoDoc) {
  const obj = alunoDoc?.toObject ? alunoDoc.toObject() : alunoDoc;
  return anexarThumbNaPlain(obj);
}
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

// ============= NOVAS LISTAS =============

// GET /api/alunos/turmas -> lista de turmas (da instituição do usuário)
router.get('/turmas', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;
    const turmas = await Aluno.distinct('turma', { instituicao: inst, turma: { $ne: null } });
    turmas.sort((a,b) => String(a).localeCompare(String(b), 'pt-BR', { numeric:true }));
    res.json({ turmas });
  } catch (e) {
    console.error('Erro GET /alunos/turmas:', e);
    res.status(500).json({ message: 'Erro ao listar turmas' });
  }
});

// GET /api/alunos/turma/:turma -> paginação leve para a grade
// aceita ?pagina=1&limite=24&q=termo
router.get('/turma/:turma', autenticar, async (req, res) => {
  try {
    const { turma } = req.params;
    const pagina = Math.max(parseInt(req.query.pagina || '1', 10), 1);
    const limite = Math.min(Math.max(parseInt(req.query.limite || '24', 10), 1), 60);
    const q = (req.query.q || '').trim();

    const filtro = {
      instituicao: req.usuario.instituicao,
      turma
    };
    if (q) {
      filtro.nome = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const total = await Aluno.countDocuments(filtro);
    const paginas = Math.max(Math.ceil(total / limite), 1);

    const alunos = await Aluno.find(filtro)
      .select(`${BASE_SELECT_LISTA}`)
      .sort({ nome: 1 })
      .skip((pagina - 1) * limite)
      .limit(limite)
      .lean();

    const items = alunos.map(anexarThumbNaPlain);
    res.json({ pagina, paginas, total, items });
  } catch (e) {
    console.error('Erro GET /alunos/turma/:turma', e);
    res.status(500).json({ message: 'Erro ao listar alunos da turma' });
  }
});

// ============= ENDPOINTS EXISTENTES (mantidos) =============

// GET /api/alunos/:id/nota -> calcula nota deste aluno
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

// GET /api/alunos -> lista (modo antigo / não usada pela nova grade)
router.get('/', autenticar, async (req, res) => {
  try {
    const semNota = String(req.query.semNota || '').toLowerCase() === '1' || String(req.query.semNota || '').toLowerCase() === 'true';
    const filtro = { instituicao: req.usuario.instituicao };
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
    console.error('Erro GET /api/alunos:', error);
    res.status(500).json({ message: 'Erro ao buscar alunos', error });
  }
});

// GET /api/alunos/:id -> detalhes leves do aluno (para o modal)
router.get('/:id', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });

    res.json({ aluno: anexarThumb(aluno) });
  } catch (error) {
    console.error('Erro GET /api/alunos/:id:', error);
    res.status(500).json({ message: 'Erro ao buscar aluno', error });
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

// PUT /api/alunos/:id/foto
router.put('/:id/foto', autenticar, upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'Envie a imagem no campo "foto".' });
    }

    const aluno = await Aluno.findOne({ _id: id, instituicao: req.usuario.instituicao });
    if (!aluno) {
      try { if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ message: 'Aluno não encontrado.' });
    }

    if (aluno.foto) {
      const caminhoAntigo = path.join(__dirname, '../', aluno.foto.replace(/^\//, ''));
      try { if (fs.existsSync(caminhoAntigo)) fs.unlinkSync(caminhoAntigo); } catch {}
    }

    const publicPath = `/uploads/alunos/${req.file.filename}`;
    aluno.foto = publicPath;
    await aluno.save();

    return res.json({ ok: true, message: 'Foto atualizada com sucesso.', foto: publicPath });
  } catch (err) {
    console.error('Erro ao atualizar foto:', err);
    return res.status(500).json({ message: 'Erro ao atualizar a foto do aluno' });
  }
});

// PUT /api/alunos/:id
router.put('/:id', autenticar, async (req, res) => {
  try {
    const dadosAtualizados = { ...req.body };

    if (dadosAtualizados.turma) {
      dadosAtualizados.turma = dadosAtualizados.turma
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[ºº°]/g, 'º').replace(/[ª]/g, 'ª').trim();
    }

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

    const alunoAtualizado = await Aluno.findOneAndUpdate(
      { _id: req.params.id, instituicao: req.usuario.instituicao },
      dadosAtualizados,
      { new: true }
    );

    const force = String(req.query.recalcular || '').toLowerCase();
    const forcarRecalculo = force === '1' || force === 'true';

    if (mudouDataEntrada || forcarRecalculo) {
      const notificacoes = await Notificacao.find({ aluno: alunoAtualizado._id })
        .select('data valorNumerico createdAt')
        .sort({ data: 1, createdAt: 1 });

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

    if (aluno.foto) {
      const caminho = path.join(__dirname, '../', aluno.foto.replace(/^\//, ''));
      try { if (fs.existsSync(caminho)) fs.unlinkSync(caminho); } catch {}
    }

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
