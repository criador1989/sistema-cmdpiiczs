'use strict';

const express = require('express');
const router = express.Router();

const ConfiguracaoDisciplinar = require('../../models/ConfiguracaoDisciplinar');
const { autenticar } = require('../../middleware/autenticacao');
const { listarTodosMotivos } = require('../../utils/regulamento');

/* =========================================
   Helpers básicos
========================================= */
function normalizarTexto(v) {
  return String(v || '').trim();
}

function normalizarTipoOcorrencia(v) {
  const t = String(v || '').trim().toLowerCase();
  return ['positivo', 'negativo'].includes(t) ? t : '';
}

function normalizarNumero(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizarClassificacaoParaCategoria(v) {
  const txt = String(v || '').trim().toLowerCase();

  if (txt === 'leve') return 'leve';
  if (txt === 'médio' || txt === 'medio') return 'medio';
  if (txt === 'grave') return 'grave';
  if (txt === 'gravíssimo' || txt === 'gravissimo') return 'gravissimo';
  if (txt === 'elogio' || txt === 'positiva' || txt === 'positivo') return 'elogio';

  return 'leve';
}

function normalizarTipoInciso(v, categoria) {
  const tipo = String(v || '').trim().toLowerCase();
  const cat = normalizarClassificacaoParaCategoria(categoria);

  if (tipo === 'elogio') return 'elogio';
  if (cat === 'elogio') return 'elogio';

  return 'negativa';
}

function ordenarIncisos(a, b) {
  const aNum = Number(a?.codigo);
  const bNum = Number(b?.codigo);

  const aEhNumero = Number.isFinite(aNum);
  const bEhNumero = Number.isFinite(bNum);

  if (aEhNumero && bEhNumero) return aNum - bNum;
  return String(a?.codigo || '').localeCompare(String(b?.codigo || ''), 'pt-BR');
}

function garantirEstruturaConfig(configDoc) {
  if (!configDoc.comportamento) configDoc.comportamento = {};
  if (!Array.isArray(configDoc.comportamento.faixas)) configDoc.comportamento.faixas = [];
  if (typeof configDoc.comportamento.notaInicial !== 'number') configDoc.comportamento.notaInicial = 8;

  if (!Array.isArray(configDoc.ocorrencias)) configDoc.ocorrencias = [];

  if (!configDoc.tsmd) configDoc.tsmd = {};
  if (typeof configDoc.tsmd.diasParaIniciar !== 'number') configDoc.tsmd.diasParaIniciar = 60;
  if (typeof configDoc.tsmd.incrementoPorDia !== 'number') configDoc.tsmd.incrementoPorDia = 0.01;
  if (typeof configDoc.tsmd.limiteMaximo !== 'number') configDoc.tsmd.limiteMaximo = 10;
  if (typeof configDoc.tsmd.limiteMinimo !== 'number') configDoc.tsmd.limiteMinimo = 0;

  if (!configDoc.regulamento) configDoc.regulamento = {};
  if (!Array.isArray(configDoc.regulamento.artigos)) configDoc.regulamento.artigos = [];

  if (typeof configDoc.regulamento.nome !== 'string') configDoc.regulamento.nome = '';
  if (typeof configDoc.regulamento.textoCurto !== 'string') configDoc.regulamento.textoCurto = '';
  if (typeof configDoc.regulamento.textoInstitucional !== 'string') configDoc.regulamento.textoInstitucional = '';
  if (typeof configDoc.regulamento.cidade !== 'string') configDoc.regulamento.cidade = '';
  if (typeof configDoc.regulamento.estado !== 'string') configDoc.regulamento.estado = '';

  return configDoc;
}

function normalizarPayloadConfig(update) {
  const payload = { ...(update || {}) };

  if (!payload.comportamento) payload.comportamento = {};
  if (!Array.isArray(payload.comportamento.faixas)) payload.comportamento.faixas = [];

  payload.comportamento.faixas = payload.comportamento.faixas.map((faixa, index) => ({
    nome: normalizarTexto(faixa?.nome) || `Faixa ${index + 1}`,
    min: normalizarNumero(faixa?.min, 0),
    max: normalizarNumero(faixa?.max, 0),
    descricao: normalizarTexto(faixa?.descricao)
  }));

  if (!Array.isArray(payload.ocorrencias)) payload.ocorrencias = [];
  payload.ocorrencias = payload.ocorrencias.map((o) => ({
    nome: normalizarTexto(o?.nome || o?.descricao),
    tipo: normalizarTipoOcorrencia(
      o?.tipo || (normalizarNumero(o?.valor ?? o?.pontuacao, 0) >= 0 ? 'positivo' : 'negativo')
    ) || 'negativo',
    valor: normalizarNumero(o?.valor ?? o?.pontuacao, 0),
    categoria: normalizarTexto(o?.categoria)
  }));

  if (!payload.tsmd) payload.tsmd = {};
  payload.tsmd = {
    ...payload.tsmd,
    diasParaIniciar: normalizarNumero(payload.tsmd?.diasParaIniciar, 60),
    incrementoPorDia: normalizarNumero(payload.tsmd?.incrementoPorDia, 0.01),
    limiteMaximo: normalizarNumero(payload.tsmd?.limiteMaximo, 10),
    limiteMinimo: normalizarNumero(payload.tsmd?.limiteMinimo, 0)
  };

  if (!payload.regulamento) payload.regulamento = {};
  if (!Array.isArray(payload.regulamento.artigos)) payload.regulamento.artigos = [];

  payload.regulamento = {
    ...payload.regulamento,
    nome: normalizarTexto(payload.regulamento?.nome),
    textoCurto: normalizarTexto(payload.regulamento?.textoCurto),
    textoInstitucional: normalizarTexto(payload.regulamento?.textoInstitucional),
    cidade: normalizarTexto(payload.regulamento?.cidade),
    estado: normalizarTexto(payload.regulamento?.estado),
    artigos: payload.regulamento.artigos.map((artigo, artigoIndex) => ({
      numero: normalizarTexto(artigo?.numero) || `Art. ${artigoIndex + 1}º`,
      titulo: normalizarTexto(artigo?.titulo),
      incisos: Array.isArray(artigo?.incisos)
        ? artigo.incisos.map((inciso, incisoIndex) => ({
            codigo: normalizarTexto(inciso?.codigo) || String(incisoIndex + 1),
            texto: normalizarTexto(inciso?.texto),
            pontuacao: normalizarNumero(inciso?.pontuacao, 0),
            categoria: normalizarClassificacaoParaCategoria(inciso?.categoria),
            tipo: normalizarTipoInciso(inciso?.tipo, inciso?.categoria)
          }))
        : []
    }))
  };

  return payload;
}

/* =========================================
   Seed do regulamento mapeado
========================================= */
function montarArtigosDoRegulamentoMapeado(motivosMapeados = []) {
  const mapa = new Map();

  for (const item of motivosMapeados) {
    const artigo = normalizarTexto(item?.artigo);
    const paragrafo = normalizarTexto(item?.paragrafo);
    const inciso = normalizarTexto(item?.inciso);
    const motivo = normalizarTexto(item?.motivo);
    const classificacao = normalizarTexto(item?.classificacao);

    if (!artigo || !motivo) continue;

    const chave = `${artigo}|||${paragrafo}`;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        numero: artigo,
        titulo: paragrafo || '',
        incisos: []
      });
    }

    mapa.get(chave).incisos.push({
      codigo: inciso || '',
      texto: motivo,
      pontuacao: 0,
      categoria: normalizarClassificacaoParaCategoria(classificacao),
      tipo: normalizarTipoInciso('', classificacao)
    });
  }

  return Array.from(mapa.values()).map((artigo) => ({
    ...artigo,
    incisos: (artigo.incisos || []).sort(ordenarIncisos)
  }));
}

async function popularRegulamentoSeNecessario(configDoc) {
  garantirEstruturaConfig(configDoc);

  const jaTemArtigos =
    Array.isArray(configDoc.regulamento?.artigos) &&
    configDoc.regulamento.artigos.length > 0;

  if (jaTemArtigos) {
    return configDoc;
  }

  const motivosMapeados = typeof listarTodosMotivos === 'function'
    ? listarTodosMotivos()
    : [];

  if (!Array.isArray(motivosMapeados) || !motivosMapeados.length) {
    return configDoc;
  }

  configDoc.regulamento.artigos = montarArtigosDoRegulamentoMapeado(motivosMapeados);

  if (!configDoc.regulamento.nome) {
    configDoc.regulamento.nome = 'Regulamento Disciplinar';
  }

  await configDoc.save();
  return configDoc;
}

/* =========================================
   🔹 BUSCAR CONFIGURAÇÃO
========================================= */
router.get('/', autenticar, async (req, res) => {
  try {
    const config = await ConfiguracaoDisciplinar.findOne({
      instituicao: req.usuario.instituicao
    });

    if (!config) {
      return res.status(404).json({
        error: 'Configuração não encontrada'
      });
    }

    garantirEstruturaConfig(config);

    const payload = config.toObject ? config.toObject() : JSON.parse(JSON.stringify(config));

    const artigosAtuais = Array.isArray(payload?.regulamento?.artigos)
      ? payload.regulamento.artigos
      : [];

    if (!artigosAtuais.length) {
      const motivosMapeados = typeof listarTodosMotivos === 'function'
        ? listarTodosMotivos()
        : [];

      if (Array.isArray(motivosMapeados) && motivosMapeados.length) {
        const artigosMontados = montarArtigosDoRegulamentoMapeado(motivosMapeados);

        payload.regulamento = payload.regulamento || {};
        payload.regulamento.artigos = artigosMontados;

        if (!payload.regulamento.nome) {
          payload.regulamento.nome = 'Regulamento Disciplinar';
        }

        // tenta persistir no banco, mas mesmo que falhe já devolve para o front
        try {
          config.regulamento = config.regulamento || {};
          config.regulamento.artigos = artigosMontados;

          if (!config.regulamento.nome) {
            config.regulamento.nome = 'Regulamento Disciplinar';
          }

          await config.save();
        } catch (saveErr) {
          console.error('Erro ao persistir artigos do regulamento:', saveErr);
        }
      }
    }

    return res.json(payload);
  } catch (err) {
    console.error('Erro ao buscar config disciplinar:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});
/* =========================================
   🔹 ATUALIZAR CONFIGURAÇÃO GERAL
========================================= */
router.put('/', autenticar, async (req, res) => {
  try {
    const instituicaoId = req.usuario.instituicao;
    const update = normalizarPayloadConfig(req.body || {});

    const config = await ConfiguracaoDisciplinar.findOneAndUpdate(
      { instituicao: instituicaoId },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!config) {
      return res.status(404).json({
        error: 'Configuração não encontrada'
      });
    }

    return res.json({
      mensagem: 'Configuração atualizada com sucesso',
      config
    });
  } catch (err) {
    console.error('Erro ao atualizar config disciplinar:', err);
    return res.status(500).json({ error: 'Erro ao atualizar' });
  }
});

/* =========================================
   🔹 CRIAR OCORRÊNCIA
========================================= */
router.post('/ocorrencias', autenticar, async (req, res) => {
  try {
    const instituicaoId = req.usuario.instituicao;

    const nome = normalizarTexto(req.body?.nome || req.body?.descricao);
    const tipo = normalizarTipoOcorrencia(req.body?.tipo);
    const valor = normalizarNumero(req.body?.valor ?? req.body?.pontuacao, 0);
    const categoria = normalizarTexto(req.body?.categoria);

    if (!nome) {
      return res.status(400).json({ error: 'Informe o nome da ocorrência.' });
    }

    const tipoFinal = tipo || (valor >= 0 ? 'positivo' : 'negativo');

    const config = await ConfiguracaoDisciplinar.findOne({
      instituicao: instituicaoId
    });

    if (!config) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }

    if (!Array.isArray(config.ocorrencias)) {
      config.ocorrencias = [];
    }

    config.ocorrencias.push({
      nome,
      tipo: tipoFinal,
      valor,
      categoria
    });

    await config.save();

    return res.json({
      mensagem: 'Ocorrência criada com sucesso',
      ocorrencias: config.ocorrencias
    });
  } catch (err) {
    console.error('Erro ao criar ocorrência:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

/* =========================================
   🔹 ATUALIZAR OCORRÊNCIA
========================================= */
router.put('/ocorrencias/:id', autenticar, async (req, res) => {
  try {
    const instituicaoId = req.usuario.instituicao;
    const ocorrenciaId = String(req.params.id || '').trim();

    const config = await ConfiguracaoDisciplinar.findOne({
      instituicao: instituicaoId
    });

    if (!config) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }

    const ocorrencia = (config.ocorrencias || []).find(
      (o) => String(o._id) === ocorrenciaId
    );

    if (!ocorrencia) {
      return res.status(404).json({ error: 'Ocorrência não encontrada' });
    }

    const nome = normalizarTexto(req.body?.nome || req.body?.descricao);
    const tipo = normalizarTipoOcorrencia(req.body?.tipo);
    const categoria = normalizarTexto(req.body?.categoria);
    const valorInformado = req.body?.valor ?? req.body?.pontuacao;

    if (nome) ocorrencia.nome = nome;
    if (tipo) ocorrencia.tipo = tipo;
    if (categoria || categoria === '') ocorrencia.categoria = categoria;
    if (valorInformado !== undefined) ocorrencia.valor = normalizarNumero(valorInformado, 0);

    await config.save();

    return res.json({
      mensagem: 'Ocorrência atualizada com sucesso',
      ocorrencias: config.ocorrencias
    });
  } catch (err) {
    console.error('Erro ao atualizar ocorrência:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

/* =========================================
   🔹 REMOVER OCORRÊNCIA
========================================= */
router.delete('/ocorrencias/:id', autenticar, async (req, res) => {
  try {
    const instituicaoId = req.usuario.instituicao;
    const ocorrenciaId = String(req.params.id || '').trim();

    const config = await ConfiguracaoDisciplinar.findOne({
      instituicao: instituicaoId
    });

    if (!config) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }

    const antes = Array.isArray(config.ocorrencias) ? config.ocorrencias.length : 0;

    config.ocorrencias = (config.ocorrencias || []).filter(
      (o) => String(o._id) !== ocorrenciaId
    );

    if (config.ocorrencias.length === antes) {
      return res.status(404).json({ error: 'Ocorrência não encontrada' });
    }

    await config.save();

    return res.json({
      mensagem: 'Ocorrência removida com sucesso',
      ocorrencias: config.ocorrencias
    });
  } catch (err) {
    console.error('Erro ao remover ocorrência:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;