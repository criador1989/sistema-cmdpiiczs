'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { SimuladoDashboardCache } = require('../services/simulados/simuladoDashboardCache');

async function executar() {
  const root = path.resolve(__dirname, '..');
  const rota = fs.readFileSync(path.join(root, 'routes', 'api', 'simulados.js'), 'utf8');
  const frontend = fs.readFileSync(path.join(root, 'public', 'simulados', 'simulados.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'simulados.html'), 'utf8');

  assert.match(html, /simulados\.js\?v=1\.12\.5/, 'O HTML deve forçar o JS V1.12.5.');
  assert.match(rota, /versao:\s*'1\.12\.5'/, 'O bootstrap deve anunciar V1.12.5.');
  assert.match(rota, /statusSolicitado === 'pendentes'/, 'A API deve combinar importações analisando + analisada.');
  assert.match(rota, /\$in:\s*\['analisando',\s*'analisada'\]/, 'O status pendentes deve consultar os dois estados em uma só chamada.');
  assert.match(rota, /dadosDashboard\(req, \{ leve: true \}\)/, 'A rota HTTP do dashboard deve usar leitura leve.');
  assert.match(rota, /select\(camposDashboard\)/, 'A leitura leve deve projetar apenas os campos necessários.');
  assert.match(rota, /dadosDashboard\(req\);/, 'As exportações devem continuar podendo usar dados completos.');
  assert.match(rota, /dashboardCache\.getOrCreate/, 'O dashboard deve usar cache + single-flight no backend.');
  assert.match(rota, /X-Axoriin-Dashboard-Cache/, 'A resposta deve permitir diagnosticar hit/miss/shared do cache.');

  assert.match(frontend, /status=pendentes&limite=30/, 'O frontend deve fazer uma única chamada para conferências pendentes.');
  assert.doesNotMatch(frontend, /Promise\.all\(\[\s*api\(`\/api\/simulados\/\$\{state\.current\._id\}\/importacoes\?status=analisada/, 'As duas chamadas paralelas antigas não podem permanecer.');
  assert.match(frontend, /dashboardRequestPromise/, 'O frontend deve compartilhar chamadas concorrentes do mesmo dashboard.');
  assert.match(frontend, /error\?\.status !== 429/, 'O frontend deve tratar 429 de forma específica.');
  assert.match(frontend, /await sleep\(2400\)/, 'O retry de 429 deve aguardar antes de tentar novamente.');
  assert.match(frontend, /renderDashboardUnavailable/, 'Falha temporária não deve parecer que 114 resultados viraram zero.');
  assert.match(frontend, /loadDashboard\(\{ force: true \}\)/, 'Alterações pedagógicas devem forçar atualização após invalidar o cache.');

  const cache = new SimuladoDashboardCache({ ttlMs: 5000, maxEntries: 20 });
  let execucoes = 0;
  const produtor = async () => {
    execucoes += 1;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { participantes: 114, execucao: execucoes };
  };

  const [a, b, c] = await Promise.all([
    cache.getOrCreate('tenant::simulado::*', produtor),
    cache.getOrCreate('tenant::simulado::*', produtor),
    cache.getOrCreate('tenant::simulado::*', produtor),
  ]);
  assert.equal(execucoes, 1, 'Chamadas concorrentes devem compartilhar uma única agregação.');
  assert.equal(a.value.participantes, 114);
  assert.equal(b.value.execucao, 1);
  assert.equal(c.value.execucao, 1);
  assert.ok([a.source, b.source, c.source].includes('miss'));
  assert.ok([a.source, b.source, c.source].includes('shared'));

  const hit = await cache.getOrCreate('tenant::simulado::*', produtor);
  assert.equal(hit.source, 'hit');
  assert.equal(execucoes, 1, 'Cache válido não deve recalcular.');

  const forced = await cache.getOrCreate('tenant::simulado::*', produtor, { force: true });
  assert.equal(forced.source, 'miss');
  assert.equal(execucoes, 2, 'fresh=1 deve recalcular uma vez.');

  cache.invalidatePrefix('tenant::simulado::');
  const afterInvalidation = await cache.getOrCreate('tenant::simulado::*', produtor);
  assert.equal(afterInvalidation.source, 'miss');
  assert.equal(execucoes, 3, 'Alteração de resultados deve invalidar o cache.');

  console.log('Simulados V1.12.5: dashboard leve, cache/single-flight, proteção contra 429 e carregamento inicial reduzido aprovados.');
}

executar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
