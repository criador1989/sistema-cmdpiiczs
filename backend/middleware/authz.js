function ensureAuth(req, res, next) {
  // ajuste para o seu projeto (cookie/session/jwt)
  // exemplo com session:
  if (!req.session?.user) return res.status(401).redirect('/login.html');
  req.user = req.session.user;
  next();
}

function allowRoles(...roles) {
  const allowed = roles.map(r => String(r).toLowerCase());
  return (req, res, next) => {
    const tipo = String(req.user?.tipo || '').toLowerCase();
    if (!allowed.includes(tipo)) {
      // se for navegação no browser, redireciona
      const acceptsHTML = (req.headers.accept || '').includes('text/html');
      return acceptsHTML
        ? res.status(403).redirect('/painel.html?erro=sem_permissao')
        : res.status(403).json({ ok:false, mensagem:'Sem permissão.' });
    }
    next();
  };
}

module.exports = { ensureAuth, allowRoles };
