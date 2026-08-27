'use strict';

const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');

const router = express.Router();

const Aluno = require('../../models/Aluno');
const ObservacaoProfessor = require('../../models/ObservacaoProfessor');
const { autenticar, apenasProfessor, apenasMonitorOuAdmin, apenasAdmin } = require('../../middleware/autenticacao');
const { requireTenant, tenantFilter } = require('../../middleware/tenantScope');
const { attachActor, logAction } = require('../../utils/audit');

const CATEGORIAS = new Set([
  'comportamento',
  'participacao_pedagogica',
  'convivencia',
  'seguranca',
  'atividade',
  'elogio',
  'outro',
]);

const PRIORIDADES = new Set(['normal', 'atencao', 'urgente']);
const MAX_ALUNOS_LOTE = 50;
const STATUS_ADMIN = new Set(['nova', 'lida', 'em_atendimento', 'resolvida', 'arquivada']);

function textoLimpo(valor, max = 2500) {
  return String(valor || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);
}

function normalizarTurma(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function usuarioId(req) {
  return String(req.usuario?.id || req.usuario?._id || '').trim();
}

function usuarioNome(req) {
  return textoLimpo(req.usuario?.nome || req.usuario?.email || 'Usuário', 180);
}

function professorPodeAcessarTurma(req, turma) {
  const turmas = Array.isArray(req.usuario?.turmas) ? req.usuario.turmas : [];
  if (!turmas.length) return true;

  const turmaAluno = normalizarTurma(turma);
  return turmas.map(normalizarTurma).includes(turmaAluno);
}

function ehProfessor(req) {
  return String(req.usuario?.tipo || '').toLowerCase() === 'professor';
}

function ehGestao(req) {
  return ['monitor', 'admin', 'master', 'superadmin'].includes(String(req.usuario?.tipo || '').toLowerCase());
}

function marcadoresValidos(valor) {
  if (!Array.isArray(valor)) return [];
  return [...new Set(
    valor
      .map((item) => textoLimpo(item, 100))
      .filter(Boolean)
  )].slice(0, 12);
}

function prioridadePeso(valor) {
  if (valor === 'urgente') return 3;
  if (valor === 'atencao') return 2;
  return 1;
}

function mapearObservacao(doc, currentUserId = null) {
  const obj = doc?.toObject ? doc.toObject() : { ...(doc || {}) };
  const lidaPor = Array.isArray(obj.lidaPor) ? obj.lidaPor : [];
  const lidaPeloUsuario = currentUserId
    ? lidaPor.some((item) => String(item?.usuario || '') === String(currentUserId))
    : false;

  return {
    _id: obj._id,
    aluno: obj.aluno,
    alunoNome: obj.alunoNome,
    turma: obj.turma,
    professor: obj.professor,
    professorNome: obj.professorNome,
    componenteCurricular: obj.componenteCurricular || '',
    categoria: obj.categoria,
    prioridade: obj.prioridade,
    texto: obj.texto,
    marcadores: obj.marcadores || [],
    origemRegistro: obj.origemRegistro || 'digitacao',
    modoRegistro: obj.modoRegistro || (obj.loteId ? 'lote' : 'individual'),
    loteId: obj.loteId || '',
    loteTotal: Number(obj.loteTotal || 1),
    loteIndice: Number(obj.loteIndice || 1),
    status: obj.status,
    lidaPeloUsuario,
    totalLeituras: lidaPor.length,
    atendimento: obj.atendimento || {},
    resolucao: obj.resolucao || {},
    editavelAte: obj.editavelAte || null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

async function auditoriaSegura(payload) {
  try {
    await logAction(payload);
  } catch (erro) {
    console.warn('[observacoes-professores][audit]', erro?.message || erro);
  }
}

async function buscarAlunoDoTenant(req, alunoId) {
  if (!mongoose.isValidObjectId(alunoId)) return null;
  return Aluno.findOne(tenantFilter(req, { _id: alunoId }))
    .select('_id nome turma instituicao tenantId')
    .lean();
}

function normalizarIdsAlunos(valor) {
  if (!Array.isArray(valor)) return [];
  const ids = valor
    .map((item) => String(item || '').trim())
    .filter((item) => mongoose.isValidObjectId(item));
  return [...new Set(ids)].slice(0, MAX_ALUNOS_LOTE + 1);
}

async function buscarAlunosDoTenant(req, alunoIds) {
  const ids = normalizarIdsAlunos(alunoIds);
  if (!ids.length) return [];

  const encontrados = await Aluno.find(
    tenantFilter(req, { _id: { $in: ids }, ativo: { $ne: false } })
  )
    .select('_id nome turma instituicao tenantId')
    .lean();

  const porId = new Map(encontrados.map((aluno) => [String(aluno._id), aluno]));
  return ids.map((id) => porId.get(id)).filter(Boolean);
}

function dadosComunsDaObservacao(req, body = {}) {
  const texto = textoLimpo(body.texto);
  const categoria = CATEGORIAS.has(body.categoria) ? body.categoria : 'comportamento';
  const prioridade = PRIORIDADES.has(body.prioridade) ? body.prioridade : 'normal';
  const origemRegistro = ['digitacao', 'voz', 'misto'].includes(body.origemRegistro)
    ? body.origemRegistro
    : 'digitacao';

  return {
    texto,
    categoria,
    prioridade,
    origemRegistro,
    componenteCurricular: textoLimpo(body.componenteCurricular, 120),
    marcadores: marcadoresValidos(body.marcadores),
    professor: usuarioId(req),
    professorNome: usuarioNome(req),
    instituicao: req.instituicaoId,
    tenantId: req.instituicaoId,
  };
}

function observacaoAindaEditavel(observacao) {
  const foiLida = Array.isArray(observacao?.lidaPor) && observacao.lidaPor.length > 0;
  const prazoExpirou = observacao?.editavelAte && new Date(observacao.editavelAte) < new Date();
  return !foiLida && !prazoExpirou && observacao?.status === 'nova';
}

function loteIdValido(valor) {
  return /^[a-f0-9]{24}$/i.test(String(valor || '').trim());
}

function dadosExclusaoPermanente(req) {
  const confirmacao = String(req.body?.confirmacao || '').trim().toUpperCase();
  const motivo = textoLimpo(req.body?.motivo, 500);

  if (confirmacao !== 'EXCLUIR') {
    return { erro: 'Digite EXCLUIR para confirmar a exclusão permanente.' };
  }
  if (motivo.length < 5) {
    return { erro: 'Informe o motivo da exclusão com pelo menos 5 caracteres.' };
  }

  return { motivo };
}

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
    const permitidos = new Set([
      'audio/webm',
      'audio/ogg',
      'audio/wav',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/aac',
      'audio/flac',
      'video/webm',
      'video/mp4',
    ]);

    if (!permitidos.has(mime)) {
      return cb(new Error('Formato de áudio não permitido.'));
    }

    return cb(null, true);
  },
});

function extensaoAudio(mime = '') {
  const mimeBase = String(mime || '').toLowerCase().split(';')[0].trim();
  const mapa = {
    'audio/webm': '.webm',
    'video/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/mp4': '.mp4',
    'video/mp4': '.mp4',
    'audio/m4a': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/aac': '.aac',
    'audio/flac': '.flac',
  };
  return mapa[mimeBase] || '.webm';
}

function categoriaTranscricao(valor) {
  const categoria = String(valor || '').trim().toLowerCase();
  return CATEGORIAS.has(categoria) ? categoria : 'comportamento';
}

function palavrasChaveTranscricao(categoria) {
  const porCategoria = {
    comportamento: [
      'bullying',
      'conversa excessiva',
      'uso inadequado do celular',
      'desrespeito',
      'interrupção',
    ],
    participacao_pedagogica: [
      'participação',
      'atividade',
      'não realizou a atividade',
      'não copiou',
      'não respondeu',
    ],
    convivencia: [
      'bullying',
      'cyberbullying',
      'intimidação',
      'apelido pejorativo',
      'provocação',
      'constrangimento',
      'agressão verbal',
    ],
    seguranca: [
      'ameaça',
      'agressão física',
      'arremessou objeto',
      'arremessou papel',
      'risco',
    ],
    atividade: [
      'atividade',
      'não realizou a atividade',
      'não iniciou a atividade',
      'não entregou',
    ],
    elogio: [
      'participação positiva',
      'ajudou um colega',
      'demonstrou evolução',
      'colaboração',
    ],
    outro: [
      'bullying',
      'coordenação',
      'sala de aula',
    ],
  };

  return [...new Set(porCategoria[categoria] || porCategoria.comportamento)]
    .filter(Boolean)
    .slice(0, 10);
}

function montarPromptTranscricao(categoria) {
  const rotulo = {
    comportamento: 'comportamento',
    participacao_pedagogica: 'participação pedagógica',
    convivencia: 'convivência escolar',
    seguranca: 'segurança',
    atividade: 'realização de atividade',
    elogio: 'atitude positiva',
    outro: 'registro escolar',
  }[categoria] || 'registro escolar';

  return [
    `Ditado curto, em português brasileiro, feito por um professor para um registro de ${rotulo}.`,
    'Transcreva as palavras efetivamente faladas, sem resumir, interpretar, suavizar ou substituir por sinônimos.',
    'Preserve a expressão exata usada pelo professor.',
    'Quando a palavra bullying for pronunciada como "bulin", escreva bullying.',
    'Use somente pontuação básica para tornar o ditado legível.',
  ].join(' ');
}

function normalizarTranscricaoEscolar(valor) {
  return textoLimpo(valor, 2500)
    .replace(/\bcyber[\s-]*(?:bulin|bulim|bulling|buling|bullyng|bullying)\b/gi, 'cyberbullying')
    .replace(/\b(?:bulin|bulim|bulling|buling|bullyng)\b/gi, 'bullying');
}

function deveUsarFallbackTranscricao(erro) {
  const status = Number(erro?.status || erro?.statusCode || 0);
  const mensagem = String(erro?.message || erro?.error?.message || '').toLowerCase();

  return [400, 404, 422].includes(status) && (
    mensagem.includes('model') ||
    mensagem.includes('keyword') ||
    mensagem.includes('language') ||
    mensagem.includes('unsupported') ||
    mensagem.includes('not found') ||
    mensagem.includes('invalid')
  );
}

async function transcreverArquivo({ client, arquivoTemporario, modelo, categoria, palavrasChave }) {
  const base = {
    file: fs.createReadStream(arquivoTemporario),
    model: modelo,
    prompt: montarPromptTranscricao(categoria),
    response_format: 'json',
    temperature: 0,
  };

  if (modelo === 'gpt-transcribe') {
    return client.audio.transcriptions.create({
      ...base,
      keywords: palavrasChave,
      languages: ['pt'],
    });
  }

  return client.audio.transcriptions.create({
    ...base,
    language: 'pt',
  });
}

router.get('/alunos', autenticar, requireTenant, apenasProfessor, async (req, res) => {
  try {
    const filtro = tenantFilter(req, { ativo: { $ne: false } });
    const turmasProfessor = Array.isArray(req.usuario?.turmas)
      ? req.usuario.turmas.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    if (turmasProfessor.length) {
      const expressoes = turmasProfessor.map((turma) => new RegExp(`^${turma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
      filtro.turma = { $in: expressoes };
    }

    const alunos = await Aluno.find(filtro)
      .select('_id nome turma')
      .sort({ turma: 1, nome: 1 })
      .lean();

    return res.json({
      total: alunos.length,
      turmasVinculadas: turmasProfessor,
      alunos,
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao listar alunos:', erro);
    return res.status(500).json({ mensagem: 'Erro ao carregar os alunos do professor.' });
  }
});

router.get('/minhas', autenticar, requireTenant, apenasProfessor, async (req, res) => {
  try {
    const limite = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const professor = usuarioId(req);

    const observacoes = await ObservacaoProfessor.find(
      tenantFilter(req, { professor })
    )
      .sort({ createdAt: -1 })
      .limit(limite)
      .lean();

    return res.json({
      total: observacoes.length,
      observacoes: observacoes.map((item) => mapearObservacao(item)),
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao listar observações do professor:', erro);
    return res.status(500).json({ mensagem: 'Erro ao carregar suas observações.' });
  }
});

router.post(
  '/transcrever',
  autenticar,
  requireTenant,
  apenasProfessor,
  audioUpload.single('audio'),
  async (req, res) => {
    let arquivoTemporario = null;

    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ mensagem: 'Nenhum áudio foi recebido.' });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          mensagem: 'A transcrição por voz ainda não está configurada no servidor.',
          codigo: 'TRANSCRICAO_NAO_CONFIGURADA',
        });
      }

      const extensao = extensaoAudio(req.file.mimetype);
      arquivoTemporario = path.join(
        os.tmpdir(),
        `axoriin_obs_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${extensao}`
      );

      await fsp.writeFile(arquivoTemporario, req.file.buffer);

      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: Number(process.env.OPENAI_TRANSCRIPTION_TIMEOUT_MS) || 60000,
        maxRetries: Number(process.env.OPENAI_TRANSCRIPTION_MAX_RETRIES) || 2,
      });
      const categoria = categoriaTranscricao(req.body?.categoria);
      const palavrasChave = palavrasChaveTranscricao(categoria);
      const modeloPreferido =
        process.env.OPENAI_OBSERVACOES_TRANSCRIPTION_MODEL ||
        'gpt-transcribe';

      let model = modeloPreferido;
      let resposta;

      try {
        resposta = await transcreverArquivo({
          client,
          arquivoTemporario,
          modelo: model,
          categoria,
          palavrasChave,
        });
      } catch (erroPrimario) {
        if (model === 'gpt-transcribe' && deveUsarFallbackTranscricao(erroPrimario)) {
          console.warn(
            '[observacoes-professores] gpt-transcribe indisponível; usando fallback gpt-4o-transcribe.'
          );
          model = 'gpt-4o-transcribe';
          resposta = await transcreverArquivo({
            client,
            arquivoTemporario,
            modelo: model,
            categoria,
            palavrasChave: [],
          });
        } else {
          throw erroPrimario;
        }
      }

      const texto = normalizarTranscricaoEscolar(resposta?.text);
      if (!texto) {
        return res.status(422).json({ mensagem: 'Não foi possível identificar fala no áudio.' });
      }

      await auditoriaSegura({
        req,
        event: 'OBSERVACAO_PROFESSOR_AUDIO_TRANSCRITO',
        targetType: 'ObservacaoProfessor',
        meta: {
          modelo: model,
          mime: req.file.mimetype,
          tamanhoBytes: req.file.size,
          tamanhoTexto: texto.length,
          categoria,
          quantidadePalavrasChave: palavrasChave.length,
        },
      });

      return res.json({
        texto,
        modelo: model,
        idiomas: Array.isArray(resposta?.languages) ? resposta.languages : [],
      });
    } catch (erro) {
      console.error('[observacoes-professores] erro de transcrição:', erro);
      const status = Number(erro?.status || erro?.statusCode || 0);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        mensagem: 'Não foi possível transcrever o áudio. Digite a observação ou tente novamente.',
      });
    } finally {
      if (arquivoTemporario) {
        await fsp.unlink(arquivoTemporario).catch(() => {});
      }
    }
  }
);

router.post('/', autenticar, requireTenant, apenasProfessor, attachActor, async (req, res) => {
  try {
    const alunoId = String(req.body?.alunoId || '').trim();
    const dados = dadosComunsDaObservacao(req, req.body || {});
    const { texto, categoria, prioridade, origemRegistro } = dados;

    if (texto.length < 3) {
      return res.status(400).json({ mensagem: 'Descreva a observação com pelo menos 3 caracteres.' });
    }

    const aluno = await buscarAlunoDoTenant(req, alunoId);
    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado nesta instituição.' });
    }

    if (!professorPodeAcessarTurma(req, aluno.turma)) {
      return res.status(403).json({ mensagem: 'Você não possui acesso à turma deste aluno.' });
    }

    const instituicao = req.instituicaoId;
    const nova = await ObservacaoProfessor.create({
      aluno: aluno._id,
      alunoNome: aluno.nome,
      turma: aluno.turma || 'Turma não informada',
      professor: dados.professor,
      professorNome: dados.professorNome,
      componenteCurricular: dados.componenteCurricular,
      categoria,
      prioridade,
      texto,
      marcadores: dados.marcadores,
      origemRegistro,
      modoRegistro: 'individual',
      loteTotal: 1,
      loteIndice: 1,
      status: 'nova',
      instituicao,
      tenantId: instituicao,
    });

    await auditoriaSegura({
      req,
      event: 'OBSERVACAO_PROFESSOR_CRIADA',
      targetType: 'Aluno',
      targetId: aluno._id,
      entidadeNome: aluno.nome,
      alunoNome: aluno.nome,
      meta: {
        observacaoProfessorId: nova._id,
        turma: aluno.turma,
        categoria,
        prioridade,
        origemRegistro,
        tamanhoTexto: texto.length,
      },
    });

    return res.status(201).json({
      mensagem: 'Observação enviada à coordenação.',
      observacao: mapearObservacao(nova),
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao criar observação:', erro);
    return res.status(500).json({ mensagem: 'Erro ao enviar a observação.' });
  }
});


router.post('/lote', autenticar, requireTenant, apenasProfessor, attachActor, async (req, res) => {
  try {
    const alunoIds = normalizarIdsAlunos(req.body?.alunoIds);
    const dados = dadosComunsDaObservacao(req, req.body || {});

    if (alunoIds.length < 2) {
      return res.status(400).json({ mensagem: 'Selecione pelo menos dois alunos para o registro em lote.' });
    }
    if (alunoIds.length > MAX_ALUNOS_LOTE) {
      return res.status(400).json({ mensagem: `O limite é de ${MAX_ALUNOS_LOTE} alunos por envio.` });
    }
    if (dados.texto.length < 3) {
      return res.status(400).json({ mensagem: 'Descreva a observação com pelo menos 3 caracteres.' });
    }

    const alunos = await buscarAlunosDoTenant(req, alunoIds);
    if (alunos.length !== alunoIds.length) {
      return res.status(404).json({ mensagem: 'Um ou mais alunos não foram encontrados nesta instituição.' });
    }

    const turmas = [...new Set(alunos.map((aluno) => normalizarTurma(aluno.turma)))];
    if (turmas.length !== 1) {
      return res.status(400).json({ mensagem: 'O registro em lote deve conter alunos de uma única turma.' });
    }

    const semAcesso = alunos.find((aluno) => !professorPodeAcessarTurma(req, aluno.turma));
    if (semAcesso) {
      return res.status(403).json({ mensagem: `Você não possui acesso à turma de ${semAcesso.nome}.` });
    }

    const loteId = crypto.randomBytes(12).toString('hex');
    const total = alunos.length;
    const agora = new Date();
    const editavelAte = new Date(agora.getTime() + 10 * 60 * 1000);

    const documentos = alunos.map((aluno, indice) => ({
      aluno: aluno._id,
      alunoNome: aluno.nome,
      turma: aluno.turma || 'Turma não informada',
      professor: dados.professor,
      professorNome: dados.professorNome,
      componenteCurricular: dados.componenteCurricular,
      categoria: dados.categoria,
      prioridade: dados.prioridade,
      texto: dados.texto,
      marcadores: dados.marcadores,
      origemRegistro: dados.origemRegistro,
      modoRegistro: 'lote',
      loteId,
      loteTotal: total,
      loteIndice: indice + 1,
      status: 'nova',
      editavelAte,
      instituicao: dados.instituicao,
      tenantId: dados.tenantId,
      historico: [{
        acao: 'criada',
        usuario: dados.professor,
        nome: dados.professorNome,
        em: agora,
        detalhe: `Registro em lote para ${total} alunos da turma ${aluno.turma || ''}.`,
      }],
    }));

    const criadas = await ObservacaoProfessor.create(documentos);

    await auditoriaSegura({
      req,
      event: 'OBSERVACOES_PROFESSOR_LOTE_CRIADO',
      targetType: 'ObservacaoProfessor',
      targetId: criadas[0]?._id || null,
      entidadeNome: `${total} alunos`,
      meta: {
        loteId,
        total,
        turma: alunos[0]?.turma || '',
        categoria: dados.categoria,
        prioridade: dados.prioridade,
        origemRegistro: dados.origemRegistro,
        alunos: alunos.map((aluno) => ({ id: aluno._id, nome: aluno.nome })),
      },
    });

    return res.status(201).json({
      mensagem: `Observação enviada para ${total} alunos e para a coordenação.`,
      loteId,
      total,
      observacoes: criadas.map((item) => mapearObservacao(item)),
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao criar lote:', erro);
    return res.status(500).json({ mensagem: 'Erro ao enviar as observações em lote.' });
  }
});

router.patch('/lote/:loteId', autenticar, requireTenant, apenasProfessor, attachActor, async (req, res) => {
  try {
    const loteId = String(req.params.loteId || '').trim();
    if (!loteIdValido(loteId)) {
      return res.status(400).json({ mensagem: 'Identificador do lote inválido.' });
    }

    const observacoes = await ObservacaoProfessor.find(
      tenantFilter(req, { loteId, professor: usuarioId(req) })
    );
    if (!observacoes.length) {
      return res.status(404).json({ mensagem: 'Lote de observações não encontrado.' });
    }
    if (observacoes.some((item) => !observacaoAindaEditavel(item))) {
      return res.status(409).json({
        mensagem: 'O lote não pode mais ser editado porque ao menos um registro já foi aberto ou o prazo terminou.',
      });
    }

    const dados = dadosComunsDaObservacao(req, req.body || {});
    if (dados.texto.length < 3) {
      return res.status(400).json({ mensagem: 'O texto precisa ter pelo menos 3 caracteres.' });
    }

    const agora = new Date();
    observacoes.forEach((observacao) => {
      observacao.texto = dados.texto;
      observacao.categoria = dados.categoria;
      observacao.prioridade = dados.prioridade;
      observacao.componenteCurricular = dados.componenteCurricular;
      observacao.marcadores = dados.marcadores;
      observacao.historico.push({
        acao: 'editada',
        usuario: usuarioId(req),
        nome: usuarioNome(req),
        em: agora,
        detalhe: 'Lote editado pelo professor antes da leitura da coordenação.',
      });
    });
    await Promise.all(observacoes.map((item) => item.save()));

    await auditoriaSegura({
      req,
      event: 'OBSERVACOES_PROFESSOR_LOTE_EDITADO',
      targetType: 'ObservacaoProfessor',
      targetId: observacoes[0]._id,
      entidadeNome: `${observacoes.length} alunos`,
      meta: { loteId, total: observacoes.length },
    });

    return res.json({
      mensagem: `Lote com ${observacoes.length} observações atualizado.`,
      loteId,
      observacoes: observacoes.map((item) => mapearObservacao(item)),
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao editar lote:', erro);
    return res.status(500).json({ mensagem: 'Erro ao editar o lote de observações.' });
  }
});

router.delete('/lote/:loteId', autenticar, requireTenant, apenasProfessor, attachActor, async (req, res) => {
  try {
    const loteId = String(req.params.loteId || '').trim();
    if (!loteIdValido(loteId)) {
      return res.status(400).json({ mensagem: 'Identificador do lote inválido.' });
    }

    const observacoes = await ObservacaoProfessor.find(
      tenantFilter(req, { loteId, professor: usuarioId(req) })
    );
    if (!observacoes.length) {
      return res.status(404).json({ mensagem: 'Lote de observações não encontrado.' });
    }
    if (observacoes.some((item) => !observacaoAindaEditavel(item))) {
      return res.status(409).json({
        mensagem: 'O lote não pode ser retirado porque ao menos um registro já foi aberto ou o prazo terminou.',
      });
    }

    const agora = new Date();
    observacoes.forEach((observacao) => {
      observacao.status = 'arquivada';
      observacao.historico.push({
        acao: 'arquivada',
        usuario: usuarioId(req),
        nome: usuarioNome(req),
        em: agora,
        detalhe: 'Lote arquivado pelo professor antes da leitura da coordenação.',
      });
    });
    await Promise.all(observacoes.map((item) => item.save()));

    await auditoriaSegura({
      req,
      event: 'OBSERVACOES_PROFESSOR_LOTE_ARQUIVADO',
      targetType: 'ObservacaoProfessor',
      targetId: observacoes[0]._id,
      entidadeNome: `${observacoes.length} alunos`,
      meta: { loteId, total: observacoes.length },
    });

    return res.json({ mensagem: `Lote com ${observacoes.length} observações retirado da fila.` });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao arquivar lote:', erro);
    return res.status(500).json({ mensagem: 'Erro ao retirar o lote de observações.' });
  }
});

router.get('/aluno/:alunoId', autenticar, requireTenant, async (req, res) => {
  try {
    if (!ehProfessor(req) && !ehGestao(req)) {
      return res.status(403).json({ mensagem: 'Perfil sem permissão para consultar estas observações.' });
    }

    const aluno = await buscarAlunoDoTenant(req, req.params.alunoId);
    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado nesta instituição.' });
    }

    const filtro = tenantFilter(req, { aluno: aluno._id });
    if (ehProfessor(req)) {
      if (!professorPodeAcessarTurma(req, aluno.turma)) {
        return res.status(403).json({ mensagem: 'Você não possui acesso à turma deste aluno.' });
      }
      filtro.professor = usuarioId(req);
    }

    const observacoes = await ObservacaoProfessor.find(filtro)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      aluno: { _id: aluno._id, nome: aluno.nome, turma: aluno.turma },
      total: observacoes.length,
      escopo: ehProfessor(req) ? 'proprias' : 'instituicao',
      observacoes: observacoes.map((item) => mapearObservacao(item, usuarioId(req))),
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao consultar ficha:', erro);
    return res.status(500).json({ mensagem: 'Erro ao carregar as observações dos professores.' });
  }
});

router.patch('/:id', autenticar, requireTenant, apenasProfessor, attachActor, async (req, res) => {
  try {
    const observacao = await ObservacaoProfessor.findOne(
      tenantFilter(req, { _id: req.params.id, professor: usuarioId(req) })
    );

    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada.' });
    }

    const foiLida = Array.isArray(observacao.lidaPor) && observacao.lidaPor.length > 0;
    const prazoExpirou = observacao.editavelAte && new Date(observacao.editavelAte) < new Date();

    if (foiLida || prazoExpirou || observacao.status !== 'nova') {
      return res.status(409).json({
        mensagem: 'A observação não pode mais ser editada porque já foi aberta pela coordenação ou o prazo terminou.',
      });
    }

    const novoTexto = textoLimpo(req.body?.texto);
    if (novoTexto.length < 3) {
      return res.status(400).json({ mensagem: 'O texto precisa ter pelo menos 3 caracteres.' });
    }

    observacao.texto = novoTexto;
    if (CATEGORIAS.has(req.body?.categoria)) observacao.categoria = req.body.categoria;
    if (PRIORIDADES.has(req.body?.prioridade)) observacao.prioridade = req.body.prioridade;
    observacao.componenteCurricular = textoLimpo(req.body?.componenteCurricular, 120);
    observacao.marcadores = marcadoresValidos(req.body?.marcadores);
    observacao.historico.push({
      acao: 'editada',
      usuario: usuarioId(req),
      nome: usuarioNome(req),
      em: new Date(),
    });

    await observacao.save();

    await auditoriaSegura({
      req,
      event: 'OBSERVACAO_PROFESSOR_EDITADA',
      targetType: 'ObservacaoProfessor',
      targetId: observacao._id,
      entidadeNome: observacao.alunoNome,
    });

    return res.json({
      mensagem: 'Observação atualizada.',
      observacao: mapearObservacao(observacao),
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao editar:', erro);
    return res.status(500).json({ mensagem: 'Erro ao editar a observação.' });
  }
});

router.delete('/:id', autenticar, requireTenant, apenasProfessor, attachActor, async (req, res) => {
  try {
    const observacao = await ObservacaoProfessor.findOne(
      tenantFilter(req, { _id: req.params.id, professor: usuarioId(req) })
    );

    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada.' });
    }

    const foiLida = Array.isArray(observacao.lidaPor) && observacao.lidaPor.length > 0;
    const prazoExpirou = observacao.editavelAte && new Date(observacao.editavelAte) < new Date();

    if (foiLida || prazoExpirou || observacao.status !== 'nova') {
      return res.status(409).json({
        mensagem: 'A observação não pode ser retirada porque já foi aberta pela coordenação ou o prazo terminou.',
      });
    }

    observacao.status = 'arquivada';
    observacao.historico.push({
      acao: 'arquivada',
      usuario: usuarioId(req),
      nome: usuarioNome(req),
      em: new Date(),
      detalhe: 'Arquivada pelo professor antes da leitura da coordenação.',
    });
    await observacao.save();

    await auditoriaSegura({
      req,
      event: 'OBSERVACAO_PROFESSOR_ARQUIVADA_PELO_AUTOR',
      targetType: 'ObservacaoProfessor',
      targetId: observacao._id,
      entidadeNome: observacao.alunoNome,
    });

    return res.json({ mensagem: 'Observação retirada da fila da coordenação.' });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao arquivar:', erro);
    return res.status(500).json({ mensagem: 'Erro ao retirar a observação.' });
  }
});

router.get('/admin/feed', autenticar, requireTenant, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const adminId = usuarioId(req);
    const limite = Math.min(Math.max(Number(req.query.limit) || 20, 5), 100);
    const incluirConcluidas = String(req.query.incluirConcluidas || '') === '1';

    const filtroAtivo = tenantFilter(req, {
      status: { $in: ['nova', 'lida', 'em_atendimento'] },
    });
    const filtroLista = incluirConcluidas ? tenantFilter(req, {}) : filtroAtivo;

    const [itens, totalNaoLidas, totalAtivas, totalRegistros] = await Promise.all([
      ObservacaoProfessor.find(filtroLista)
        .sort({ createdAt: -1 })
        .limit(Math.max(limite * 3, 100))
        .lean(),
      ObservacaoProfessor.countDocuments(
        tenantFilter(req, {
          status: { $in: ['nova', 'lida', 'em_atendimento'] },
          lidaPor: { $not: { $elemMatch: { usuario: adminId } } },
        })
      ),
      ObservacaoProfessor.countDocuments(filtroAtivo),
      ObservacaoProfessor.countDocuments(tenantFilter(req, {})),
    ]);

    const ordenados = itens
      .map((item) => mapearObservacao(item, adminId))
      .sort((a, b) => {
        if (a.lidaPeloUsuario !== b.lidaPeloUsuario) return a.lidaPeloUsuario ? 1 : -1;
        const prioridade = prioridadePeso(b.prioridade) - prioridadePeso(a.prioridade);
        if (prioridade) return prioridade;
        return new Date(b.createdAt) - new Date(a.createdAt);
      })
      .slice(0, limite);

    return res.json({
      totalNaoLidas,
      totalAtivas,
      totalRegistros,
      incluindoConcluidas: incluirConcluidas,
      observacoes: ordenados,
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro no feed admin:', erro);
    return res.status(500).json({ mensagem: 'Erro ao carregar as notificações dos professores.' });
  }
});


router.get('/admin/lote/:loteId', autenticar, requireTenant, apenasMonitorOuAdmin, attachActor, async (req, res) => {
  try {
    const loteId = String(req.params.loteId || '').trim();
    if (!loteIdValido(loteId)) {
      return res.status(400).json({ mensagem: 'Identificador do lote inválido.' });
    }

    const observacoes = await ObservacaoProfessor.find(
      tenantFilter(req, { loteId })
    ).sort({ loteIndice: 1, alunoNome: 1 });

    if (!observacoes.length) {
      return res.status(404).json({ mensagem: 'Lote de observações não encontrado.' });
    }

    const adminId = usuarioId(req);
    const agora = new Date();
    let alteradas = 0;

    observacoes.forEach((observacao) => {
      const jaLeu = observacao.lidaPor.some(
        (item) => String(item.usuario || '') === String(adminId)
      );
      if (jaLeu) return;

      observacao.lidaPor.push({ usuario: adminId, nome: usuarioNome(req), lidaEm: agora });
      observacao.historico.push({
        acao: 'lida',
        usuario: adminId,
        nome: usuarioNome(req),
        em: agora,
        detalhe: 'Lote aberto no painel administrativo.',
      });
      if (observacao.status === 'nova') observacao.status = 'lida';
      alteradas += 1;
    });

    if (alteradas) {
      await Promise.all(observacoes.filter((item) => item.isModified()).map((item) => item.save()));
      await auditoriaSegura({
        req,
        event: 'OBSERVACOES_PROFESSOR_LOTE_LIDO',
        targetType: 'ObservacaoProfessor',
        targetId: observacoes[0]._id,
        entidadeNome: `${observacoes.length} alunos`,
        meta: { loteId, total: observacoes.length, leiturasRegistradas: alteradas },
      });
    }

    return res.json({
      lote: {
        loteId,
        total: observacoes.length,
        turma: observacoes[0].turma,
        professorNome: observacoes[0].professorNome,
        componenteCurricular: observacoes[0].componenteCurricular || '',
        categoria: observacoes[0].categoria,
        prioridade: observacoes[0].prioridade,
        texto: observacoes[0].texto,
        createdAt: observacoes[0].createdAt,
      },
      observacoes: observacoes.map((item) => mapearObservacao(item, adminId)),
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao abrir lote no admin:', erro);
    return res.status(500).json({ mensagem: 'Erro ao abrir o lote de observações.' });
  }
});

router.get('/admin/:id', autenticar, requireTenant, apenasMonitorOuAdmin, attachActor, async (req, res) => {
  try {
    const observacao = await ObservacaoProfessor.findOne(
      tenantFilter(req, { _id: req.params.id })
    );

    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada.' });
    }

    const adminId = usuarioId(req);
    const jaLeu = observacao.lidaPor.some(
      (item) => String(item.usuario || '') === String(adminId)
    );

    if (!jaLeu) {
      observacao.lidaPor.push({
        usuario: adminId,
        nome: usuarioNome(req),
        lidaEm: new Date(),
      });
      observacao.historico.push({
        acao: 'lida',
        usuario: adminId,
        nome: usuarioNome(req),
        em: new Date(),
      });
      if (observacao.status === 'nova') observacao.status = 'lida';
      await observacao.save();

      await auditoriaSegura({
        req,
        event: 'OBSERVACAO_PROFESSOR_LIDA',
        targetType: 'ObservacaoProfessor',
        targetId: observacao._id,
        entidadeNome: observacao.alunoNome,
        alunoNome: observacao.alunoNome,
      });
    }

    return res.json({ observacao: mapearObservacao(observacao, adminId) });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao abrir observação:', erro);
    return res.status(500).json({ mensagem: 'Erro ao abrir a observação.' });
  }
});

router.delete('/admin/lote/:loteId/permanente', autenticar, requireTenant, apenasAdmin, attachActor, async (req, res) => {
  try {
    const loteId = String(req.params.loteId || '').trim();
    if (!loteIdValido(loteId)) {
      return res.status(400).json({ mensagem: 'Identificador do lote inválido.' });
    }

    const confirmacao = dadosExclusaoPermanente(req);
    if (confirmacao.erro) {
      return res.status(400).json({ mensagem: confirmacao.erro });
    }

    const observacoes = await ObservacaoProfessor.find(
      tenantFilter(req, { loteId })
    ).lean();

    if (!observacoes.length) {
      return res.status(404).json({ mensagem: 'Lote de observações não encontrado.' });
    }

    await auditoriaSegura({
      req,
      event: 'OBSERVACOES_PROFESSOR_LOTE_EXCLUIDO_PERMANENTEMENTE',
      targetType: 'ObservacaoProfessor',
      targetId: observacoes[0]._id,
      entidadeNome: `${observacoes.length} alunos`,
      meta: {
        loteId,
        total: observacoes.length,
        motivo: confirmacao.motivo,
        professorNome: observacoes[0].professorNome,
        turma: observacoes[0].turma,
        alunos: observacoes.map((item) => ({ id: item.aluno, nome: item.alunoNome })),
      },
    });

    const resultado = await ObservacaoProfessor.deleteMany(
      tenantFilter(req, { loteId })
    );

    return res.json({
      mensagem: `Lote excluído permanentemente (${resultado.deletedCount || observacoes.length} registros).`,
      excluidos: resultado.deletedCount || observacoes.length,
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao excluir lote permanentemente:', erro);
    return res.status(500).json({ mensagem: 'Erro ao excluir permanentemente o lote.' });
  }
});

router.delete('/admin/:id/permanente', autenticar, requireTenant, apenasAdmin, attachActor, async (req, res) => {
  try {
    const confirmacao = dadosExclusaoPermanente(req);
    if (confirmacao.erro) {
      return res.status(400).json({ mensagem: confirmacao.erro });
    }

    const observacao = await ObservacaoProfessor.findOne(
      tenantFilter(req, { _id: req.params.id })
    );

    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada.' });
    }

    await auditoriaSegura({
      req,
      event: 'OBSERVACAO_PROFESSOR_EXCLUIDA_PERMANENTEMENTE',
      targetType: 'ObservacaoProfessor',
      targetId: observacao._id,
      entidadeNome: observacao.alunoNome,
      alunoNome: observacao.alunoNome,
      meta: {
        motivo: confirmacao.motivo,
        professorNome: observacao.professorNome,
        turma: observacao.turma,
        status: observacao.status,
        loteId: observacao.loteId || '',
        texto: observacao.texto,
      },
    });

    await ObservacaoProfessor.deleteOne(
      tenantFilter(req, { _id: observacao._id })
    );

    return res.json({ mensagem: 'Observação excluída permanentemente.' });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao excluir permanentemente:', erro);
    return res.status(500).json({ mensagem: 'Erro ao excluir permanentemente a observação.' });
  }
});

router.patch('/admin/:id/assumir', autenticar, requireTenant, apenasMonitorOuAdmin, attachActor, async (req, res) => {
  try {
    const observacao = await ObservacaoProfessor.findOne(
      tenantFilter(req, { _id: req.params.id })
    );

    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada.' });
    }

    if (['resolvida', 'arquivada'].includes(observacao.status)) {
      return res.status(409).json({ mensagem: 'Esta observação já foi concluída.' });
    }

    const adminId = usuarioId(req);
    const responsavelAtual = String(observacao.atendimento?.usuario || '');

    if (responsavelAtual && responsavelAtual !== adminId) {
      return res.status(409).json({
        mensagem: `Atendimento já assumido por ${observacao.atendimento?.nome || 'outro responsavel'}.`,
      });
    }

    observacao.atendimento = {
      usuario: adminId,
      nome: usuarioNome(req),
      assumidoEm: observacao.atendimento?.assumidoEm || new Date(),
    };
    observacao.status = 'em_atendimento';
    observacao.historico.push({
      acao: 'atendimento_assumido',
      usuario: adminId,
      nome: usuarioNome(req),
      em: new Date(),
    });
    await observacao.save();

    await auditoriaSegura({
      req,
      event: 'OBSERVACAO_PROFESSOR_ATENDIMENTO_ASSUMIDO',
      targetType: 'ObservacaoProfessor',
      targetId: observacao._id,
      entidadeNome: observacao.alunoNome,
      alunoNome: observacao.alunoNome,
    });

    return res.json({
      mensagem: 'Atendimento assumido.',
      observacao: mapearObservacao(observacao, adminId),
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao assumir:', erro);
    return res.status(500).json({ mensagem: 'Erro ao assumir o atendimento.' });
  }
});

router.patch('/admin/:id/liberar', autenticar, requireTenant, apenasMonitorOuAdmin, attachActor, async (req, res) => {
  try {
    const observacao = await ObservacaoProfessor.findOne(
      tenantFilter(req, { _id: req.params.id })
    );

    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada.' });
    }

    const adminId = usuarioId(req);
    const responsavelAtual = String(observacao.atendimento?.usuario || '');
    if (responsavelAtual && responsavelAtual !== adminId) {
      return res.status(403).json({ mensagem: 'Somente quem assumiu pode liberar este atendimento.' });
    }

    observacao.atendimento = { usuario: null, nome: '', assumidoEm: null };
    observacao.status = 'lida';
    observacao.historico.push({
      acao: 'atendimento_liberado',
      usuario: adminId,
      nome: usuarioNome(req),
      em: new Date(),
    });
    await observacao.save();

    await auditoriaSegura({
      req,
      event: 'OBSERVACAO_PROFESSOR_ATENDIMENTO_LIBERADO',
      targetType: 'ObservacaoProfessor',
      targetId: observacao._id,
      entidadeNome: observacao.alunoNome,
      alunoNome: observacao.alunoNome,
    });

    return res.json({
      mensagem: 'Atendimento liberado.',
      observacao: mapearObservacao(observacao, adminId),
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao liberar:', erro);
    return res.status(500).json({ mensagem: 'Erro ao liberar o atendimento.' });
  }
});

router.patch('/admin/:id/status', autenticar, requireTenant, apenasMonitorOuAdmin, attachActor, async (req, res) => {
  try {
    const novoStatus = String(req.body?.status || '').trim();
    const nota = textoLimpo(req.body?.nota, 1500);

    if (!STATUS_ADMIN.has(novoStatus)) {
      return res.status(400).json({ mensagem: 'Situação inválida.' });
    }

    const observacao = await ObservacaoProfessor.findOne(
      tenantFilter(req, { _id: req.params.id })
    );

    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada.' });
    }

    const adminId = usuarioId(req);
    const statusAnterior = observacao.status;
    const responsavelAtual = String(observacao.atendimento?.usuario || '');

    if (responsavelAtual && responsavelAtual !== adminId && novoStatus !== 'lida') {
      return res.status(409).json({
        mensagem: `O acompanhamento está sob responsabilidade de ${observacao.atendimento?.nome || 'outro responsavel'}.`,
      });
    }

    observacao.status = novoStatus;

    if (['em_atendimento', 'resolvida'].includes(novoStatus) && !observacao.atendimento?.usuario) {
      observacao.atendimento = {
        usuario: adminId,
        nome: usuarioNome(req),
        assumidoEm: new Date(),
      };
    }

    if (novoStatus === 'resolvida') {
      observacao.resolucao = {
        usuario: adminId,
        nome: usuarioNome(req),
        resolvidaEm: new Date(),
        nota,
      };
      observacao.historico.push({
        acao: 'resolvida',
        usuario: adminId,
        nome: usuarioNome(req),
        em: new Date(),
        detalhe: nota,
      });
    } else {
      observacao.historico.push({
        acao: novoStatus === 'arquivada' ? 'arquivada' : 'status_alterado',
        usuario: adminId,
        nome: usuarioNome(req),
        em: new Date(),
        detalhe: `${statusAnterior} → ${novoStatus}${nota ? ` | ${nota}` : ''}`,
      });
    }

    await observacao.save();

    await auditoriaSegura({
      req,
      event: 'OBSERVACAO_PROFESSOR_STATUS_ALTERADO',
      targetType: 'ObservacaoProfessor',
      targetId: observacao._id,
      entidadeNome: observacao.alunoNome,
      alunoNome: observacao.alunoNome,
      meta: { statusAnterior, novoStatus, possuiNota: Boolean(nota) },
    });

    return res.json({
      mensagem: novoStatus === 'resolvida' ? 'Observação resolvida.' : 'Situação atualizada.',
      observacao: mapearObservacao(observacao, adminId),
    });
  } catch (erro) {
    console.error('[observacoes-professores] erro ao alterar status:', erro);
    return res.status(500).json({ mensagem: 'Erro ao atualizar a situação.' });
  }
});

router.use((erro, _req, res, next) => {
  if (!erro) return next();
  if (erro instanceof multer.MulterError) {
    return res.status(400).json({ mensagem: erro.code === 'LIMIT_FILE_SIZE' ? 'O áudio ultrapassou 10 MB.' : erro.message });
  }
  if (erro?.message === 'Formato de áudio não permitido.') {
    return res.status(400).json({ mensagem: erro.message });
  }
  return next(erro);
});

module.exports = router;
