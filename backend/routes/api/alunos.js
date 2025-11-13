// routes/api/alunos.js
const express = require('express');
const router = express.Router();

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const Log = require('../../models/Log');

const { autenticar } = require('../../middleware/autenticacao');
const autenticarTokenProfessor = require('../../middleware/tokenProfessor');
const calcularNotaTSMD = require('../../utils/calculoNota');
const { enviarTelegram } = require('../../services/mensageria');

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
  const obj = alunoDoc?.toObject ? alunoDoc.toObject() : alunoDoc;
  return anexarThumbNaPlain(obj);
}

function parsePtBrDateToDate(d) {
  if (typeof d === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(d.trim())) {
    const [dd, mm, yyyy] = d.trim().split('/');
    const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0, 0);
    if (!isNaN(dt.getTime())) return dt;
  }
  return d;
}

async function calcularNotaComportamento(alunoId) {
  const aluno = await Aluno.findById(alunoId).select('dataEntrada').lean();
  const notificacoes = await Notificacao.find({ aluno: alunoId }).select('data valorNumerico createdAt').sort({ data: 1, createdAt: 1 }).lean();
  return calcularNotaTSMD(aluno?.dataEntrada, new Date(), notificacoes);
}

function normalizaTurma(t) {
  return String(t || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºº°]/g, 'º')
    .replace(/[ª]/g, 'ª')
    .trim();
}

function sanitizeUpdate(payload = {}) {
  const dados = { ...payload };
  delete dados._id;
  delete dados.id;
  delete dados.instituicao;
  delete dados.createdAt;
  delete dados.updatedAt;
  return dados;
}

function normalizeChatId(id) {
  if (id === null || id === undefined) return '';
  return String(id).trim();
}

/* ===================== CACHE LEVE PARA /:id/detalhes ===================== */
const detalhesCache = new Map(); // key: inst|id  -> { exp, payload }
const DETALHES_TTL_MS = 30 * 1000; // 30s (curto, só para aliviar reaberturas/atualizações rápidas)

function cacheKey(inst, id) { return `${inst}|${id}`; }
function getCached(inst, id) {
  const k = cacheKey(inst, id);
  const item = detalhesCache.get(k);
  if (item && item.exp > Date.now()) return item.payload;
  detalhesCache.delete(k);
  return null;
}
function setCached(inst, id, payload) {
  const k = cacheKey(inst, id);
  detalhesCache.set(k, { exp: Date.now() + DETALHES_TTL_MS, payload });
}

/* ===================== NOVAS ROTAS TELEGRAM & ADESÃO ===================== */

// GET /api/alunos/adesao/por-turma
router.get('/adesao/por-turma', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const inst = req.usuario.instituicao;

    const agreg = await Aluno.aggregate([
      { $match: { instituicao: inst } },
      {
        $group: {
          _id: '$turma',
          totalAlunos: { $sum: 1 },
          comTelegram: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $gt: [{ $strLenCP: { $ifNull: ['$chatIdResponsavel', ''] } }, 0] },
                    { $gt: [{ $size: { $ifNull: ['$chatIdsResponsaveis', []] } }, 0] },
                    { $gt: [{ $strLenCP: { $ifNull: ['$contatos.telegramChatId', ''] } }, 0] }
                  ]
                },
                1, 0
              ]
            }
          }
        }
      },
      { $project: { turma: '$_id', _id: 0, totalAlunos: 1, comTelegram: 1 } }
    ]);

    const resList = agreg.map(it => ({
      turma: it.turma,
      totalAlunos: it.totalAlunos,
      comTelegram: it.comTelegram,
      percentual: it.totalAlunos ? Math.round((it.comTelegram / it.totalAlunos) * 100) : 0
    })).sort((a, b) => String(a.turma).localeCompare(String(b.turma), 'pt-BR', { numeric: true, sensitivity: 'base' }));

    res.set('Cache-Control', 'private, max-age=60');
    res.json({ adesao: resList });
  } catch (e) {
    console.error('Erro GET /api/alunos/adesao/por-turma:', e);
    res.status(500).json({ message: 'Erro ao calcular adesão' });
  }
});

// GET /api/alunos/:id/telegram
router.get('/:id/telegram', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst })
      .select('nome turma chatIdResponsavel chatIdsResponsaveis contatos.telegramChatId')
      .lean();
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    const set = new Set([
      ...(aluno.chatIdsResponsaveis || []),
      aluno.chatIdResponsavel || '',
      aluno.contatos?.telegramChatId || ''
    ].map(s => String(s || '').trim()).filter(Boolean));

    res.json({
      nome: aluno.nome,
      turma: aluno.turma,
      chatIdResponsavel: aluno.chatIdResponsavel || '',
      chatIdsResponsaveis: Array.from(set)
    });
  } catch (e) {
    console.error('Erro GET /api/alunos/:id/telegram:', e);
    res.status(500).json({ message: 'Erro ao obter dados de Telegram' });
  }
});

// POST /api/alunos/:id/telegram/vincular
router.post('/:id/telegram/vincular', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const chatId = normalizeChatId(req.body?.chatId);
    if (!chatId) return res.status(400).json({ message: 'chatId é obrigatório.' });

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    aluno.addChatId(chatId);
    await aluno.save();

    await Log.create({
      usuario: req.usuario.id,
      instituicao: inst,
      acao: 'Vincular Telegram',
      entidade: 'Aluno',
      entidadeId: aluno._id,
      detalhe: `chatId=${chatId}`
    });

    res.json({ ok: true, message: 'Vinculado com sucesso.', chatIds: aluno.getAllChatIds() });
  } catch (e) {
    console.error('Erro POST /api/alunos/:id/telegram/vincular:', e);
    res.status(500).json({ message: 'Erro ao vincular chatId' });
  }
});

// DELETE /api/alunos/:id/telegram/:chatId
router.delete('/:id/telegram/:chatId', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const chatId = normalizeChatId(req.params.chatId);
    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    aluno.removeChatId(chatId);
    await aluno.save();

    await Log.create({
      usuario: req.usuario.id,
      instituicao: inst,
      acao: 'Desvincular Telegram',
      entidade: 'Aluno',
      entidadeId: aluno._id,
      detalhe: `chatId=${chatId}`
    });

    res.json({ ok: true, message: 'ChatId removido.', chatIds: aluno.getAllChatIds() });
  } catch (e) {
    console.error('Erro DELETE /api/alunos/:id/telegram/:chatId:', e);
    res.status(500).json({ message: 'Erro ao remover chatId' });
  }
});

// POST /api/alunos/:id/telegram/optout
router.post('/:id/telegram/optout', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const all = String(req.body?.all || '').toLowerCase() === 'true' || req.body?.all === true;

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    if (all) {
      aluno.chatIdsResponsaveis = [];
      aluno.chatIdResponsavel = '';
    } else {
      if (aluno.chatIdResponsavel) {
        aluno.removeChatId(aluno.chatIdResponsavel);
      }
    }
    await aluno.save();

    await Log.create({
      usuario: req.usuario.id,
      instituicao: inst,
      acao: 'Opt-out Telegram',
      entidade: 'Aluno',
      entidadeId: aluno._id,
      detalhe: all ? 'all=true' : 'principal'
    });

    res.json({ ok: true, message: all ? 'Todos os chatIds removidos.' : 'ChatId principal removido.', chatIds: aluno.getAllChatIds() });
  } catch (e) {
    console.error('Erro POST /api/alunos/:id/telegram/optout:', e);
    res.status(500).json({ message: 'Erro ao processar opt-out' });
  }
});

// GET /api/alunos/:id/telegram/deeplink
router.get('/:id/telegram/deeplink', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst }).select('_id nome turma').lean();
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    const botUser = process.env.TG_BOT_USERNAME || 'cmdpiiczs_bot';
    const token = String(aluno._id);
    const url = `https://t.me/${botUser}?start=${encodeURIComponent(token)}`;

    res.json({ deeplink: url, bot: botUser, token, aluno: { id: String(aluno._id), nome: aluno.nome, turma: aluno.turma } });
  } catch (e) {
    console.error('Erro GET /api/alunos/:id/telegram/deeplink:', e);
    res.status(500).json({ message: 'Erro ao gerar deeplink' });
  }
});

// POST /api/alunos/:id/telegram/teste
router.post('/:id/telegram/teste', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ message: 'Informe "texto" no corpo da requisição.' });

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    const chatIds = aluno.getAllChatIds();
    if (!chatIds.length) return res.status(400).json({ message: 'Aluno sem chatId cadastrado.' });

    const enviados = [];
    const falhas = [];

    for (const cid of chatIds) {
      try {
        const ok = await enviarTelegram(
          { nome: aluno.nome, turma: aluno.turma },
          'Teste',
          cid,
          texto
        );
        if (ok?.ok) enviados.push(cid);
        else falhas.push({ cid, motivo: ok?.motivo || ok?.erro || 'desconhecido' });
      } catch (err) {
        falhas.push({ cid, motivo: err?.message || 'erro' });
      }
    }

    await Log.create({
      usuario: req.usuario.id,
      instituicao: inst,
      acao: 'Envio Teste Telegram',
      entidade: 'Aluno',
      entidadeId: aluno._id,
      detalhe: `enviados=${enviados.length}; falhas=${falhas.length}`
    });

    res.json({ ok: true, enviados, falhas });
  } catch (e) {
    console.error('Erro POST /api/alunos/:id/telegram/teste:', e);
    res.status(500).json({ message: 'Erro ao enviar teste' });
  }
});

/* ===================== ROTAS RÁPIDAS (ADMIN/PROFESSOR) ===================== */

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
    const turma = normalizaTurma(req.params.turma);

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

router.get('/professor/turmas', autenticarTokenProfessor, async (req, res) => {
  try {
    if (!req.professor?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });
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
    if (!req.professor?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const LIMITE = 48;
    const pagina = Math.max(parseInt(req.query.pagina || '1', 10), 1);
    const termo = (req.query.q || '').trim();
    const turma = normalizaTurma(req.params.turma);

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
    if (!req.professor?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

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

/* ===================== ROTAS ORIGINAIS ===================== */

// GET /api/alunos/contagem
router.get(['/contagem', '/count'], autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }
    const filtro = { instituicao: req.usuario.instituicao };
    if (req.query.turma) {
      filtro.turma = normalizaTurma(req.query.turma);
    }
    const count = await Aluno.countDocuments(filtro);
    res.json({ count, total: count });
  } catch (e) {
    console.error('Erro GET /api/alunos/contagem:', e);
    res.status(500).json({ message: 'Erro ao contar alunos' });
  }
});

// GET /api/alunos
router.get('/', autenticar, async (req, res) => {
  try {
    const semNota = ['1','true'].includes(String(req.query.semNota || '').toLowerCase());
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const filtro = { instituicao: req.usuario.instituicao };
    const turma = req.query.turma;
    if (turma) filtro.turma = normalizaTurma(turma);

    if (semNota) {
      const alunos = await Aluno.find(filtro).select(BASE_SELECT_LISTA).lean();
      return res.json(alunos.map(anexarThumbNaPlain));
    }

    const alunos = await Aluno.find(filtro).select('nome turma foto instituicao').lean();
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

/* === CRIAÇÃO DE NOVO ALUNO === */
// POST /api/alunos
router.post('/', autenticar, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

    let { nome, turma, dataEntrada, telefone } = req.body;
    nome = String(nome || '').trim();
    turma = normalizaTurma(turma);

    if (!nome || !turma) {
      return res.status(400).json({ message: 'Nome e turma são obrigatórios.' });
    }

    let dtEntrada;
    if (dataEntrada) {
      // vem do <input type="date"> → "yyyy-mm-dd"
      const iso = String(dataEntrada).trim();
      const dt = new Date(iso + 'T00:00:00');
      if (!isNaN(dt.getTime())) dtEntrada = dt;
    }

    const novoAluno = await Aluno.create({
      nome,
      turma,
      dataEntrada: dtEntrada,
      telefone: String(telefone || '').trim(),
      instituicao: req.usuario.instituicao,
      ativo: true
    });

    await Log.create({
      usuario: req.usuario.id,
      instituicao: req.usuario.instituicao,
      acao: 'Criação de Aluno',
      entidade: 'Aluno',
      entidadeId: novoAluno._id
    });

    res.status(201).json(anexarThumb(novoAluno));
  } catch (error) {
    console.error('Erro POST /api/alunos:', error);
    res.status(500).json({ message: 'Erro ao criar aluno', error: error?.message || error });
  }
});

router.get('/professor', autenticarTokenProfessor, async (req, res) => {
  try {
    const semNota = ['1','true'].includes(String(req.query.semNota || '').toLowerCase());
    if (!req.professor?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const filtro = { instituicao: req.professor.instituicao };
    const turma = req.query.turma;
    if (turma) filtro.turma = normalizaTurma(turma);

    if (semNota) {
      const alunos = await Aluno.find(filtro).select(BASE_SELECT_LISTA).lean();
      return res.json(alunos.map(anexarThumbNaPlain));
    }

    const alunos = await Aluno.find(filtro).select('nome turma foto instituicao').lean();
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

/* === DETALHES OTIMIZADO COM CACHE === */
router.get('/:id/detalhes', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const id = String(req.params.id);

    // cache curto p/ aliviar reaberturas consecutivas
    const hit = getCached(inst, id);
    if (hit) {
      res.set('Cache-Control', 'private, max-age=15');
      return res.json(hit);
    }

    // aluno (lean + projeção enxuta)
    const aluno = await Aluno.findOne({ _id: id, instituicao: inst })
      .select('nome turma dataEntrada nomePai nomeMae telefone nascimento endereco foto fotoCaminho instituicao updatedAt createdAt codigoAcesso')
      .lean();

    if (!aluno) {
      return res.status(404).json({ message: 'Aluno não encontrado.' });
    }

    // notificações (lean + projeção + ordenação índice-friendly)
    const notificacoes = await Notificacao.find({ aluno: id })
      .select('data tipo tipoMedida motivo valorNumerico valorTotal artigo inciso classificacaoRegulamento quantidadeDias observacoes createdAt')
      .sort({ data: 1, createdAt: 1 }) // bate com índices compostos
      .lean();

    // cálculo local (rápido) com dados já ordenados
    const notaAtual = calcularNotaTSMD(aluno.dataEntrada, new Date(), notificacoes);

    const payload = { aluno, notaAtual, notificacoes };

    // guarda no cache por 30s
    setCached(inst, id, payload);

    res.set('Cache-Control', 'private, max-age=15');
    return res.json(payload);
  } catch (error) {
    console.error('Erro GET /api/alunos/:id/detalhes:', error);
    return res.status(500).json({ message: 'Erro ao obter detalhes', error });
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

    const dadosAtualizados = sanitizeUpdate(req.body);

    if (dadosAtualizados.turma) {
      dadosAtualizados.turma = normalizaTurma(dadosAtualizados.turma);
    }

    if (dadosAtualizados.dataEntrada !== undefined) {
      dadosAtualizados.dataEntrada = parsePtBrDateToDate(dadosAtualizados.dataEntrada);
    }
    if (dadosAtualizados.nascimento !== undefined) {
      dadosAtualizados.nascimento = parsePtBrDateToDate(dadosAtualizados.nascimento);
    }

    const alunoAntes = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    }).select('_id dataEntrada').lean();

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
        .sort({ data: 1, createdAt: 1 })
        .lean();

      const nota = calcularNotaTSMD(alunoAtualizado.dataEntrada, new Date(), notificacoes);
      alunoAtualizado.comportamento = nota;
      await alunoAtualizado.save();
    }

    await Log.create({
      usuario: req.usuario.id,
      instituicao: req.usuario.instituicao,
      acao: 'Edição de Aluno',
      entidade: 'Aluno',
      entidadeId: alunoAtualizado._id
    });

    // invalida cache da ficha desse aluno
    try { detalhesCache.delete(cacheKey(req.usuario.instituicao, String(alunoAtualizado._id))); } catch {}

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
      usuario: req.usuario.id,
      instituicao: req.usuario.instituicao,
      acao: 'Exclusão de Aluno',
      entidade: 'Aluno',
      entidadeId: aluno._id
    });

    // invalida cache
    try { detalhesCache.delete(cacheKey(req.usuario.instituicao, String(aluno._id))); } catch {}

    res.json({ message: 'Aluno e dados relacionados deletados com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar aluno:', error);
    res.status(500).json({ message: 'Erro ao deletar aluno', error });
  }
});

module.exports = router;
