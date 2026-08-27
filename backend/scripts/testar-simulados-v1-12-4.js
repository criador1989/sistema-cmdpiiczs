'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {
  enfileirarProcessamentoOmr,
  MAX_OMR_RUNTIME_MS,
} = require('../services/simulados/simuladoOmrService');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  assert.ok(MAX_OMR_RUNTIME_MS >= 10 * 60 * 1000, 'O limite de segurança do worker não pode continuar preso aos oito minutos HTTP.');

  const ordem = [];
  const primeiro = enfileirarProcessamentoOmr(async () => {
    ordem.push('inicio-1');
    await wait(40);
    ordem.push('fim-1');
    return 1;
  });
  const segundo = enfileirarProcessamentoOmr(async () => {
    ordem.push('inicio-2');
    await wait(5);
    ordem.push('fim-2');
    return 2;
  });
  const valores = await Promise.all([primeiro, segundo]);
  assert.deepEqual(valores, [1, 2]);
  assert.deepEqual(ordem, ['inicio-1', 'fim-1', 'inicio-2', 'fim-2'], 'A fila OMR precisa manter somente um leitor pesado por processo.');

  const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'api', 'simulados.js'), 'utf8');
  const model = fs.readFileSync(path.join(__dirname, '..', 'models', 'SimuladoImportacao.js'), 'utf8');
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'public', 'simulados', 'simulados.js'), 'utf8');
  const extractor = fs.readFileSync(path.join(__dirname, '..', 'pdf', 'extrair_cartoes_simulado.py'), 'utf8');

  assert.match(route, /status:\s*'analisando'/);
  assert.match(route, /res\.status\(202\)/);
  assert.match(route, /executarProcessamentoOmrAssincrono/);
  assert.match(route, /multer\.diskStorage/);
  assert.match(route, /axoriin-upload-omr-/);
  assert.match(route, /status:\s*\{\s*\$in:\s*\['analisando',\s*'analisada'\]/);
  assert.match(model, /'analisando'/);
  assert.match(model, /progressoOmr/);
  assert.match(frontend, /monitorOmrProcess/);
  assert.match(frontend, /Lendo cartões:/);
  assert.match(extractor, /"tipo": "progresso"/);
  assert.doesNotMatch(route, /ultrapassou oito minutos/);

  console.log('Simulados V1.12.4: OMR assíncrono, fila exclusiva, progresso por página e proteção do dashboard aprovados.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
