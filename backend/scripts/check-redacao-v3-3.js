'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');

const checks = [
  [
    'routes/api/redacao.js',
    [
      'function acessoGestaoRedacao',
      'return isAdmin(req) || isProfessor(req);'
    ]
  ],
  [
    'routes/api/redacaoGestao.js',
    [
      "router.get('/contexto'",
      "router.get('/alunos'",
      "router.get('/redacoes'",
      "router.get('/redacoes/:id'",
      "router.post('/redacoes/:id/orientacao'",
      'Acesso permitido somente a professores e administradores.'
    ]
  ],
  [
    'public/admin-redacao.html',
    [
      'Acompanhamento das redações',
      'filtroTurma',
      'detalheRedacaoProfessor'
    ]
  ],
  [
    'public/admin-redacao.js',
    [
      '/api/redacao/gestao/contexto',
      '/api/redacao/gestao/redacoes',
      'salvarOrientacao'
    ]
  ],
  [
    'public/css/admin-redacao.css',
    [
      '.acompanhamento-grid',
      '.lista-redacoes-professor',
      '.detalhe-redacao-professor'
    ]
  ]
];

let falhas = 0;

for (const [rel, termos] of checks) {
  const arquivo = path.join(raiz, rel);

  if (!fs.existsSync(arquivo)) {
    console.error(`FALTA ${rel}`);
    falhas++;
    continue;
  }

  const conteudo = fs.readFileSync(arquivo, 'utf8');
  const ausentes = termos.filter(
    (termo) => !conteudo.includes(termo)
  );

  if (ausentes.length) {
    console.error(`ERRO  ${rel}`);

    ausentes.forEach((termo) => {
      console.error(`  - termo ausente: ${termo}`);
    });

    falhas++;
  } else {
    console.log(`OK    ${rel}`);
  }
}

const indexPath = path.join(raiz, 'index.js');

if (!fs.existsSync(indexPath)) {
  console.error('FALTA index.js');
  falhas++;
} else {
  const index = fs.readFileSync(indexPath, 'utf8');

  const termosObrigatorios = [
    "const redacaoGestaoRoutes = require('./routes/api/redacaoGestao');",
    "mountIf('/api/redacao/gestao', redacaoGestaoRoutes);",
    'function exigirProfessorOuAdminRedacao',
    "app.get(\n  '/admin-redacao.html'"
  ];

  for (const termo of termosObrigatorios) {
    if (!index.includes(termo)) {
      console.error(`ERRO  index.js: termo ausente: ${termo}`);
      falhas++;
    }
  }

  const inicioBloqueio = index.indexOf(
    'const blockedExact = new Set(['
  );

  const fimBloqueio =
    inicioBloqueio >= 0
      ? index.indexOf(']);', inicioBloqueio)
      : -1;

  if (inicioBloqueio < 0 || fimBloqueio < 0) {
    console.error(
      'ERRO  index.js: bloco blockedExact não localizado.'
    );
    falhas++;
  } else {
    const blocoBloqueado = index.slice(
      inicioBloqueio,
      fimBloqueio + 3
    );

    if (blocoBloqueado.includes('/admin-redacao.html')) {
      console.error(
        'ERRO  index.js: /admin-redacao.html ainda consta no bloqueio de professores.'
      );
      falhas++;
    } else {
      console.log(
        'OK    index.js: página removida do bloqueio de professores.'
      );
    }
  }

  const rotaProtegida =
    /app\.get\(\s*['"]\/admin-redacao\.html['"],\s*autenticar,\s*exigirProfessorOuAdminRedacao/s;

  if (!rotaProtegida.test(index)) {
    console.error(
      'ERRO  index.js: rota protegida /admin-redacao.html não localizada.'
    );
    falhas++;
  } else {
    console.log(
      'OK    index.js: rota protegida para professor/admin localizada.'
    );
  }
}

if (falhas) {
  console.error(`\nV3.3.1 com ${falhas} falha(s).`);
  process.exit(1);
}

console.log(
  '\n✅ Painel ENEM — Redação V3.3.1 validado para professores e administradores.'
);
