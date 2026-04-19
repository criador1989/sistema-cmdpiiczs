const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const { autenticar } = require('../../middleware/autenticacao');
const calcularNotaTSMD = require('../../utils/calculoNota');
const { logAction, attachActor } = require('../../utils/audit');

function getInstituicao(req) {
  return (
    req.usuario?.instituicao ||
    req.usuario?.tenantId ||
    req.tenantId ||
    req.instituicaoId ||
    null
  );
}

async function safeAudit(payload) {
  try {
    await logAction(payload);
  } catch (e) {
    console.warn('[audit][ficha-pdf] falha ao gravar log:', e?.message || e);
  }
}

function buildForcedReq(req) {
  return {
    ...req,
    actor: req.actor || {
      id: req.usuario?.id || req.usuario?._id || null,
      nome: req.usuario?.nome || null,
      tipo: req.usuario?.tipo || null,
      email: req.usuario?.email || null,
      instituicao: req.usuario?.instituicao || req.usuario?.tenantId || getInstituicao(req) || null
    }
  };
}

// Gera PDF da ficha do aluno com base em ID ou código de acesso
router.get('/ficha/:codigoOuId', autenticar, attachActor, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);
    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    const valor = String(req.params.codigoOuId || '').trim().toUpperCase();
    if (!valor) {
      return res.status(400).json({ erro: 'Código ou ID inválido.' });
    }

    let aluno = null;

    // Se parece ObjectId válido, tenta buscar por _id + instituição
    if (/^[0-9a-fA-F]{24}$/.test(valor) && mongoose.isValidObjectId(valor)) {
      aluno = await Aluno.findOne({
        _id: valor,
        instituicao
      });
    }

    // Se não achou por ID, tenta pelo código de acesso + instituição
    if (!aluno) {
      aluno = await Aluno.findOne({
        codigoAcesso: valor,
        instituicao
      });
    }

    if (!aluno) {
      return res.status(404).json({ erro: 'Código inválido ou aluno não encontrado.' });
    }

    const notificacoes = await Notificacao.find({
      aluno: aluno._id,
      instituicao
    }).sort({ data: -1, createdAt: -1 });

    const observacoes = await Observacao.find({
      aluno: aluno._id,
      instituicao: String(instituicao)
    }).sort({ criadoEm: -1, createdAt: -1 });

    const notaAtual = calcularNotaTSMD(aluno.dataEntrada, new Date(), notificacoes);

    await safeAudit({
      req: buildForcedReq(req),
      event: 'FICHA_ALUNO_PDF_BAIXADO',
      targetType: 'Aluno',
      targetId: aluno._id,
      entidadeNome: aluno.nome,
      alunoNome: aluno.nome,
      meta: {
        turma: aluno.turma,
        codigoAcesso: aluno.codigoAcesso || '',
        totalNotificacoes: notificacoes.length,
        totalObservacoes: observacoes.length
      }
    });

    const doc = new PDFDocument({
      margin: 50,
      size: 'A4'
    });

    const nomeArquivo = `ficha_aluno_${aluno._id}.pdf`;
    const pastaUploads = path.join(__dirname, '../../public/uploads');
    fs.mkdirSync(pastaUploads, { recursive: true });

    const caminho = path.join(pastaUploads, nomeArquivo);
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    const logoPath = path.join(__dirname, '../../public/uploads/logo-cmdp.jpg');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, { width: 100, align: 'center' });
    }

    doc.moveDown();
    doc
      .fontSize(20)
      .fillColor('#d82327')
      .text('Ficha Comportamental do Aluno', { align: 'center' });

    doc.moveDown();
    doc.fontSize(12).fillColor('black');
    doc.text(`Nome: ${aluno.nome || '—'}`);
    doc.text(`Turma: ${aluno.turma || '—'}`);
    doc.text(`Data de Entrada: ${aluno.dataEntrada?.toLocaleDateString('pt-BR') || '—'}`);
    doc.text(`Comportamento Atual: ${Number(notaAtual || 0).toFixed(2)}`);
    doc.text(`Código de Acesso: ${aluno.codigoAcesso || '—'}`);

    doc.moveDown();
    doc
      .fontSize(14)
      .fillColor('#d82327')
      .text('Observações', { underline: true });

    if (!observacoes.length) {
      doc.fontSize(12).fillColor('black').text('Nenhuma observação registrada.');
    } else {
      observacoes.forEach((obs) => {
        const dataObs = obs.criadoEm || obs.createdAt;
        doc
          .fontSize(12)
          .fillColor('black')
          .text(`• ${dataObs ? new Date(dataObs).toLocaleDateString('pt-BR') : '—'} - ${obs.autor || '—'}: ${obs.texto || ''}`);
      });
    }

    doc.moveDown();
    doc
      .fontSize(14)
      .fillColor('#d82327')
      .text('Notificações Disciplinares', { underline: true });

    if (!notificacoes.length) {
      doc.fontSize(12).fillColor('black').text('Nenhuma notificação registrada.');
    } else {
      notificacoes.forEach((n) => {
        const dataNotif = n.data || n.createdAt;
        doc
          .fontSize(12)
          .fillColor('black')
          .text(`• ${dataNotif ? new Date(dataNotif).toLocaleDateString('pt-BR') : '—'} - ${n.tipoMedida || '—'}: ${n.motivo || '—'}`);
        doc.text(`  Tipo: ${n.tipo || '—'} | Valor: ${n.valorNumerico ?? '—'} | Dias: ${n.quantidadeDias ?? '—'}`);
        doc.text(`  Nota: ${n.notaAnterior?.toFixed?.(2) || '—'} → ${n.notaAtual?.toFixed?.(2) || '—'}`);
        doc.text(`  Observação: ${n.observacao || n.observacoes || '—'}`).moveDown(0.5);
      });
    }

    doc.end();

    stream.on('finish', () => {
      res.download(caminho, nomeArquivo, (err) => {
        try {
          if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
        } catch {}

        if (err && !res.headersSent) {
          return res.status(500).send('Erro ao enviar PDF');
        }
      });
    });

    stream.on('error', (err) => {
      console.error('Erro ao gerar stream do PDF:', err);
      if (!res.headersSent) {
        return res.status(500).send('Erro ao gerar ficha do aluno');
      }
    });
  } catch (erro) {
    console.error('Erro ao gerar ficha do aluno:', erro);
    res.status(500).send('Erro ao gerar ficha do aluno');
  }
});

module.exports = router;