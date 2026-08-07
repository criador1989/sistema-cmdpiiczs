'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { lerArquivosNotas } = require('../utils/alamarImport');

async function main() {
  const caminhos = process.argv.slice(2);
  if (!caminhos.length) {
    console.log('SKIP: informe os PDFs após o nome do script para executar o teste completo.');
    return;
  }

  const arquivos = caminhos.map(caminho => ({
    buffer: fs.readFileSync(caminho),
    originalname: path.basename(caminho),
    mimetype: 'application/pdf',
  }));
  const importacao = await lerArquivosNotas({ arquivos, semestre: 1 });
  assert.equal(importacao.formato, 'pdf_simaed_relacao_notas');
  assert(importacao.alunos.length > 0);
  assert(importacao.cabecalhos.length > 0);
  console.log(`OK: ${importacao.alunos.length} alunos e ${importacao.cabecalhos.length} disciplinas extraídos de PDF.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
