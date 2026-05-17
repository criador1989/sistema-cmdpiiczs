const fs = require('fs');
const path = require('path');

function resolverImagemLocal(url) {
  if (!url || typeof url !== 'string') return null;

  const limpa = url.trim();

  if (!limpa.startsWith('/uploads/')) {
    return null;
  }

  const relativo = limpa.replace(/^\/uploads\//, '');
  const caminho = path.join(__dirname, '../../uploads', relativo);

  if (!fs.existsSync(caminho)) {
    return null;
  }

  return caminho;
}

function desenharCabecalhoPdf(doc, identidade = {}, opcoes = {}) {
  const margemEsq = opcoes.margemEsq || 40;
  const margemDir = opcoes.margemDir || 40;
  const topo = opcoes.topo || 32;
  const larguraPagina =
    doc.page?.width || 595.28;

  const larguraUtil = larguraPagina - margemEsq - margemDir;

  const imgTam = opcoes.imgTam || 58;
  const centroX = larguraPagina / 2;

  const brasaoEsquerdo = resolverImagemLocal(identidade.brasaoEsquerdoUrl);
  const brasaoDireito = resolverImagemLocal(identidade.brasaoDireitoUrl);

  if (identidade.mostrarBrasaoEsquerdo && brasaoEsquerdo) {
    try {
      doc.image(brasaoEsquerdo, margemEsq, topo, {
        fit: [imgTam, imgTam],
        align: 'center',
        valign: 'center',
      });
    } catch (e) {
      console.warn('[CABECALHO-PDF][BRASAO-ESQ]', e.message);
    }
  }

  if (identidade.mostrarBrasaoDireito && brasaoDireito) {
    try {
      doc.image(brasaoDireito, larguraPagina - margemDir - imgTam, topo, {
        fit: [imgTam, imgTam],
        align: 'center',
        valign: 'center',
      });
    } catch (e) {
      console.warn('[CABECALHO-PDF][BRASAO-DIR]', e.message);
    }
  }

  const textoX = margemEsq + imgTam + 10;
  const textoW = larguraUtil - imgTam * 2 - 20;

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#111827')
    .text(String(identidade.orgaoSuperior || '').toUpperCase(), textoX, topo + 2, {
      width: textoW,
      align: 'center',
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#111827')
    .text(String(identidade.nomeInstituicao || '').toUpperCase(), textoX, topo + 25, {
      width: textoW,
      align: 'center',
    });

  if (identidade.subtitulo) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#374151')
      .text(String(identidade.subtitulo), textoX, topo + 42, {
        width: textoW,
        align: 'center',
      });
  }

  const linhaY = topo + imgTam + 12;

  doc
    .moveTo(margemEsq, linhaY)
    .lineTo(larguraPagina - margemDir, linhaY)
    .lineWidth(1)
    .strokeColor('#111827')
    .stroke();

  doc.fillColor('#111827');

  return linhaY + 22;
}

function desenharRodapePdf(doc, identidade = {}, opcoes = {}) {
  if (identidade.mostrarRodape === false) return;

  const texto = String(identidade.rodapePadrao || '').trim();
  if (!texto) return;

  const margemEsq = opcoes.margemEsq || 40;
  const margemDir = opcoes.margemDir || 40;
  const larguraPagina = doc.page?.width || 595.28;
  const alturaPagina = doc.page?.height || 841.89;

  const y = alturaPagina - 70;

  doc
    .moveTo(margemEsq, y - 8)
    .lineTo(larguraPagina - margemDir, y - 8)
    .lineWidth(0.6)
    .strokeColor('#9ca3af')
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#4b5563')
    .text(texto, margemEsq, y, {
      width: larguraPagina - margemEsq - margemDir,
      align: 'center',
    });

  doc.fillColor('#111827');
}

module.exports = {
  desenharCabecalhoPdf,
  desenharRodapePdf,
  resolverImagemLocal,
};