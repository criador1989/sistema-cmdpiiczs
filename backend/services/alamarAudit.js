'use strict';

const Log = require('../models/Log');

async function registrarAuditoriaAlamar(req, {
  acao,
  entidade = 'AlamarProcesso',
  entidadeId,
  entidadeNome = null,
  detalhes = {},
  antes = null,
  depois = null,
  motivo = null,
  severidade = 'info',
  status = 'sucesso',
} = {}) {
  try {
    const tenantId = req.usuario?.tenantId || req.usuario?.instituicao;
    const usuarioId = req.usuario?.id || req.usuario?._id;
    if (!tenantId || !usuarioId || !acao) return null;

    return await Log.create({
      instituicao: String(tenantId),
      tenantId,
      usuario: usuarioId,
      usuarioNome: req.usuario?.nome || null,
      usuarioTipo: req.usuario?.tipo || null,
      usuarioEmail: req.usuario?.email || null,
      acao,
      entidade,
      entidadeId: String(entidadeId || 'sem-id'),
      entidadeNome,
      modulo: 'alamar',
      categoria: 'gestao_alamar',
      severidade,
      status,
      motivo,
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null,
      origem: req.headers.origin || req.headers.referer || null,
      antes,
      depois,
      detalhes,
      ator: {
        id: String(usuarioId),
        nome: req.usuario?.nome || null,
        tipo: req.usuario?.tipo || null,
        email: req.usuario?.email || null,
        instituicao: String(tenantId),
      },
      requestContext: {
        method: req.method,
        path: req.path,
        originalUrl: req.originalUrl,
        baseUrl: req.baseUrl,
        statusCode: req.res?.statusCode || null,
        origin: req.headers.origin || null,
        referer: req.headers.referer || null,
        host: req.headers.host || null,
        protocolo: req.protocol || null,
        ip: req.ip || null,
        forwardedFor: req.headers['x-forwarded-for'] || null,
      },
    });
  } catch (error) {
    console.warn('[alamarAudit] falha ao registrar auditoria:', error.message);
    return null;
  }
}

module.exports = { registrarAuditoriaAlamar };
