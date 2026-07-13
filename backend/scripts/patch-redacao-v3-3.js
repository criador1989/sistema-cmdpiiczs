'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const indexPath = path.join(raiz, 'index.js');
const painelPath = path.join(raiz, 'public', 'painel.html');
const professorPath = path.join(
  raiz,
  'public',
  'painel-professor.html'
);

function patchIndex() {
  if (!fs.existsSync(indexPath)) {
    throw new Error('index.js não encontrado.');
  }

  let conteudo = fs.readFileSync(
    indexPath,
    'utf8'
  );

  if (
    !conteudo.includes(
      "const redacaoGestaoRoutes = require('./routes/api/redacaoGestao');"
    )
  ) {
    const marcador =
      "const redacaoRoutes = require('./routes/api/redacao');";

    if (!conteudo.includes(marcador)) {
      throw new Error(
        'Import da rota principal de redação não encontrado.'
      );
    }

    conteudo = conteudo.replace(
      marcador,
      `${marcador}\nconst redacaoGestaoRoutes = require('./routes/api/redacaoGestao');`
    );
  }

  if (
    !conteudo.includes(
      "mountIf('/api/redacao/gestao', redacaoGestaoRoutes);"
    )
  ) {
    const marcador =
      "mountIf('/api/redacao', redacaoRoutes);";

    if (!conteudo.includes(marcador)) {
      throw new Error(
        'Montagem da rota principal de redação não encontrada.'
      );
    }

    conteudo = conteudo.replace(
      marcador,
      `mountIf('/api/redacao/gestao', redacaoGestaoRoutes);\n${marcador}`
    );
  }

  // Remove a página da lista que bloqueia professores.
  conteudo = conteudo.replace(
    /\s*'\/admin-redacao\.html',?\r?\n/g,
    '\n'
  );

  if (
    !conteudo.includes(
      'function exigirProfessorOuAdminRedacao'
    )
  ) {
    const marcador =
      "app.get('/admin-site/site-analytics.html', autenticar, exigirAdmin, (_req, res) => {";

    if (!conteudo.includes(marcador)) {
      throw new Error(
        'Ponto de inserção das rotas HTML especiais não encontrado.'
      );
    }

    const bloco = `function exigirProfessorOuAdminRedacao(req, res, next) {
  const role = getRole(req);
  const permitido =
    role.includes('admin') ||
    role.includes('master') ||
    role.includes('superadmin') ||
    role.includes('coorden') ||
    role.includes('dire') ||
    role.includes('professor');

  if (!permitido) {
    return send403(res, publicRoot);
  }

  return next();
}

app.get(
  '/admin-redacao.html',
  autenticar,
  exigirProfessorOuAdminRedacao,
  (_req, res) => {
    return res.sendFile(
      path.join(publicRoot, 'admin-redacao.html')
    );
  }
);

`;

    conteudo = conteudo.replace(
      marcador,
      bloco + marcador
    );
  }

  fs.writeFileSync(indexPath, conteudo, 'utf8');
}

function patchPainelAdmin() {
  if (!fs.existsSync(painelPath)) return;

  let conteudo = fs.readFileSync(
    painelPath,
    'utf8'
  );

  if (
    conteudo.includes(
      'id="cardGestaoRedacao"'
    )
  ) {
    conteudo = conteudo.replace(
      /Gestão da Redação ENEM/g,
      'Painel ENEM — Redação'
    );

    fs.writeFileSync(
      painelPath,
      conteudo,
      'utf8'
    );
    return;
  }

  const marcador =
    '          </div>\n\n          <section class="pend-card"';

  const card = `            <div id="cardGestaoRedacao" class="window-card" role="link" tabindex="0" onclick="location.href=withTenant('admin-redacao.html')">
              <div class="window-content">
                <div class="card-copy">
                  <div class="kicker">PEDAGÓGICO</div>
                  <h3>Painel ENEM — Redação</h3>
                </div>
              </div>
            </div>
          </div>

          <section class="pend-card"`;

  if (conteudo.includes(marcador)) {
    conteudo = conteudo.replace(
      marcador,
      card
    );

    fs.writeFileSync(
      painelPath,
      conteudo,
      'utf8'
    );
  } else {
    console.warn(
      'Aviso: card do Painel ENEM não foi inserido automaticamente no painel administrativo.'
    );
  }
}

function patchPainelProfessor() {
  if (!fs.existsSync(professorPath)) return;

  let conteudo = fs.readFileSync(
    professorPath,
    'utf8'
  );

  if (
    !conteudo.includes('id="btnRedacaoEnem"')
  ) {
    const marcador =
      '<button class="btn primary" id="btnProsseguir" style="display:none;">Prosseguir</button>';

    const botao =
      `${marcador}\n      <button class="btn" id="btnRedacaoEnem" style="display:none;">Painel ENEM — Redação</button>`;

    if (conteudo.includes(marcador)) {
      conteudo = conteudo.replace(
        marcador,
        botao
      );
    }
  }

  if (
    !conteudo.includes(
      "const btnRedacaoEnem"
    )
  ) {
    const marcador =
      "const btnIrLogin    = document.getElementById('btnIrLogin');";

    if (conteudo.includes(marcador)) {
      conteudo = conteudo.replace(
        marcador,
        `${marcador}\n    const btnRedacaoEnem = document.getElementById('btnRedacaoEnem');`
      );
    }
  }

  if (
    !conteudo.includes(
      "btnRedacaoEnem.onclick"
    )
  ) {
    const marcador =
      "btnProsseguir.onclick = () => window.location.href = '/painel.html';";

    if (conteudo.includes(marcador)) {
      conteudo = conteudo.replace(
        marcador,
        `${marcador}\n        if (btnRedacaoEnem) {\n          btnRedacaoEnem.style.display = 'inline-flex';\n          btnRedacaoEnem.onclick = () => window.location.href = '/admin-redacao.html';\n        }`
      );
    }
  }

  conteudo = conteudo.replace(
    '<b>Dica:</b> Professor acessa a <b>ficha do aluno</b> e a <b>chamada</b> pelo painel principal.',
    '<b>Dica:</b> Use o <b>Painel ENEM — Redação</b> para selecionar temas, acompanhar turmas e consultar as devolutivas dos alunos.'
  );

  fs.writeFileSync(
    professorPath,
    conteudo,
    'utf8'
  );
}

patchIndex();
patchPainelAdmin();
patchPainelProfessor();

console.log(
  'Navegação e acesso do Painel ENEM V3.3 atualizados.'
);
