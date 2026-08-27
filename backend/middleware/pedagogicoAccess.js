'use strict';

const PERFIS_PEDAGOGICO = new Set(['professor', 'admin', 'master', 'superadmin']);
const PERFIS_GESTAO = new Set(['admin', 'master', 'superadmin']);

function perfil(req) {
  return String(req.usuario?.tipo || req.usuario?.perfil || '').trim().toLowerCase();
}

function acessoPedagogico(req, res, next) {
  const tipo = perfil(req);
  if (PERFIS_PEDAGOGICO.has(tipo)) return next();

  return res.status(403).json({
    ok: false,
    codigo: 'PEDAGOGICO_SEM_PERMISSAO',
    mensagem: 'Você não possui acesso ao módulo pedagógico.'
  });
}

function apenasGestaoPedagogica(req, res, next) {
  const tipo = perfil(req);
  if (PERFIS_GESTAO.has(tipo)) return next();

  return res.status(403).json({
    ok: false,
    codigo: 'PEDAGOGICO_GESTAO_RESTRITA',
    mensagem: 'Esta ação é restrita à gestão pedagógica.'
  });
}

function podeAcessarPedagogico(req) {
  return PERFIS_PEDAGOGICO.has(perfil(req));
}

function ehGestaoPedagogica(req) {
  return PERFIS_GESTAO.has(perfil(req));
}

module.exports = {
  PERFIS_PEDAGOGICO,
  PERFIS_GESTAO,
  acessoPedagogico,
  apenasGestaoPedagogica,
  podeAcessarPedagogico,
  ehGestaoPedagogica
};
