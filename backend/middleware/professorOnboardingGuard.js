'use strict';

const { autenticar } = require('./autenticacao');
const { obterEstadoOnboardingProfessor } = require('../services/onboardingProfessor');

const ROTAS_LIBERADAS = [
  '/auth/',
  '/api/termos-professor/',
  '/primeiro-acesso-professor.html',
  '/bem-vindo.html',
  '/login.html',
  '/notificacao-responsavel.html',
  '/procedimento-responsavel.html',
  '/logout.js',
  '/manifest.json',
  '/service-worker.js',
  '/icons/',
  '/assets/',
  '/img/',
  '/axoriin-ajuda/',
  '/favicon.ico',
  '/healthz',
  '/__version',
  '/public/tenant',
];

function rotaLiberada(pathname) {
  const p = String(pathname || '/');
  return ROTAS_LIBERADAS.some((prefix) => p === prefix || p.startsWith(prefix));
}

function temToken(req) {
  return Boolean(
    req.cookies?.token ||
    req.headers?.authorization ||
    req.headers?.Authorization ||
    req.headers?.['x-access-token'] ||
    req.query?.token
  );
}

function wantsHtml(req) {
  const accept = String(req.headers?.accept || '').toLowerCase();
  return req.method === 'GET' && (req.path.endsWith('.html') || accept.includes('text/html'));
}

module.exports = function professorOnboardingGuard(req, res, next) {
  if (rotaLiberada(req.path)) return next();
  if (!temToken(req)) return next();

  return autenticar(req, res, async () => {
    try {
      if (String(req.usuario?.tipo || '').toLowerCase() !== 'professor') return next();

      const estado = await obterEstadoOnboardingProfessor(req.usuario, {
        instituicaoId: req.usuario.instituicao,
      });

      req.onboardingProfessor = estado;
      res.locals.onboardingProfessor = estado;

      if (estado.concluido) return next();

      const destino = '/primeiro-acesso-professor.html';
      if (wantsHtml(req)) {
        const tenant = encodeURIComponent(String(req.usuario.instituicao || ''));
        return res.redirect(302, `${destino}?t=${tenant}`);
      }

      return res.status(428).json({
        code: 'PROFESSOR_ONBOARDING_REQUIRED',
        mensagem: estado.precisaTrocarSenha
          ? 'Altere sua senha temporária para continuar.'
          : 'Leia e aceite o Termo de Compromisso para continuar.',
        redirecionar: destino,
        onboarding: estado,
      });
    } catch (error) {
      console.error('[professorOnboardingGuard]', error);
      return res.status(error.statusCode || 500).json({
        mensagem: error.statusCode === 401
          ? error.message
          : 'Não foi possível verificar as etapas obrigatórias do professor.',
      });
    }
  });
};
