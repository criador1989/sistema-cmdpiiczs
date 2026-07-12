'use strict';

const mongoose = require('mongoose');
const Instituicao = require('../models/Instituicao');
const Usuario = require('../models/Usuario');

const PERFIS = [
  'presidente',
  'vice_presidente',
  'tesoureiro',
  'secretario',
  'conselho_fiscal',
  'operador',
  'consulta',
];

const PERMISSOES_POR_PERFIL = {
  presidente: ['*'],
  vice_presidente: ['*'],
  tesoureiro: [
    'dashboard:ler', 'pessoas:ler', 'pessoas:escrever',
    'financeiro:ler', 'financeiro:escrever', 'financeiro:cancelar',
    'contribuicoes:ler', 'contribuicoes:escrever',
    'lembretes:ler', 'lembretes:gerenciar',
    'projetos:ler', 'projetos:escrever',
    'patrimonio:ler', 'documentos:ler', 'anexos:ler', 'anexos:escrever',
    'relatorios:ler', 'auditoria:ler', 'mensagens:ler',
  ],
  secretario: [
    'dashboard:ler', 'pessoas:ler', 'pessoas:escrever',
    'financeiro:ler', 'contribuicoes:ler',
    'lembretes:ler', 'lembretes:gerenciar',
    'projetos:ler', 'patrimonio:ler', 'patrimonio:escrever',
    'documentos:ler', 'documentos:escrever',
    'anexos:ler', 'anexos:escrever',
    'relatorios:ler', 'mensagens:ler', 'mensagens:escrever',
  ],
  conselho_fiscal: [
    'dashboard:ler', 'pessoas:ler', 'financeiro:ler', 'contribuicoes:ler',
    'lembretes:ler',
    'projetos:ler', 'patrimonio:ler', 'documentos:ler', 'anexos:ler',
    'relatorios:ler', 'auditoria:ler', 'mensagens:ler',
  ],
  operador: [
    'dashboard:ler', 'pessoas:ler', 'pessoas:escrever',
    'financeiro:ler', 'financeiro:escrever',
    'contribuicoes:ler', 'contribuicoes:escrever',
    'lembretes:ler',
    'projetos:ler', 'patrimonio:ler', 'documentos:ler',
    'anexos:ler', 'anexos:escrever', 'relatorios:ler',
  ],
  consulta: [
    'dashboard:ler', 'pessoas:ler', 'financeiro:ler', 'contribuicoes:ler',
    'lembretes:ler',
    'projetos:ler', 'patrimonio:ler', 'documentos:ler', 'anexos:ler',
    'relatorios:ler', 'mensagens:ler',
  ],
};

function normalizePerfil(value) {
  const v = String(value || '').trim().toLowerCase().replace(/[ -]+/g, '_');
  return PERFIS.includes(v) ? v : null;
}

function hasPermission(perfil, permissao) {
  const list = PERMISSOES_POR_PERFIL[perfil] || [];
  return list.includes('*') || list.includes(permissao);
}

function getAuthTenantId(req) {
  return String(req.usuario?.tenantId || req.usuario?.instituicao || '').trim();
}

async function carregarContextoAssociacao(req, res, next) {
  try {
    const tenantId = getAuthTenantId(req);
    if (!tenantId || !mongoose.isValidObjectId(tenantId)) {
      return res.status(401).json({ mensagem: 'Instituição da sessão não identificada.' });
    }

    if (req.tenantId && String(req.tenantId) !== tenantId) {
      return res.status(403).json({ mensagem: 'O tenant da URL não corresponde à instituição autenticada.' });
    }

    const [instituicao, identidade] = await Promise.all([
      Instituicao.findById(tenantId)
        .select('nome nomeExibicao sigla slug logoUrl categoriaInstituicao instituicaoMatriz modulosAtivos associacaoConfig ativo ativa email telefone endereco cnpj timezone')
        .lean(),
      Usuario.findById(req.usuario.id)
        .select('nome email ativo instituicao tenantId')
        .lean(),
    ]);

    if (!instituicao || instituicao.ativo === false || instituicao.ativa === false) {
      return res.status(403).json({ mensagem: 'Associação não encontrada ou inativa.' });
    }

    const moduloAtivo =
      instituicao.categoriaInstituicao === 'associacao' ||
      instituicao.associacaoConfig?.ativo === true ||
      (Array.isArray(instituicao.modulosAtivos) && instituicao.modulosAtivos.includes('associacao'));

    if (!moduloAtivo) {
      return res.status(403).json({ mensagem: 'O módulo Axoriin Associações não está ativo para esta instituição.' });
    }

    if (!identidade || identidade.ativo === false) {
      return res.status(403).json({ mensagem: 'Usuário não encontrado ou inativo.' });
    }

    const acesso = req.usuario.associacaoAcesso || req.usuario.acessosModulos?.associacao || {};
    let perfil = normalizePerfil(acesso.perfil);
    let ativo = acesso.ativo === true;

    // Compatibilidade com usuários criados na v3.1 diretamente no tenant da associação.
    if (!perfil && req.usuario.tipo === 'admin' && instituicao.categoriaInstituicao === 'associacao') {
      perfil = 'presidente';
      ativo = true;
    }

    if (!ativo || !perfil) {
      return res.status(403).json({ mensagem: 'Seu usuário não possui acesso ao módulo da associação.' });
    }

    req.associacao = {
      tenantId,
      instituicaoId: tenantId,
      instituicao,
      usuario: {
        ...req.usuario,
        nome: identidade.nome || req.usuario.nome,
        email: identidade.email || req.usuario.email,
      },
      perfil,
      permissoes: PERMISSOES_POR_PERFIL[perfil] || [],
      vinculoId: req.usuario.vinculoId || null,
    };

    req.instituicaoId = tenantId;
    return next();
  } catch (error) {
    console.error('[associacaoAuth] erro:', error);
    return res.status(500).json({ mensagem: 'Não foi possível validar o acesso à associação.' });
  }
}

function exigirPermissao(...permissoes) {
  return (req, res, next) => {
    const perfil = req.associacao?.perfil;
    if (!perfil) return res.status(403).json({ mensagem: 'Contexto da associação não carregado.' });

    const autorizado = permissoes.some((permissao) => hasPermission(perfil, permissao));
    if (!autorizado) {
      return res.status(403).json({ mensagem: 'Seu perfil não possui permissão para esta operação.' });
    }
    return next();
  };
}

module.exports = {
  PERFIS,
  PERMISSOES_POR_PERFIL,
  normalizePerfil,
  hasPermission,
  carregarContextoAssociacao,
  exigirPermissao,
};
