// backend/routes/api/aph-pdf.js
'use strict';

const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const AphAtendimento = require('../../models/AphAtendimento');
const {
  obterIdentidadeInstitucional,
} = require('../../utils/documentos/identidadeInstitucional');

const {
  desenharCabecalhoPdf,
  desenharRodapePdf,
} = require('../../utils/documentos/cabecalhoPdf');

let Aluno = null;
try { Aluno = require('../../models/Aluno'); } catch {}

const RUBI = '#8B0000';
const DOURADO = '#C9A227';
const CINZA_TEXTO = '#333333';
const CINZA_CLARO = '#f7f7f7';
const PRETO = '#111111';

function pad2(n){ return String(n).padStart(2,'0'); }

function dtBR(din, withHour = true){
  if (!din) return '—';
  const d = (din instanceof Date) ? din : new Date(din);
  if (isNaN(d)) return '—';

  const data = `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
  if (!withHour) return data;
  return `${data} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function texto(v){
  return (v == null || String(v).trim() === '') ? '—' : String(v).trim();
}

function joinArr(arr){
  if (!Array.isArray(arr) || !arr.length) return '—';
  return arr.map(x => (x == null ? '' : String(x).trim())).filter(Boolean).join(', ');
}

function canPopulateAluno(){
  try{ return mongoose.modelNames().includes('Aluno'); } catch { return false; }
}

function pickAlunoNome(item){
  return texto(
    item?.alunoNomeSnapshot ||
    item?.alunoId?.nome ||
    item?.alunoNome ||
    item?.aluno ||
    item?.alunoId
  );
}

function pickTurma(item){
  return texto(
    item?.alunoTurmaSnapshot ||
    item?.alunoId?.turma ||
    item?.turma
  );
}

function pickMatricula(item){
  return texto(
    item?.alunoMatriculaSnapshot ||
    item?.alunoId?.matricula ||
    item?.alunoId?.codigoAcesso ||
    item?.matricula
  );
}

function pickNascimento(item){
  return dtBR(
    item?.alunoNascimentoSnapshot ||
    item?.alunoId?.nascimento ||
    item?.alunoId?.dataNascimento,
    false
  );
}

function valorLocal(item){
  if (item?.local === 'Outro' && item?.localOutro) return item.localOutro;
  return texto(item?.local);
}

function valorClassificacoes(item){
  const base = Array.isArray(item?.classificacoes) && item.classificacoes.length
    ? item.classificacoes
    : item?.tipos;

  let txt = joinArr(base);
  if (item?.classificacaoOutro) {
    txt = txt === '—' ? item.classificacaoOutro : `${txt}; Outro: ${item.classificacaoOutro}`;
  }
  return txt;
}

function valorProvidencias(item){
  let txt = joinArr(item?.providenciasAdotadas);
  if (item?.providenciaOutro) {
    txt = txt === '—' ? item.providenciaOutro : `${txt}; Outro: ${item.providenciaOutro}`;
  }

  if (txt === '—' && item?.procedimentos) return texto(item.procedimentos);
  return txt;
}

function valorEvolucao(item){
  if (item?.evolucaoQuadro === 'Outro' && item?.evolucaoOutro) {
    return item.evolucaoOutro;
  }
  return texto(item?.evolucaoQuadro);
}

function valorDesfecho(item){
  if (item?.desfecho === 'Outro' && item?.desfechoOutro) {
    return item.desfechoOutro;
  }
  return texto(item?.desfecho);
}

function valorMeiosComunicacao(item){
  const meios = item?.comunicacaoPais?.meiosUtilizados;
  if (Array.isArray(meios) && meios.length) return joinArr(meios);
  return texto(item?.meioComunicacao);
}

function headerTema(doc, identidade, titulo, subtitulo){
  const linhaY = desenharCabecalhoPdf(doc, identidade, {
    topo: 18,
    imgTam: 54,
    margemEsq: 36,
    margemDir: 36,
  });

  doc.y = linhaY;

  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor(RUBI)
    .text(titulo || '', {
      align: 'center',
    });

  if (subtitulo) {
    doc.moveDown(0.2);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(CINZA_TEXTO)
      .text(subtitulo, {
        align: 'center',
      });
  }

  doc.moveDown(0.6);
}

function footerTema(doc, identidade){
  desenharRodapePdf(doc, identidade, {
    margemEsq: 32,
    margemDir: 32,
  });

  const W = doc.page.width;
  const H = doc.page.height;
  const bottom = doc.page.margins.bottom || 40;

  const textY = H - bottom + 16;

  doc.fillColor(CINZA_TEXTO)
    .font('Helvetica')
    .fontSize(8)
    .text(`Página ${doc.page.number || ''}`, W - 120, textY, {
      width: 90,
      align: 'right',
      lineBreak: false,
      height: 10
    });
}

function safeAddPage(doc, identidade, titulo, subtitulo){
  footerTema(doc, identidade);
  doc.addPage();
  headerTema(doc, identidade, titulo, subtitulo);
}

function sectionTitle(doc, identidade, title, opts = {}){
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const usableW = doc.page.width - (mL + mR);

  if (doc.y > doc.page.height - 80) {
    safeAddPage(doc, identidade, opts.headerTitle, opts.headerSubtitle);
  }

  doc.moveDown(0.45);

  const y = doc.y;
  doc.save()
    .rect(mL, y, usableW, 22)
    .fill(RUBI)
    .restore();

  doc.fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title, mL + 8, y + 6, {
      width: usableW - 16,
      align: 'left',
      lineBreak: false
    });

  doc.y = y + 28;
}

function writePairs(doc, identidade, pairs, opts = {}){
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const usableW = doc.page.width - (mL + mR);

  const labelW = opts.labelW ?? 145;
  const gap = opts.gap ?? 10;
  const valW = usableW - labelW - gap;
  const linePadY = opts.linePadY ?? 4;

  if (opts.title) {
    sectionTitle(doc, identidade, opts.title, opts);
  }

  pairs.forEach(({ k, v }) => {
    const label = String(k ?? '');
    const val = texto(v);

    const hVal = Math.max(12, doc.heightOfString(val, { width: valW, align: 'left' }));
    const rowH = Math.max(12, hVal) + linePadY * 2;

    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 20) {
      safeAddPage(doc, identidade, opts.headerTitle, opts.headerSubtitle);
    }

    const baseY = doc.y;

    doc.fillColor(PRETO)
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .text(label + ':', mL, baseY + linePadY, {
        width: labelW,
        align: 'left',
        lineBreak: false
      });

    doc.fillColor(CINZA_TEXTO)
      .font('Helvetica')
      .fontSize(10.5)
      .text(val, mL + labelW + gap, baseY + linePadY, {
        width: valW,
        align: 'left'
      });

    doc.y = baseY + rowH;
  });
}

function writeBlock(doc, identidade, title, value, opts = {}){
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const usableW = doc.page.width - (mL + mR);

  const val = texto(value);

  if (doc.y > doc.page.height - 105) {
    safeAddPage(doc, identidade, opts.headerTitle, opts.headerSubtitle);
  }

  if (title) {
    sectionTitle(doc, identidade, title, opts);
  }

  doc.fillColor(CINZA_TEXTO)
    .font('Helvetica')
    .fontSize(10.5)
    .text(val, mL, doc.y, {
      width: usableW,
      align: 'justify'
    });

  doc.moveDown(0.5);
}

function assinaturaLinha(doc, identidade, label, nome = '', funcao = '', opts = {}){
  const mL = doc.page.margins.left;
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  if (doc.y > doc.page.height - 110) {
    safeAddPage(doc, identidade, opts.headerTitle, opts.headerSubtitle);
  }

  doc.moveDown(1.6);

  doc.strokeColor('#444')
    .lineWidth(0.6)
    .moveTo(mL + 40, doc.y)
    .lineTo(mL + usableW - 40, doc.y)
    .stroke();

  doc.moveDown(0.25);

  doc.fillColor(PRETO)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(label, mL, doc.y, { width: usableW, align: 'center' });

  if (nome) {
    doc.font('Helvetica')
      .fontSize(9.5)
      .fillColor(CINZA_TEXTO)
      .text(nome, { align: 'center' });
  }

  if (funcao) {
    doc.font('Helvetica')
      .fontSize(9)
      .fillColor(CINZA_TEXTO)
      .text(`Função: ${funcao}`, { align: 'center' });
  }
}
/* ======================= PDF INDIVIDUAL ======================= */
/* ======================= PDF INDIVIDUAL ======================= */
router.get('/pdf/:id', async (req, res) => {
  try {
    const doPopulate = canPopulateAluno();

    let q = AphAtendimento.findById(req.params.id);

    if (doPopulate) {
      q = q.populate({
        path: 'alunoId',
        select: 'nome turma matricula codigoAcesso nascimento dataNascimento'
      });
    }

    const item = await q.lean();

    const identidade =
  await obterIdentidadeInstitucional(req);

    if (!item) {
      return res.status(404).send('Atendimento não encontrado.');
    }

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, left: 36, right: 36, bottom: 44 }
    });

    const nomeArquivo = `APH_${item.numeroRegistro || String(item._id)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nomeArquivo}"`);

    doc.pipe(res);

    const titulo = 'RELATÓRIO DE OCORRÊNCIA / INTERCORRÊNCIA COM ALUNO';
    const subtitulo = `Registro: ${texto(item.numeroRegistro)} • Gerado em ${dtBR(new Date())}`;

    headerTema(doc, identidade, titulo, subtitulo);

    writePairs(doc, identidade, [
      { k: 'Número do registro', v: item.numeroRegistro },
      { k: 'Data', v: dtBR(item.data, false) },
      { k: 'Horário do início', v: item.horaInicioAtendimento || item.hora },
      { k: 'Horário do encerramento', v: item.horaEncerramentoAtendimento },
      { k: 'Local da ocorrência/intercorrência', v: valorLocal(item) },
    ], {
      title: '1. IDENTIFICAÇÃO DO REGISTRO',
      headerTitle: titulo,
      headerSubtitle: subtitulo,
      labelW: 190
    });

    writePairs(doc, identidade, [
      { k: 'Nome completo', v: pickAlunoNome(item) },
      { k: 'Ano/Série/Turma', v: pickTurma(item) },
      { k: 'Matrícula', v: pickMatricula(item) },
      { k: 'Data de nascimento', v: pickNascimento(item) },
    ], {
      title: '2. IDENTIFICAÇÃO DO ALUNO',
      headerTitle: titulo,
      headerSubtitle: subtitulo,
      labelW: 160
    });

    writePairs(doc, identidade, [
      { k: 'Nome do responsável', v: item.responsavelContato?.nome },
      { k: 'Grau de parentesco/vínculo', v: item.responsavelContato?.vinculo },
      { k: 'Telefone principal', v: item.responsavelContato?.telefonePrincipal },
      { k: 'Telefone secundário', v: item.responsavelContato?.telefoneSecundario },
    ], {
      title: '3. IDENTIFICAÇÃO DO RESPONSÁVEL',
      headerTitle: titulo,
      headerSubtitle: subtitulo,
      labelW: 190
    });

   writeBlock(doc, identidade,  '4. CLASSIFICAÇÃO DA OCORRÊNCIA/INTERCORRÊNCIA', valorClassificacoes(item), {
      headerTitle: titulo,
      headerSubtitle: subtitulo
    });

    writeBlock(doc, identidade, '5. DESCRIÇÃO OBJETIVA DOS FATOS', item.descricaoFatos || item.observacoes, {
      headerTitle: titulo,
      headerSubtitle: subtitulo
    });

    writeBlock(doc, identidade, '6. SINAIS OBSERVADOS E/OU QUEIXA APRESENTADA PELO ALUNO',
      item.sinaisESintomas || item.queixaAluno, {
      headerTitle: titulo,
      headerSubtitle: subtitulo
    });

    writePairs(doc, identidade, [
      { k: 'Providências adotadas', v: valorProvidencias(item) },
      { k: 'Descrição das providências', v: item.descricaoProvidencias || item.procedimentos },
      { k: 'Materiais/recursos utilizados', v: joinArr(item.materiais) },
    ], {
      title: '7. PROVIDÊNCIAS ADOTADAS PELA EQUIPE ESCOLAR',
      headerTitle: titulo,
      headerSubtitle: subtitulo,
      labelW: 190
    });

    writePairs(doc, identidade, [
      { k: 'Tempo de observação', v: item.tempoObservacao },
      { k: 'Evolução observada', v: valorEvolucao(item) },
      { k: 'Descrição complementar', v: item.descricaoEvolucao },
    ], {
      title: '8. TEMPO DE OBSERVAÇÃO E EVOLUÇÃO DO QUADRO',
      headerTitle: titulo,
      headerSubtitle: subtitulo,
      labelW: 190
    });

    writePairs(doc, identidade, [
      { k: 'Houve comunicação', v: item.comunicacaoPais?.houveComunicacao || item.responsaveisInformados },
      { k: 'Data do contato', v: dtBR(item.comunicacaoPais?.dataContato, false) },
      { k: 'Horário do contato', v: item.comunicacaoPais?.horaContato },
      { k: 'Meio utilizado', v: valorMeiosComunicacao(item) },
      { k: 'Nome da pessoa contatada', v: item.comunicacaoPais?.nomePessoaContatada },
      { k: 'Vínculo com o aluno', v: item.comunicacaoPais?.vinculoComAluno },
      { k: 'Houve êxito no contato', v: item.comunicacaoPais?.houveExitoContato },
      { k: 'Síntese da informação prestada', v: item.comunicacaoPais?.sinteseInformacaoPrestada },
      { k: 'Orientação transmitida', v: joinArr(item.comunicacaoPais?.orientacoesTransmitidas) },
      { k: 'Outra orientação', v: item.comunicacaoPais?.orientacaoOutro },
    ], {
      title: '9. COMUNICAÇÃO AOS PAIS OU RESPONSÁVEIS',
      headerTitle: titulo,
      headerSubtitle: subtitulo,
      labelW: 190
    });

    writePairs(doc, identidade, [
      { k: 'Desfecho', v: valorDesfecho(item) },
      { k: 'Descrição do desfecho', v: item.descricaoDesfecho || item.encaminhamento },
      { k: 'Houve encaminhamento', v: item.houveEncaminhamento ? 'Sim' : 'Não' },
      { k: 'Encaminhamento', v: item.encaminhamento },
    ], {
      title: '10. DESFECHO DA OCORRÊNCIA/INTERCORRÊNCIA',
      headerTitle: titulo,
      headerSubtitle: subtitulo,
      labelW: 190
    });

    writeBlock(doc, identidade, '11. OBSERVAÇÕES COMPLEMENTARES', item.observacoes || item.observacao, {
      headerTitle: titulo,
      headerSubtitle: subtitulo
    });

    sectionTitle(doc, identidade, '12. ASSINATURAS', {
      headerTitle: titulo,
      headerSubtitle: subtitulo
    });

    assinaturaLinha(
      doc,
      'Nome do servidor responsável pelo registro',
      item.assinaturas?.servidorResponsavelNome || item.servidorResponsavelRegistro || item.responsavel,
      item.assinaturas?.servidorResponsavelFuncao || item.funcaoServidorResponsavel,
      { headerTitle: titulo, headerSubtitle: subtitulo }
    );

    assinaturaLinha(
      doc,
      'Visto da Direção/Coordenação',
      item.assinaturas?.vistoDirecaoCoordenacaoNome,
      item.assinaturas?.vistoDirecaoCoordenacaoFuncao,
      { headerTitle: titulo, headerSubtitle: subtitulo }
    );

    footerTema(doc);
    doc.end();

  } catch (err) {
    console.error('pdf individual erro:', err);
    try { res.status(500).send('Erro ao gerar PDF individual.'); } catch {}
  }
});

/* ======================= PDF CONSOLIDADO ======================= */
router.get('/pdf-consolidado', async (req, res) => {
  try {
    const { from, to } = req.query;
    const filtro = {};

    if (from) {
      const d = new Date(from);
      if (!isNaN(d)) filtro.data = { ...(filtro.data || {}), $gte: d };
    }

    if (to) {
      const d = new Date(to);
      if (!isNaN(d)) {
        const end = new Date(d);
        end.setDate(end.getDate() + 1);
        filtro.data = { ...(filtro.data || {}), $lt: end };
      }
    }

    const doPopulate = canPopulateAluno();

    let q = AphAtendimento.find(filtro).sort({ data: 1, horaInicioAtendimento: 1, createdAt: 1 });

    if (doPopulate) {
      q = q.populate({
        path: 'alunoId',
        select: 'nome turma matricula codigoAcesso nascimento dataNascimento'
      });
    }

    const itens = await q.lean();

    if (!Array.isArray(itens) || !itens.length) {
      return res.status(404).send('Nenhum atendimento encontrado no período.');
    }

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, left: 32, right: 32, bottom: 40 }
    });

    const nome = `APH-Consolidado_${from || 'inicio'}_a_${to || 'atual'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nome}"`);

    doc.pipe(res);

    const titulo = 'RELATÓRIO CONSOLIDADO DE ATENDIMENTOS APH';
    const subtitulo = `Período: ${from || 'início'} até ${to || 'atual'} • Gerado em ${dtBR(new Date())}`;

    headerTema(doc, identidade, titulo, subtitulo);

    const usableW = doc.page.width - (doc.page.margins.left + doc.page.margins.right);

    const COLS = [
      { key: 'data', title: 'Data', w: 62, lineBreak: false },
      { key: 'reg', title: 'Registro', w: 70 },
      { key: 'aluno', title: 'Aluno', w: 92 },
      { key: 'turma', title: 'Turma', w: 55 },
      { key: 'local', title: 'Local', w: 65 },
      { key: 'class', title: 'Classificação', w: 90 },
      { key: 'desf', title: 'Desfecho', w: 97 },
    ];

    const startX = doc.page.margins.left;
    let y = doc.y;

    function cabecalhoTabela() {
      doc.save().rect(startX, y, usableW, 22).fill(RUBI).restore();

      let x = startX;

      COLS.forEach(c => {
        doc.fillColor('#ffffff')
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text(c.title, x + 4, y + 6, {
            width: c.w - 8,
            align: 'left',
            lineBreak: false
          });

        x += c.w;
      });

      y += 24;
    }

    function linhaTabela(dados, zebra = false) {
      const padX = 4;
      const padY = 4;

      const alturas = COLS.map(c => {
        const txt = String(dados[c.key] ?? '—');
        try {
          const opts = { width: c.w - padX * 2, align: 'left' };
          const h = c.lineBreak === false
            ? 10 + padY * 2
            : Math.max(10, doc.heightOfString(txt, opts)) + padY * 2;

          return Math.max(20, h);
        } catch {
          return 20;
        }
      });

      const rowH = Math.max(20, ...alturas);

      if (y + rowH > doc.page.height - 52) {
        safeAddPage(doc, titulo, subtitulo);
        y = doc.y;
        cabecalhoTabela();
      }

      if (zebra) {
        doc.save().rect(startX, y, usableW, rowH).fill(CINZA_CLARO).restore();
      }

      doc.save()
        .strokeColor('#e5e5e5')
        .lineWidth(0.5)
        .moveTo(startX, y + rowH)
        .lineTo(startX + usableW, y + rowH)
        .stroke()
        .restore();

      let x = startX;

      COLS.forEach(c => {
        const txt = String(dados[c.key] ?? '—');

        doc.fillColor(PRETO)
          .font('Helvetica')
          .fontSize(8.2);

        const opts = {
          width: c.w - padX * 2,
          align: 'left'
        };

        if (c.lineBreak === false) {
          doc.text(txt, x + padX, y + padY, { ...opts, lineBreak: false });
        } else {
          doc.text(txt, x + padX, y + padY, opts);
        }

        x += c.w;
      });

      y += rowH;
    }

    cabecalhoTabela();

    itens.forEach((a, i) => {
      linhaTabela({
        data: dtBR(a.data || a.createdAt, false),
        reg: texto(a.numeroRegistro),
        aluno: pickAlunoNome(a),
        turma: pickTurma(a),
        local: valorLocal(a),
        class: valorClassificacoes(a),
        desf: valorDesfecho(a),
      }, i % 2 === 1);
    });

    if (y > doc.page.height - 90) {
      safeAddPage(doc, titulo, subtitulo);
      y = doc.y;
    }

    doc.y = y + 10;

    doc.fillColor(CINZA_TEXTO)
      .font('Helvetica')
      .fontSize(9)
      .text(
        'Observação: este relatório consolidado apresenta os principais registros de APH no período selecionado. Para consulta integral, emitir o relatório individual do atendimento.',
        startX,
        doc.y,
        { width: usableW, align: 'justify' }
      );

   footerTema(doc, identidade);
    doc.end();

  } catch (err) {
    console.error('pdf consolidado erro (fatal):', err);
    try { res.status(500).send('Erro ao gerar PDF consolidado.'); } catch {}
  }
});

module.exports = router;