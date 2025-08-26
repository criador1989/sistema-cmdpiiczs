const express = require('express');
const router = express.Router();
const path = require('path');
const PDFDocument = require('pdfkit');

const ComunicacaoPais = require('../../models/ComunicacaoPais');
const Notificacao = require('../../models/Notificacao');
const { autenticar } = require('../../middleware/autenticacao');

function toDateOnly(d) {
  if (!d) return undefined;
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}

// GET /api/comunicacao/:notificacaoId  -> retorna a comunicação vinculada (se existir)
router.get('/:notificacaoId', autenticar, async (req, res) => {
  try {
    const comunic = await ComunicacaoPais.findOne({
      notificacao: req.params.notificacaoId,
      instituicao: req.usuario.instituicao,
    });
    if (!comunic) return res.status(404).json({ mensagem: 'Comunicação não encontrada.' });
    res.json(comunic);
  } catch (e) {
    console.error('Erro GET comunicacao:', e);
    res.status(500).json({ mensagem: 'Erro ao buscar comunicação.' });
  }
});

// POST /api/comunicacao/:notificacaoId  -> cria (se não existir) a partir da notificação
router.post('/:notificacaoId', autenticar, async (req, res) => {
  try {
    const notif = await Notificacao.findOne({
      _id: req.params.notificacaoId,
      instituicao: req.usuario.instituicao
    }).populate('aluno');

    if (!notif) return res.status(404).json({ mensagem: 'Notificação não encontrada.' });

    const medida = (notif.tipoMedida || notif.tipo || '').toUpperCase();
    if (!['A.I.A', 'A.E.C.D.E'].includes(medida)) {
      return res.status(400).json({ mensagem: 'A comunicação só é permitida para A.I.A ou A.E.C.D.E.' });
    }

    let existente = await ComunicacaoPais.findOne({
      notificacao: notif._id,
      instituicao: req.usuario.instituicao,
    });
    if (existente) return res.json(existente);

    const criada = await ComunicacaoPais.create({
      instituicao: req.usuario.instituicao,
      aluno: notif.aluno._id,
      notificacao: notif._id,
      nomeAluno: notif.aluno.nome,
      turma: notif.aluno.turma,
      dataNotificacao: toDateOnly(notif.data || new Date()),
      tipoMedida: medida,
      observacao: '',
      dataInicio: toDateOnly(new Date()),
      dataFim: toDateOnly(new Date()),
      horaApresentacao: '14:00',
      horaSaida: '18:00',
      criadoPor: req.usuario._id,
    });

    res.status(201).json(criada);
  } catch (e) {
    console.error('Erro POST comunicacao:', e);
    res.status(500).json({ mensagem: 'Erro ao criar comunicação.' });
  }
});

// PUT /api/comunicacao/:id  -> atualiza campos editáveis
router.put('/:id', autenticar, async (req, res) => {
  try {
    const { observacao, dataInicio, dataFim, horaApresentacao, horaSaida } = req.body;

    const comunic = await ComunicacaoPais.findById(req.params.id);
    if (!comunic) return res.status(404).json({ mensagem: 'Comunicação não encontrada.' });
    if (comunic.instituicao !== req.usuario.instituicao) return res.status(403).json({ mensagem: 'Acesso negado.' });

    if (observacao !== undefined) comunic.observacao = observacao;
    if (dataInicio) comunic.dataInicio = toDateOnly(dataInicio);
    if (dataFim) comunic.dataFim = toDateOnly(dataFim);
    if (horaApresentacao) comunic.horaApresentacao = horaApresentacao;
    if (horaSaida) comunic.horaSaida = horaSaida;
    comunic.atualizadoPor = req.usuario._id;

    await comunic.save();
    res.json(comunic);
  } catch (e) {
    console.error('Erro PUT comunicacao:', e);
    res.status(500).json({ mensagem: 'Erro ao atualizar comunicação.' });
  }
});

// GET /api/comunicacao/:id/pdf  -> gera PDF
router.get('/:id/pdf', autenticar, async (req, res) => {
  try {
    const comunic = await ComunicacaoPais.findById(req.params.id);
    if (!comunic) return res.status(404).json({ mensagem: 'Comunicação não encontrada.' });
    if (comunic.instituicao !== req.usuario.instituicao) return res.status(403).json({ mensagem: 'Acesso negado.' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="comunicacao-${comunic.nomeAluno}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    const logoPath = path.join(__dirname, '../../public/images/logo.png');
    try { doc.image(logoPath, 50, 40, { width: 60 }); } catch(_) {}
    doc.fontSize(14).text('COLÉGIO MILITAR DOM PEDRO II', 120, 45, { align: 'left' });
    doc.fontSize(10).text('Comunicação aos Pais/Responsáveis', 120, 65);

    const dt = (d)=> new Date(d).toLocaleDateString('pt-BR');

    doc.moveDown(2);
    doc.fontSize(12).text(`Aluno: ${comunic.nomeAluno}`);
    doc.text(`Turma: ${comunic.turma}`);
    doc.text(`Instituição: ${comunic.instituicao}`);
    doc.text(`Data da Notificação: ${dt(comunic.dataNotificacao)}`);
    doc.text(`Medida Disciplinar: ${comunic.tipoMedida}`);

    doc.moveDown(1);
    doc.text(`Período de Cumprimento: ${dt(comunic.dataInicio)} a ${dt(comunic.dataFim)}`);
    doc.text(`Horário de Apresentação: ${comunic.horaApresentacao} | Horário de Saída: ${comunic.horaSaida}`);

    doc.moveDown(1.5);
    doc.text('Observações:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(comunic.observacao || '—', { align: 'justify' });
    doc.fontSize(12);

    doc.moveDown(3);
    const y = doc.y;
    doc.moveTo(50, y).lineTo(260, y).stroke();
    doc.text('Assinatura do Responsável', 50, y + 5, { width: 210, align: 'center' });

    doc.moveTo(320, y).lineTo(560, y).stroke();
    doc.text('Assinatura do Coordenador do Corpo de Alunos', 320, y + 5, { width: 240, align: 'center' });

    doc.end();
  } catch (e) {
    console.error('Erro PDF comunicacao:', e);
    res.status(500).json({ mensagem: 'Erro ao gerar PDF.' });
  }
});

module.exports = router;
