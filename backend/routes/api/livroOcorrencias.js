'use strict';

const express = require('express');
const mongoose = require('mongoose');
const {PDFDocument, StandardFonts, rgb} = require('pdf-lib');
const {obterIdentidadeInstitucional} = require('../../utils/documentos/identidadeInstitucional');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Usuario = require('../../models/Usuario');

const router = express.Router();

const LivroOcorrencia = require('../../models/LivroOcorrencia');
const LivroOcorrenciaExportacao = require('../../models/LivroOcorrenciaExportacao');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const { attachActor } = require('../../utils/audit');

function getTenantId(req) {
  return (
    req.tenantId ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.tenant?.id ||
    req.usuario?.tenantId ||
    req.user?.tenantId ||
    req.usuario?.instituicao ||
    req.user?.instituicao ||
    null
  );
}

function buildTenantMatch(tenantId) {
  if (!tenantId) return { _id: null };

  const asStr = String(tenantId);

  const or = [
    { tenant: asStr },
    { tenantId: asStr },
    { instituicao: asStr }
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    or.push({ tenant: oid });
    or.push({ tenantId: oid });
    or.push({ instituicao: oid });
  }

  return { $or: or };
}

function isObjectId(v) {
  return /^[0-9a-fA-F]{24}$/.test(String(v));
}

/* =========================================================
   ESTATÍSTICAS DO LIVRO
========================================================= */

router.get(
  '/estatisticas',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const match = buildTenantMatch(tenantId);

      const registros = await LivroOcorrencia.find(match).lean();

      const stats = {
        total: registros.length,
        registrados: 0,
        emAcompanhamento: 0,
        encaminhados: 0,
        arquivados: 0,
        cancelados: 0,
        atosInfracionais: 0,
        gravissimos: 0,
        porGravidade: {
          leve: 0,
          media: 0,
          grave: 0,
          gravissima: 0
        },
        porNatureza: {
          indisciplina: 0,
          ato_infracional: 0
        },
        porTurma: {},
        porOrgao: {
          conselho_tutelar: 0,
          ministerio_publico: 0,
          delegacia: 0,
          judiciario: 0,
          outro: 0
        }
      };

      for (const r of registros) {
        if (r.status === 'registrado') stats.registrados++;
        if (r.status === 'em_acompanhamento') stats.emAcompanhamento++;
        if (r.status === 'encaminhado') stats.encaminhados++;
        if (r.status === 'arquivado') stats.arquivados++;
        if (r.status === 'cancelado') stats.cancelados++;

        if (r.natureza === 'ato_infracional') stats.atosInfracionais++;
        if (r.gravidade === 'gravissima') stats.gravissimos++;

        if (stats.porGravidade[r.gravidade] !== undefined) {
          stats.porGravidade[r.gravidade]++;
        }

        if (stats.porNatureza[r.natureza] !== undefined) {
          stats.porNatureza[r.natureza]++;
        }

        const turma = r.aluno?.turma || 'Sem turma';
        stats.porTurma[turma] = (stats.porTurma[turma] || 0) + 1;

        const orgao =
          r.marcadores?.orgaoEncaminhamento ||
          r.movimentacoes?.find(m => m.tipo === 'encaminhamento')?.orgaoDestino ||
          '';

        if (orgao && stats.porOrgao[orgao] !== undefined) {
          stats.porOrgao[orgao]++;
        } else if (orgao) {
          stats.porOrgao.outro++;
        }
      }

      return res.json(stats);
    } catch (err) {
      console.error('[LIVRO_OCORRENCIAS][ESTATISTICAS]', err);

      return res.status(500).json({
        message: 'Erro ao carregar estatísticas do Livro de Ocorrências.'
      });
    }
  }
);
/* =========================================================
   SINCRONIZAR PROCEDIMENTOS ANTIGOS COM O LIVRO
========================================================= */

router.post(
  '/sincronizar-processos',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const ProcessoDisciplinar = require('../../models/ProcessoDisciplinar');

      const {
        registrarProcessoNoLivro
      } = require('../../utils/livroOcorrencias');

      const tenantId = getTenantId(req);

      const processos = await ProcessoDisciplinar.find({
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      })
        .populate('aluno')
        .lean(false);

      let criados = 0;
      let jaExistiam = 0;
      let erros = 0;

      for (const processo of processos) {
        try {
          const existente = await LivroOcorrencia.findOne({
            ...buildTenantMatch(tenantId),
            processo: processo._id
          }).lean();

          if (existente) {
            jaExistiam++;
            continue;
          }

          await registrarProcessoNoLivro(
            processo,
            req
          );

          criados++;
        } catch (errItem) {
          erros++;

          console.error(
            '[LIVRO_OCORRENCIAS][SYNC_ITEM]',
            processo?._id,
            errItem
          );
        }
      }

      return res.json({
        ok: true,
        totalProcessos: processos.length,
        criados,
        jaExistiam,
        erros
      });

    } catch (err) {
      console.error(
        '[LIVRO_OCORRENCIAS][SINCRONIZAR]',
        err
      );

      return res.status(500).json({
        message:
          'Erro ao sincronizar procedimentos antigos com o Livro Digital.'
      });
    }
  }
);
/* =========================================================
   LISTAR REGISTROS
========================================================= */

router.get(
  '/',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const match = buildTenantMatch(tenantId);

      const {
        busca = '',
        status = '',
        natureza = '',
        gravidade = '',
        ano = '',
        limite = 100
      } = req.query || {};

      const filtro = {
        ...match
      };

      if (status) filtro.status = status;
      if (natureza) filtro.natureza = natureza;
      if (gravidade) filtro.gravidade = gravidade;
      if (ano) filtro.ano = Number(ano);

      if (busca) {
        const rx = new RegExp(String(busca).trim(), 'i');

        filtro.$and = [
          {
            $or: [
              { numeroLivro: rx },
              { numeroProcesso: rx },
              { 'aluno.nome': rx },
              { 'aluno.turma': rx },
              { 'responsavel.nome': rx },
              { 'fato.local': rx },
              { 'fato.descricao': rx },
              { classificacaoOcorrencia: rx }
            ]
          }
        ];
      }

      const registros = await LivroOcorrencia.find(filtro)
        .sort({ ano: -1, sequencial: -1, createdAt: -1 })
        .limit(Math.min(Number(limite) || 100, 500))
        .lean();

      return res.json(registros);
    } catch (err) {
      console.error('[LIVRO_OCORRENCIAS][LISTAR]', err);

      return res.status(500).json({
        message: 'Erro ao listar Livro de Ocorrências.'
      });
    }
  }
);
/* =========================================================
   EXPORTAR LIVRO DIGITAL
========================================================= */

router.get(
  '/exportar',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {

    try {

      const tenantId = getTenantId(req);

      const {
        ano = '',
        status = '',
        natureza = '',
        gravidade = ''
      } = req.query || {};

      const filtro = {
        ...buildTenantMatch(tenantId)
      };

      if (ano) {
        filtro.ano = Number(ano);
      }

      if (status) {
        filtro.status = status;
      }

      if (natureza) {
        filtro.natureza = natureza;
      }

      if (gravidade) {
        filtro.gravidade = gravidade;
      }

      const registros =
        await LivroOcorrencia.find(filtro)
          .sort({
            ano: 1,
            sequencial: 1
          })
          .lean();

      const total = registros.length;

      const html = `

<!DOCTYPE html>
<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<title>
Livro Digital de Ocorrências
</title>

<style>

body{
  font-family:Arial,sans-serif;
  padding:40px;
  color:#111;
}

h1{
  text-align:center;
  margin-bottom:6px;
}

.sub{
  text-align:center;
  color:#555;
  margin-bottom:30px;
}

table{
  width:100%;
  border-collapse:collapse;
  margin-top:20px;
}

th{
  background:#f2f2f2;
}

th,td{
  border:1px solid #ccc;
  padding:10px;
  font-size:13px;
  vertical-align:top;
}

.badge{
  padding:4px 8px;
  border-radius:999px;
  font-size:12px;
  font-weight:bold;
}

.footer{
  margin-top:40px;
  font-size:12px;
  color:#666;
}

</style>

</head>

<body>

<h1>
Livro Digital de Ocorrências
</h1>

<div class="sub">
Exportação institucional • Axoriin
</div>

<div>
<strong>Total de registros:</strong>
${total}
</div>

<div>
<strong>Gerado em:</strong>
${new Date().toLocaleString('pt-BR')}
</div>

<table>

<thead>

<tr>
<th>Livro</th>
<th>Processo</th>
<th>Aluno</th>
<th>Turma</th>
<th>Natureza</th>
<th>Gravidade</th>
<th>Status</th>
<th>Atualização</th>
</tr>

</thead>

<tbody>

${registros.map(r => `

<tr>

<td>
${r.numeroLivro || '-'}
</td>

<td>
${r.numeroProcesso || '-'}
</td>

<td>
${r.aluno?.nome || '-'}
</td>

<td>
${r.aluno?.turma || '-'}
</td>

<td>
${r.natureza || '-'}
</td>

<td>
${r.gravidade || '-'}
</td>

<td>
${r.status || '-'}
</td>

<td>
${
  r.updatedAt
    ? new Date(r.updatedAt)
        .toLocaleString('pt-BR')
    : '-'
}
</td>

</tr>

`).join('')}

</tbody>

</table>

<div class="footer">

Documento exportado automaticamente pelo
Axoriin • Livro Digital de Ocorrências.

</div>

</body>
</html>

      `;

      res.setHeader(
        'Content-Type',
        'text/html; charset=utf-8'
      );

      res.setHeader(
        'Content-Disposition',
        `inline; filename="livro-digital-${Date.now()}.html"`
      );

      return res.send(html);

    } catch (err) {

      console.error(
        '[LIVRO_OCORRENCIAS][EXPORTAR]',
        err
      );

      return res.status(500).json({
        message:
          'Erro ao exportar Livro Digital.'
      });

    }

  }
);
/* =========================================================
   EXPORTAR LIVRO DIGITAL EM PDF
========================================================= */

router.get(
  '/exportar-pdf',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {

    try {

      const tenantId = getTenantId(req);
      const identidade =
  await obterIdentidadeInstitucional(req);

const nomeInstituicao =
  identidade.nomeInstituicao ||
  'Instituição';

const orgaoSuperior =
  identidade.orgaoSuperior || '';

const rodapeInstitucional =
  identidade.rodapeInstitucional ||
  identidade.rodapePadrao ||
  'Documento institucional gerado eletronicamente pela plataforma Axoriin.';

      const {
        ano = '',
        status = '',
        natureza = '',
        gravidade = ''
      } = req.query || {};

      const filtro = {
        ...buildTenantMatch(tenantId)
      };

      if (ano) filtro.ano = Number(ano);
      if (status) filtro.status = status;
      if (natureza) filtro.natureza = natureza;
      if (gravidade) filtro.gravidade = gravidade;

      const registros =
        await LivroOcorrencia.find(filtro)
          .sort({
            ano: 1,
            sequencial: 1
          })
          .lean();
          const exportadoEm = new Date();

const hashExportacao = crypto
  .createHash('sha256')
  .update(JSON.stringify({
    tenantId: String(tenantId || ''),
    filtros: {
      ano,
      status,
      natureza,
      gravidade
    },
    total: registros.length,
    registros: registros.map(r => ({
      numeroLivro: r.numeroLivro,
      numeroProcesso: r.numeroProcesso,
      aluno: r.aluno?.nome,
      turma: r.aluno?.turma,
      natureza: r.natureza,
      gravidade: r.gravidade,
      status: r.status,
      updatedAt: r.updatedAt,
      homologacao: r.homologacao || null
    })),
    exportadoEm
  }))
  .digest('hex');
  const usuario =
  req.usuario ||
  req.user ||
  {};

await LivroOcorrenciaExportacao.create({

  tenant:
    String(tenantId || 'default'),

  hash:
    hashExportacao,

  exportadoEm,

  exportadoPor:
    usuario._id ||
    usuario.id ||
    null,

  exportadoPorNome:
    usuario.nome ||
    usuario.name ||
    usuario.email ||
    'Sistema',

  filtros: {
    ano,
    status,
    natureza,
    gravidade
  },

  totalRegistros:
    registros.length,

  metadados: {
    registros: registros.map(r => ({
      numeroLivro:
        r.numeroLivro,

      numeroProcesso:
        r.numeroProcesso,

      aluno:
        r.aluno?.nome || '',

      status:
        r.status || ''
    }))
  }

});

      const pdfDoc =
        await PDFDocument.create();

      const baseUrl =
        `${req.protocol}://${req.get('host')}`;

      const validacaoUrl =
  `${baseUrl}/verificar-livro-digital.html?hash=${hashExportacao}`;

      const qrDataUrl =
        await QRCode.toDataURL(validacaoUrl, {
          margin: 1,
          width: 220,
          color: {
            dark: '#001018',
            light: '#FFFFFF'
          }
        });

      const qrImageBytes =
        Buffer.from(
          qrDataUrl.split(',')[1],
          'base64'
        );

      const qrImage =
        await pdfDoc.embedPng(qrImageBytes);

      const font =
        await pdfDoc.embedFont(StandardFonts.Helvetica);

      const fontBold =
        await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const pageSize = [595, 842];

      let page =
        pdfDoc.addPage(pageSize);

      let y = 790;

      function texto(txt) {
        return String(txt || '-')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function cortar(txt, max = 38) {
        const t = texto(txt);

        return t.length > max
          ? t.slice(0, max - 3) + '...'
          : t;
      }

      function drawText(
        txt,
        x,
        yy,
        size = 9,
        bold = false
      ) {

        page.drawText(texto(txt), {
          x,
          y: yy,
          size,
          font:
            bold
              ? fontBold
              : font,

          color:
            rgb(0.05, 0.07, 0.10)
        });

      }

      function drawWrappedText(
        txt,
        x,
        yy,
        maxWidth,
        size = 9,
        bold = false,
        lineHeight = 13
      ) {

        const words =
          texto(txt).split(' ');

        let line = '';

        let currentY = yy;

        const usedFont =
          bold
            ? fontBold
            : font;

        for (const word of words) {

          const testLine =
            line
              ? `${line} ${word}`
              : word;

          const width =
            usedFont.widthOfTextAtSize(
              testLine,
              size
            );

          if (
            width > maxWidth &&
            line
          ) {

            page.drawText(line, {
              x,
              y: currentY,
              size,
              font: usedFont,
              color:
                rgb(0.05, 0.07, 0.10)
            });

            line = word;

            currentY -= lineHeight;

          } else {

            line = testLine;

          }

        }

        if (line) {

          page.drawText(line, {
            x,
            y: currentY,
            size,
            font: usedFont,
            color:
              rgb(0.05, 0.07, 0.10)
          });

          currentY -= lineHeight;

        }

        return currentY;

      }

      function desenharCabecalho() {
  // cabeçalho institucional desenhado manualmente abaixo
} {

        page.drawRectangle({
          x: 0,
          y: 760,
          width: 595,
          height: 82,
          color:
            rgb(0.04, 0.10, 0.18)
        });

        page.drawText(
          'COLÉGIO MILITAR DOM PEDRO II',
          {
            x: 42,
            y: 810,
            size: 10,
            font: fontBold,
            color:
              rgb(0.90, 0.96, 1)
          }
        );

        page.drawText(
          'LIVRO DIGITAL DE OCORRÊNCIAS',
          {
            x: 42,
            y: 785,
            size: 15,

            font: fontBold,

            color:
              rgb(1, 1, 1)
          }
        );

        page.drawText(
          'Axoriin - Sistema Institucional',
          {
            x: 42,
            y: 767,
            size: 8,
            font,
            color:
              rgb(0.75, 0.85, 0.90)
          }
        );

      }

      function novaPagina() {

        page =
          pdfDoc.addPage(pageSize);

        y = 790;

        desenharCabecalho(false);

      }

      desenharCabecalho(true);

      page.drawImage(qrImage, {
        x: 455,
        y: 650,
        width: 90,
        height: 90
      });

      drawText(
        'VALIDAÇÃO',
        468,
        640,
        8,
        true
      );

      page.drawRectangle({
  x: 0,
  y: 748,
  width: 595,
  height: 82,
  color: rgb(0.06, 0.12, 0.22)
});

page.drawText(
  String(orgaoSuperior).toUpperCase(),
  {
    x: 42,
    y: 805,
    size: 8,
    font: fontBold,
    color: rgb(0.92, 0.96, 1)
  }
);

page.drawText(
  String(nomeInstituicao).toUpperCase(),
  {
    x: 42,
    y: 787,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1)
  }
);

page.drawText(
  'LIVRO DIGITAL DE OCORRÊNCIAS',
  {
    x: 42,
    y: 765,
    size: 15,
    font: fontBold,
    color: rgb(1, 1, 1)
  }
);

y = 720;

drawText(
  'Exportação oficial dos registros institucionais',
  42,
  y,
  13,
  true
);

      y -= 24;

      drawText(
        `Total de registros: ${registros.length}`,
        42,
        y,
        11,
        true
      );

      y -= 18;

      drawText(
        `Gerado em: ${exportadoEm.toLocaleString('pt-BR')}`,
        42,
        y,
        10
      );

      y -= 30;

      drawText(
        'TERMO DE ABERTURA',
        42,
        y,
        12,
        true
      );

      y -= 24;

      y = drawWrappedText(
        'Este Livro Digital de Ocorrências contém os registros oficiais dos procedimentos administrativos disciplinares instaurados pela instituição, armazenados eletronicamente por meio do sistema Axoriin.',
        42,
        y,
        500,
        9,
        false,
        14
      );

      y -= 4;

      y = drawWrappedText(
        'Os registros constantes neste documento possuem caráter institucional, administrativo e disciplinar, mantendo integridade documental, rastreabilidade e controle cronológico.',
        42,
        y,
        500,
        9,
        false,
        14
      );

      y -= 4;

      drawText(
        `Quantidade total de registros constantes nesta exportação: ${registros.length}.`,
        42,
        y,
        9
      );

      y -= 34;

      function desenharHeaderTabela() {

        page.drawRectangle({
          x: 36,
          y: y - 6,
          width: 523,
          height: 22,
          color:
            rgb(0.92, 0.95, 0.97)
        });

        drawText('Livro', 42, y, 8, true);
        drawText('Processo', 118, y, 8, true);
        drawText('Aluno', 196, y, 8, true);
        drawText('Turma', 335, y, 8, true);
        drawText('Grav.', 385, y, 8, true);
        drawText('Status', 435, y, 8, true);
        drawText('Atualização', 500, y, 8, true);

        y -= 24;

      }

      desenharHeaderTabela();

      if (!registros.length) {

        drawText(
          'Nenhum registro encontrado.',
          42,
          y,
          10
        );

        y -= 20;

      }

      for (const r of registros) {

  if (y < 160) {
    novaPagina();
    desenharHeaderTabela();
  }

  page.drawLine({
    start: { x: 36, y: y - 7 },
    end: { x: 559, y: y - 7 },
    thickness: 0.5,
    color: rgb(0.82, 0.86, 0.90)
  });

  drawText(cortar(r.numeroLivro, 14), 42, y, 7.5);
  drawText(cortar(r.numeroProcesso, 18), 118, y, 7.5);
  drawText(cortar(r.aluno?.nome, 24), 196, y, 7.5);
  drawText(cortar(r.aluno?.turma, 8), 335, y, 7.5);
  drawText(cortar(r.gravidade, 12), 385, y, 7.5);
  drawText(cortar(r.status, 14), 435, y, 7.5);

  drawText(
    r.updatedAt
      ? new Date(r.updatedAt).toLocaleDateString('pt-BR')
      : '-',
    500,
    y,
    7.5
  );

  y -= 18;

  if (r.homologacao?.homologado) {

    page.drawRectangle({
      x: 42,
      y: y - 4,
      width: 500,
      height: 42,
      color: rgb(0.93, 0.98, 0.94)
    });

    drawText(
      'REGISTRO HOMOLOGADO INSTITUCIONALMENTE',
      52,
      y + 24,
      7,
      true
    );

    drawText(
      `Por: ${cortar(r.homologacao?.homologadoPorNome, 35)}`,
      52,
      y + 12,
      6.5
    );

    if (r.homologacao?.observacao) {
      drawText(
        `Obs: ${cortar(r.homologacao.observacao, 60)}`,
        52,
        y,
        6.5
      );
    }

    y -= 50;
  }

  if (
    Array.isArray(r.assinaturas) &&
    r.assinaturas.length
  ) {

    for (const assinatura of r.assinaturas) {

      if (y < 130) {
        novaPagina();
        desenharHeaderTabela();
      }

      page.drawRectangle({
        x: 42,
        y: y - 4,
        width: 500,
        height: 54,
        color: rgb(0.90, 0.96, 0.99)
      });

      drawText(
        'DOCUMENTO ASSINADO ELETRONICAMENTE',
        52,
        y + 36,
        7,
        true
      );

      drawText(
        `Por: ${cortar(assinatura.assinadoPorNome, 42)}`,
        52,
        y + 24,
        6.5
      );

      drawText(
        `Cargo/Função: ${cortar(assinatura.cargo, 42)}`,
        52,
        y + 12,
        6.5
      );

      drawText(
        assinatura.assinadoEm
          ? `Data: ${new Date(assinatura.assinadoEm).toLocaleString('pt-BR')}`
          : 'Data: -',
        52,
        y,
        6.5
      );

      drawText(
        `Hash: ${cortar(assinatura.hashRegistro, 64)}`,
        260,
        y,
        6
      );

      y -= 64;
    }
  }
}

      if (y < 180) {

        novaPagina();

      }

      y -= 10;

      page.drawLine({
        start: { x: 42, y },
        end: { x: 550, y },
        thickness: 1,
        color:
          rgb(0.75, 0.80, 0.84)
      });

      y -= 28;

      drawText(
        'TERMO DE ENCERRAMENTO',
        42,
        y,
        12,
        true
      );

      y -= 24;

      y = drawWrappedText(
        'Nada mais havendo a registrar nesta exportação institucional do Livro Digital de Ocorrências, lavra-se o presente termo para fins de controle administrativo, disciplinar e documental.',
        42,
        y,
        500,
        9,
        false,
        14
      );

      y -= 4;

      y = drawWrappedText(
        'Os registros acima permanecem armazenados eletronicamente no sistema Axoriin, vinculados aos respectivos procedimentos administrativos disciplinares da instituição.',
        42,
        y,
        500,
        9,
        false,
        14
      );

      y -= 10;

      drawText(
        `Documento encerrado em ${exportadoEm.toLocaleString('pt-BR')}.`,
        42,
        y,
        9
      );

      y -= 44;

      drawText(
        '______________________________________________',
        42,
        y,
        9
      );

      y -= 16;

      drawText(
        'Coordenação / Direção Institucional',
        42,
        y,
        9
      );

      const pages =
        pdfDoc.getPages();

      pages.forEach((p, index) => {

        const { width } =
          p.getSize();

        p.drawText(
          `Página ${index + 1} de ${pages.length}`,
          {
            x: width / 2 - 35,
            y: 24,
            size: 8,
            font,
            color:
              rgb(0.35, 0.40, 0.45)
          }
        );

       p.drawText(
  'Documento gerado automaticamente pelo Axoriin',
  {
    x: 42,
    y: 24,
    size: 7,
    font,
    color:
      rgb(0.35, 0.40, 0.45)
  }
);

p.drawText(
  `Hash da exportação: ${hashExportacao}`,
  {
    x: 320,
    y: 24,
    size: 6,
    font,
    color:
      rgb(0.35, 0.40, 0.45)
  }
);

});

      const pdfBytes =
        await pdfDoc.save();

      res.setHeader(
        'Content-Type',
        'application/pdf'
      );

      res.setHeader(
        'Content-Disposition',
        `inline; filename="livro-digital-ocorrencias-${Date.now()}.pdf"`
      );

      return res.send(
        Buffer.from(pdfBytes)
      );

    } catch (err) {

      console.error(
        '[LIVRO_OCORRENCIAS][EXPORTAR_PDF]',
        err
      );

      return res.status(500).json({
        message:
          'Erro ao exportar Livro Digital em PDF.'
      });

    }

  }
);
/* =========================================================
   VALIDAR DOCUMENTO POR HASH
========================================================= */

router.get(
  '/validar-hash',
  async (req, res) => {

    try {

      const { hash = '' } = req.query || {};

      if (!hash) {
        return res.status(400).json({
          ok: false,
          message: 'Hash não informado.'
        });
      }
      const exportacao =
       await LivroOcorrenciaExportacao.findOne({
        hash
    }).lean();
      const registro =
        await LivroOcorrencia.findOne({
          $or: [
            { hashDossieAtual: hash },
            {
              documentos: {
                $elemMatch: {
                  hash
                }
              }
            }
          ]
        }).lean();

      if (!registro && !exportacao) {

  return res.status(404).json({
    ok: false,
    valido: false,
    message:
      'Documento não localizado no sistema.'
  });

}
if (exportacao) {

  return res.json({

    ok: true,
    valido: true,

    tipo:
      'exportacao_livro_digital',

    exportacao: {

      hash:
        exportacao.hash,

      exportadoEm:
        exportacao.exportadoEm,

      exportadoPor:
        exportacao.exportadoPorNome,

      totalRegistros:
        exportacao.totalRegistros,

      filtros:
        exportacao.filtros || {}

    }

  });

}

      const documento =
        Array.isArray(registro.documentos)
          ? registro.documentos.find(
              d => d.hash === hash
            )
          : null;

      return res.json({

        ok: true,
        valido: true,

        registro: {

          numeroLivro:
            registro.numeroLivro || '',

          numeroProcesso:
            registro.numeroProcesso || '',

          aluno:
            registro.aluno?.nome || '',

          turma:
            registro.aluno?.turma || '',

          natureza:
            registro.natureza || '',

          gravidade:
            registro.gravidade || '',

          status:
            registro.status || '',

          atualizadoEm:
            registro.updatedAt || null,

          hash:
            hash,

          documento: documento
            ? {
                titulo:
                  documento.titulo || '',

                tipo:
                  documento.tipo || '',

                geradoEm:
                  documento.geradoEm || null
              }
            : null

        }

      });

    } catch (err) {

      console.error(
        '[LIVRO_OCORRENCIAS][VALIDAR_HASH]',
        err
      );

      return res.status(500).json({
        ok: false,
        valido: false,
        message:
          'Erro ao validar documento.'
      });

    }

  }
);

/* =========================================================
   HOMOLOGAR REGISTRO DO LIVRO DIGITAL
========================================================= */

router.post(
  '/:id/homologar',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {

    try {

      const tenantId = getTenantId(req);

      const { id } = req.params;

      const {
        observacao = ''
      } = req.body || {};

      if (!isObjectId(id)) {
        return res.status(400).json({
          ok: false,
          message: 'ID inválido.'
        });
      }

      const registro =
        await LivroOcorrencia.findOne({
          _id: id,
          ...buildTenantMatch(tenantId)
        });

      if (!registro) {

        return res.status(404).json({
          ok: false,
          message:
            'Registro não encontrado.'
        });

      }

      const usuario =
        req.usuario ||
        req.user ||
        {};

      registro.homologacao = {

        homologado: true,

        homologadoEm:
          new Date(),

        homologadoPor:
          usuario._id ||
          usuario.id ||
          null,

        homologadoPorNome:
          usuario.nome ||
          usuario.name ||
          usuario.email ||
          'Sistema',

        observacao:
          observacao || ''

      };

      registro.movimentacoes.push({

        tipo: 'observacao',

        titulo:
          'Registro homologado institucionalmente',

        descricao:
          observacao ||
          'Homologação institucional realizada.',

        registradoPor:
          usuario._id ||
          usuario.id ||
          null,

        registradoPorNome:
          usuario.nome ||
          usuario.name ||
          usuario.email ||
          'Sistema',

        registradoEm:
          new Date()

      });

      await registro.save();

      return res.json({
        ok: true,
        message:
          'Registro homologado com sucesso.',
        homologacao:
          registro.homologacao
      });

    } catch (err) {

      console.error(
        '[LIVRO_OCORRENCIAS][HOMOLOGAR]',
        err
      );

      return res.status(500).json({
        ok: false,
        message:
          'Erro ao homologar registro.'
      });

    }

  }
);

/* =========================================================
   ASSINAR REGISTRO DO LIVRO DIGITAL
========================================================= */

router.post(
  '/:id/assinar',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const {
        senha = '',
        tipo = 'outro',
        cargo = '',
        observacao = ''
      } = req.body || {};

      if (!isObjectId(id)) {
        return res.status(400).json({
          ok: false,
          message: 'ID inválido.'
        });
      }

      if (!senha) {
        return res.status(400).json({
          ok: false,
          message: 'Informe sua senha para confirmar a assinatura.'
        });
      }

      const usuarioReq = req.usuario || req.user || {};
      const usuarioId = usuarioReq._id || usuarioReq.id;

      if (!usuarioId) {
        return res.status(401).json({
          ok: false,
          message: 'Usuário autenticado não identificado.'
        });
      }

      const usuario = await Usuario
  .findById(usuarioId)
  .select('+senha')
  .lean();

      if (!usuario) {
        return res.status(404).json({
          ok: false,
          message: 'Usuário não encontrado.'
        });
      }

      const hashSenha =
  usuario.senha ||
  usuario.password ||
  usuario.senhaHash ||
  usuario.hashSenha ||
  usuario.passwordHash ||
  usuario.senha_hash ||
  usuario.senhaCriptografada ||
  usuario.credenciais?.senha ||
  usuario.auth?.senha ||
  '';

      if (!hashSenha) {
        return res.status(400).json({
          ok: false,
          message: 'Usuário não possui senha válida para assinatura.'
        });
      }

      const senhaValida = await bcrypt.compare(
        senha,
        hashSenha
      );

      if (!senhaValida) {
        return res.status(401).json({
          ok: false,
          message: 'Senha inválida. Assinatura não realizada.'
        });
      }

      const registro = await LivroOcorrencia.findOne({
        _id: id,
        ...buildTenantMatch(tenantId)
      });

      if (!registro) {
        return res.status(404).json({
          ok: false,
          message: 'Registro não encontrado.'
        });
      }

      const hashRegistro = crypto
        .createHash('sha256')
        .update(JSON.stringify({
          registroId: String(registro._id),
          numeroLivro: registro.numeroLivro,
          numeroProcesso: registro.numeroProcesso,
          status: registro.status,
          documentos: registro.documentos || [],
          movimentacoes: registro.movimentacoes || [],
          assinadoPor: String(usuario._id),
          assinadoEm: new Date().toISOString()
        }))
        .digest('hex');

      const assinatura = {
        tipo,
        assinadoPor: usuario._id,
        assinadoPorNome:
          usuario.nome ||
          usuario.name ||
          usuario.email ||
          'Usuário',

        cargo:
          cargo ||
          usuario.cargo ||
          usuario.funcao ||
          usuario.perfil ||
          usuario.tipo ||
          'Usuário institucional',

        observacao,
        hashRegistro,

        ip:
          req.ip ||
          req.headers['x-forwarded-for'] ||
          '',

        userAgent:
          req.headers['user-agent'] ||
          '',

        assinadoEm:
          new Date()
      };

      registro.assinaturas = registro.assinaturas || [];
      registro.assinaturas.push(assinatura);
      registro.markModified('assinaturas');

      registro.movimentacoes.push({
        tipo: 'observacao',
        titulo: 'Registro assinado eletronicamente',
        descricao:
          `Assinatura eletrônica realizada por ${assinatura.assinadoPorNome}.`,
        registradoPor: usuario._id,
        registradoPorNome: assinatura.assinadoPorNome,
        registradoEm: new Date()
      });

      await registro.save();

      return res.json({
        ok: true,
        message: 'Registro assinado eletronicamente com sucesso.',
        assinatura
      });

    } catch (err) {
      console.error(
        '[LIVRO_OCORRENCIAS][ASSINAR]',
        err
      );

      return res.status(500).json({
        ok: false,
        message: 'Erro ao assinar registro.'
      });
    }
  }
);

/* =========================================================
   DETALHAR REGISTRO
========================================================= */

router.get(
  '/:id',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      if (!isObjectId(id)) {
        return res.status(400).json({
          message: 'ID inválido.'
        });
      }

      const registro = await LivroOcorrencia.findOne({
        _id: id,
        ...buildTenantMatch(tenantId)
      }).lean();

      if (!registro) {
        return res.status(404).json({
          message: 'Registro do Livro de Ocorrências não encontrado.'
        });
      }

      return res.json(registro);
    } catch (err) {
      console.error('[LIVRO_OCORRENCIAS][DETALHAR]', err);

      return res.status(500).json({
        message: 'Erro ao detalhar registro do Livro de Ocorrências.'
      });
    }
  }
);

module.exports = router;