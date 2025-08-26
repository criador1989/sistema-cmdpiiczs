const express = require('express');
const router = express.Router();

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const { autenticar } = require('../../middleware/autenticacao');
const autenticarTokenProfessor = require('../../middleware/tokenProfessor');
const calcularNotaTSMD = require('../../utils/calculoNota');
const Log = require('../../models/Log');
const sharp = require('sharp');

// ---------- Upload de foto (multer) ----------
const pastaAlunos = path.join(__dirname, '../../uploads/alunos');
fs.mkdirSync(pastaAlunos, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pastaAlunos),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `${req.params.id || 'aluno'}-${Date.now()}${ext}`);
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
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB
});

// ---------- Helpers ----------
const BASE_SELECT_LISTA = 'nome turma foto';

function anexarThumbNaPlain(a) {
  return { ...a, fotoThumbUrl: `/api/imagens/thumb/${a._id}` };
}
function anexarThumb(alunoDoc) {
  const obj = alunoDoc.toObject ? alunoDoc.toObject() : alunoDoc;
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

// ===================== NOVAS ROTAS RÁPIDAS (ADMIN) =====================

// GET /api/alunos/turmas
router.get('/turmas', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });
    const turmas = await Aluno.distinct('turma', { instituicao: req.usuario.instituicao });
    turmas.sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }));
    res.set('Cache-Control', 'private, max-age=120');
    res.json({ turmas });
  } catch (e) {
    console.error('Erro GET /api/alunos/turmas:', e);
    res.status(500).json({ message: 'Erro ao listar turmas' });
  }
});

// GET /api/alunos/turma/:turma?pagina=1&q=
router.get('/turma/:turma', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const LIMITE = 48;
    const pagina = Math.max(parseInt(req.query.pagina || '1', 10), 1);
    const termo = (req.query.q || '').trim();
    const turma = req.params.turma.trim();

    const filtro = { instituicao: req.usuario.instituicao, turma };
    if (termo) filtro.nome = { $regex: termo, $options: 'i' };

    const [items, total] = await Promise.all([
      Aluno.find(filtro).select('_id nome turma').sort({ nome: 1 })
        .skip((pagina - 1) * LIMITE).limit(LIMITE).lean(),
      Aluno.countDocuments(filtro)
    ]);

    res.set('Cache-Control', 'private, max-age=30');
    res.json({ items, pagina, total, paginas: Math.ceil(total / LIMITE) });
  } catch (error) {
    console.error('Erro GET /api/alunos/turma:', error);
    res.status(500).json({ message: 'Erro ao listar alunos', error });
  }
});

// GET /api/alunos/:id/detalhes
router.get('/:id/detalhes', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const id = req.params.id;
    const aluno = await Aluno.findOne({ _id: id, instituicao: req.usuario.instituicao })
      .select('nome turma dataEntrada nomePai nomeMae telefone nascimento endereco foto fotoCaminho instituicao')
      .lean();

    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    const notificacoes = await Notificacao.find({ aluno: id })
      .select('data tipo valorNumerico')
      .sort({ data: 1 })
      .lean();

    const notaAtual = calcularNotaTSMD(aluno.dataEntrada, new Date(), notificacoes);

    res.set('Cache-Control', 'private, max-age=15');
    res.json({ aluno, notaAtual, notificacoes });
  } catch (error) {
    console.error('Erro GET /api/alunos/:id/detalhes:', error);
    res.status(500).json({ message: 'Erro ao obter detalhes', error });
  }
});

// ===================== ROTAS RÁPIDAS (PROFESSOR) =====================

router.get('/professor/turmas', autenticarTokenProfessor, async (req, res) => {
  try {
    const turmas = await Aluno.distinct('turma', { instituicao: req.professor.instituicao });
    turmas.sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }));
    res.set('Cache-Control', 'private, max-age=120');
    res.json({ turmas });
  } catch (e) {
    console.error('Erro GET /api/alunos/professor/turmas:', e);
    res.status(500).json({ message: 'Erro ao listar turmas' });
  }
});

router.get('/professor/turma/:turma', autenticarTokenProfessor, async (req, res) => {
  try {
    const LIMITE = 48;
    const pagina = Math.max(parseInt(req.query.pagina || '1', 10), 1);
    const termo = (req.query.q || '').trim();
    const turma = req.params.turma.trim();

    const filtro = { instituicao: req.professor.instituicao, turma };
    if (termo) filtro.nome = { $regex: termo, $options: 'i' };

    const [items, total] = await Promise.all([
      Aluno.find(filtro).select('_id nome turma').sort({ nome: 1 })
        .skip((pagina - 1) * LIMITE).limit(LIMITE).lean(),
      Aluno.countDocuments(filtro)
    ]);

    res.set('Cache-Control', 'private, max-age=30');
    res.json({ items, pagina, total, paginas: Math.ceil(total / LIMITE) });
  } catch (error) {
    console.error('Erro GET /api/alunos/professor/turma:', error);
    res.status(500).json({ message: 'Erro ao listar alunos', error });
  }
});

router.get('/professor/:id/detalhes', autenticarTokenProfessor, async (req, res) => {
  try {
    const id = req.params.id;
    const aluno = await Aluno.findOne({ _id: id, instituicao: req.professor.instituicao })
      .select('nome turma dataEntrada nomePai nomeMae telefone nascimento endereco foto fotoCaminho instituicao')
      .lean();
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    const notificacoes = await Notificacao.find({ aluno: id })
      .select('data tipo valorNumerico')
      .sort({ data: 1 })
      .lean();

    const notaAtual = calcularNotaTSMD(aluno.dataEntrada, new Date(), notificacoes);
    res.set('Cache-Control', 'private, max-age=15');
    res.json({ aluno, notaAtual, notificacoes });
  } catch (error) {
    console.error('Erro GET /api/alunos/professor/:id/detalhes:', error);
    res.status(500).json({ message: 'Erro ao obter detalhes', error });
  }
});

// ===================== ROTAS ORIGINAIS =====================

router.get('/', autenticar, async (req, res) => {
  try {
    const semNota = ['1','true'].includes(String(req.query.semNota || '').toLowerCase());
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

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

router.get('/professor', autenticarTokenProfessor, async (req, res) => {
  try {
    const semNota = ['1','true'].includes(String(req.query.semNota || '').toLowerCase());
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

router.get('/:id/nota', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });
    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: req.usuario.instituicao }).select('_id');
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });
    const nota = await calcularNotaComportamento(aluno._id);
    res.json({ comportamento: nota });
  } catch (error) {
    console.error('Erro GET /api/alunos/:id/nota:', error);
    res.status(500).json({ message: 'Erro ao calcular nota do aluno', error });
  }
});

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

// apoio
router.get('/baixorendimento', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });
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

router.get('/insuficientes', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });
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
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

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
    if (!req.usuario?.instituicao) return res.status(401).json({ mensagem: 'Não autenticado.' });
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

// ===== Upload de foto do aluno (OTIMIZADO) =====
router.put('/:id/foto', autenticar, upload.single('foto'), async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });
    const { id } = req.params;

    if (!req.file) return res.status(400).json({ message: 'Envie a imagem no campo "foto".' });

    const aluno = await Aluno.findOne({ _id: id, instituicao: req.usuario.instituicao });
    if (!aluno) {
      try { if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ message: 'Aluno não encontrado.' });
    }

    // apaga foto antiga
    if (aluno.foto) {
      const caminhoAntigo = path.join(__dirname, '../../', aluno.foto.replace(/^\//, ''));
      try { if (fs.existsSync(caminhoAntigo)) fs.unlinkSync(caminhoAntigo); } catch {}
    }

    // otimiza imagem recebida
    const origPath = req.file.path;
    const outExt = '.jpg';
    const outName = `${id}-${Date.now()}${outExt}`;
    const outAbs = path.join(path.dirname(origPath), outName);

    try {
      await sharp(origPath)
        .rotate()
        .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(outAbs);
      try { fs.unlinkSync(origPath); } catch {}
    } catch (err) {
      console.warn('Falha ao otimizar imagem, usando original:', err?.message || err);
      fs.renameSync(origPath, outAbs);
    }

    const publicPath = `/uploads/alunos/${path.basename(outAbs)}`;
    aluno.foto = publicPath;
    await aluno.save();

    // invalida caches de thumb/preview
    const cacheDir = path.join(__dirname, '../../public/uploads/alunos', String(aluno._id));
    try {
      if (fs.existsSync(cacheDir)) {
        for (const f of fs.readdirSync(cacheDir)) {
          try { fs.unlinkSync(path.join(cacheDir, f)); } catch {}
        }
      }
    } catch {}

    return res.json({ ok: true, message: 'Foto atualizada com sucesso.', foto: publicPath });
  } catch (err) {
    console.error('Erro ao atualizar foto:', err);
    return res.status(500).json({ message: 'Erro ao atualizar a foto do aluno' });
  }
});

router.get('/:id', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });
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

router.put('/:id', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

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

router.delete('/:id', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });

    if (aluno.foto) {
      const caminho = path.join(__dirname, '../../', aluno.foto.replace(/^\//, ''));
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
