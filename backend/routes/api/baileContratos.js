'use strict';

const express = require('express');
const multer = require('multer');

const BaileContrato = require('../../models/BaileContrato');
const Aluno = require('../../models/Aluno');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const { uploadArquivoBaile, deletarArquivoBaile } = require('../../utils/s3BaileUpload');
console.log('[BAILE][S3_IMPORT]', {
  uploadArquivoBaile: typeof uploadArquivoBaile,
  deletarArquivoBaile: typeof deletarArquivoBaile,
});

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

function getInstituicaoId(req) {
  return (
    req.instituicao?._id ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.usuario?.instituicao ||
    req.user?.instituicao
  );
}

function getUsuarioId(req) {
  return req.usuario?._id || req.user?._id || null;
}

function getUsuarioNome(req) {
  return req.usuario?.nome || req.user?.nome || req.usuario?.email || req.user?.email || '';
}

function normalizarTurma(turma = '') {
  return String(turma)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

function isTerceiroAno(turma = '') {
  const t = normalizarTurma(turma);

  return (
    t.includes('3') ||
    t.includes('3a') ||
    t.includes('3b') ||
    t.includes('3c') ||
    t.includes('3serie') ||
    t.includes('terceiro')
  );
}

function gerarParcelas({ valorTotal, quantidadeParcelas, dataInicial }) {
  const qtd = Math.max(1, Math.min(Number(quantidadeParcelas || 8), 8));
  const total = Number(valorTotal || 0);
  const valorParcela = Number((total / qtd).toFixed(2));

  const parcelas = [];

  for (let i = 1; i <= qtd; i += 1) {
    const vencimento = new Date(dataInicial || '2026-04-30T12:00:00');
    vencimento.setMonth(vencimento.getMonth() + (i - 1));

    parcelas.push({
      numero: i,
      vencimento,
      valorPrevisto:
        i === qtd
          ? Number((total - valorParcela * (qtd - 1)).toFixed(2))
          : valorParcela,
      valorPago: 0,
      status: 'pendente',
    });
  }

  return parcelas;
}

function recalcularParcelasComPagamentos(contrato) {
  let saldoPago = (contrato.pagamentos || []).reduce((acc, pg) => {
    return acc + Number(pg.valor || 0);
  }, 0);

  contrato.parcelas = (contrato.parcelas || []).map((p) => {
    const bruto = p.toObject?.() || p;
    const previsto = Number(bruto.valorPrevisto || 0);
    const pagoNaParcela = Math.min(saldoPago, previsto);

    saldoPago -= pagoNaParcela;

    let status = 'pendente';

    if (pagoNaParcela >= previsto) {
      status = 'paga';
    } else if (pagoNaParcela > 0) {
      status = 'parcial';
    } else {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const venc = new Date(bruto.vencimento);
      venc.setHours(0, 0, 0, 0);

      status = venc < hoje ? 'atrasada' : 'pendente';
    }

    return {
      ...bruto,
      valorPago: Number(pagoNaParcela.toFixed(2)),
      status,
    };
  });

  contrato.atualizarStatusFinanceiro();
}

function resumoContrato(contrato) {
  const financeiro = contrato.calcularResumoFinanceiro();

  const parcelasAtrasadas = (contrato.parcelas || []).filter(
    (p) => p.status === 'atrasada'
  ).length;

  return {
    ...contrato.toObject(),
    financeiro,
    alertas: {
      semContrato: !contrato.contratoAssinado,
      possuiPendencia: financeiro.valorPendente > 0,
      parcelasAtrasadas,
      atrasado: contrato.status === 'atrasado',
      quitado: contrato.status === 'quitado',
      desistente: contrato.status === 'desistente',
    },
  };
}

router.get('/alunos-terceiros', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);

    const alunos = await Aluno.find({
      instituicao,
      ativo: { $ne: false },
    })
      .select('_id nome turma responsavel responsavelNome cpfResponsavel telefoneResponsavel')
      .sort({ turma: 1, nome: 1 })
      .lean();

    const terceiros = alunos.filter((a) => isTerceiroAno(a.turma));

    res.json({
      ok: true,
      total: terceiros.length,
      alunos: terceiros,
    });
  } catch (err) {
    console.error('[BAILE][ALUNOS_TERCEIROS]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao buscar alunos dos terceiros anos.',
    });
  }
});

router.get('/', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);

    const {
      anoLetivo = 2026,
      turma,
      status,
      busca,
      somenteAlertas,
    } = req.query;

    const filtro = {
      instituicao,
      anoLetivo: Number(anoLetivo),
    };

    if (turma) filtro.turma = turma;
    if (status) filtro.status = status;

    if (busca) {
      filtro.$or = [
        { alunoNome: { $regex: busca, $options: 'i' } },
        { responsavelNome: { $regex: busca, $options: 'i' } },
        { turma: { $regex: busca, $options: 'i' } },
      ];
    }

    const contratos = await BaileContrato.find(filtro).sort({
      turma: 1,
      alunoNome: 1,
    });

    for (const contrato of contratos) {
      recalcularParcelasComPagamentos(contrato);
      await contrato.save();
    }

    let dados = contratos.map(resumoContrato);

    if (somenteAlertas === 'true') {
      dados = dados.filter(
        (c) =>
          c.alertas.semContrato ||
          c.alertas.parcelasAtrasadas > 0 ||
          c.alertas.atrasado
      );
    }

    const totais = dados.reduce(
      (acc, c) => {
        acc.valorPrevisto += Number(c.financeiro.valorTotal || 0);
        acc.valorRecebido += Number(c.financeiro.totalPago || 0);
        acc.valorPendente += Number(c.financeiro.valorPendente || 0);

        if (c.status === 'quitado') acc.quitados += 1;
        if (c.status === 'atrasado') acc.atrasados += 1;
        if (!c.contratoAssinado) acc.semContrato += 1;

        return acc;
      },
      {
        contratos: dados.length,
        valorPrevisto: 0,
        valorRecebido: 0,
        valorPendente: 0,
        quitados: 0,
        atrasados: 0,
        semContrato: 0,
      }
    );

    res.json({
      ok: true,
      totais,
      contratos: dados,
    });
  } catch (err) {
    console.error('[BAILE][LISTAR]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao listar contratos do baile.',
    });
  }
});

router.post('/', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const {
      alunoId,
      quantidadeIngressos = 1,
      quantidadeParcelas = 8,
      responsavelNome = '',
      responsavelCpf = '',
      responsavelTelefone = '',
      observacoes = '',
      anoLetivo = 2026,
      dataAdesao,
    } = req.body;

    const aluno = await Aluno.findOne({
      _id: alunoId,
      instituicao,
    }).lean();

    if (!aluno) {
      return res.status(404).json({
        ok: false,
        message: 'Aluno não encontrado nesta instituição.',
      });
    }

    if (!isTerceiroAno(aluno.turma)) {
      return res.status(400).json({
        ok: false,
        message: 'Somente alunos dos terceiros anos podem aderir ao baile.',
      });
    }

    const qtdIngressos = Math.max(1, Math.min(Number(quantidadeIngressos), 6));
    const valorUnitario = 150;
    const valorTotal = qtdIngressos * valorUnitario;
    const qtdParcelas = Math.max(1, Math.min(Number(quantidadeParcelas), 8));

    const contrato = await BaileContrato.create({
      instituicao,
      anoLetivo: Number(anoLetivo),
      aluno: aluno._id,
      alunoNome: aluno.nome,
      turma: aluno.turma,
      responsavelNome:
        responsavelNome || aluno.responsavelNome || aluno.responsavel || '',
      responsavelCpf: responsavelCpf || aluno.cpfResponsavel || '',
      responsavelTelefone:
        responsavelTelefone || aluno.telefoneResponsavel || '',
      quantidadeIngressos: qtdIngressos,
      valorUnitario,
      valorTotal,
      quantidadeParcelas: qtdParcelas,
      dataAdesao: dataAdesao ? new Date(dataAdesao) : new Date(),
      parcelas: gerarParcelas({
        valorTotal,
        quantidadeParcelas: qtdParcelas,
        dataInicial: '2026-04-30T12:00:00',
      }),
      observacoes,
      criadoPor: usuarioId,
      criadoPorNome: usuarioNome,
      atualizadoPor: usuarioId,
      atualizadoPorNome: usuarioNome,
    });

    contrato.atualizarStatusFinanceiro();
    await contrato.save();

    res.status(201).json({
      ok: true,
      message: 'Contrato do baile cadastrado com sucesso.',
      contrato: resumoContrato(contrato),
    });
  } catch (err) {
    console.error('[BAILE][CRIAR]', err);

    if (err.code === 11000) {
      return res.status(409).json({
        ok: false,
        message: 'Este aluno já possui adesão cadastrada para este baile.',
      });
    }

    res.status(500).json({
      ok: false,
      message: 'Erro ao criar contrato do baile.',
    });
  }
});

router.put('/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const contrato = await BaileContrato.findOne({
      _id: req.params.id,
      instituicao,
    });

    if (!contrato) {
      return res.status(404).json({
        ok: false,
        message: 'Contrato não encontrado.',
      });
    }

    const camposEditaveis = [
      'responsavelNome',
      'responsavelCpf',
      'responsavelTelefone',
      'quantidadeIngressos',
      'quantidadeParcelas',
      'observacoes',
      'dataAdesao',
      'status',
    ];

    const motivo = req.body.motivoCorrecao || 'Correção manual no módulo do baile.';

    camposEditaveis.forEach((campo) => {
      if (req.body[campo] !== undefined) {
        const anterior = contrato[campo];

        contrato.historicoCorrecoes.push({
          campo,
          valorAnterior: anterior,
          valorNovo: req.body[campo],
          motivo,
          usuario: usuarioId,
          usuarioNome,
        });

        contrato[campo] = req.body[campo];
      }
    });

    contrato.quantidadeIngressos = Math.max(
      1,
      Math.min(Number(contrato.quantidadeIngressos || 1), 6)
    );

    contrato.quantidadeParcelas = Math.max(
      1,
      Math.min(Number(contrato.quantidadeParcelas || 8), 8)
    );

    contrato.valorTotal =
      Number(contrato.quantidadeIngressos || 0) *
      Number(contrato.valorUnitario || 150);

    if (
      req.body.quantidadeIngressos !== undefined ||
      req.body.quantidadeParcelas !== undefined
    ) {
      contrato.parcelas = gerarParcelas({
        valorTotal: contrato.valorTotal,
        quantidadeParcelas: contrato.quantidadeParcelas,
        dataInicial: '2026-04-30T12:00:00',
      });
    }

    contrato.atualizadoPor = usuarioId;
    contrato.atualizadoPorNome = usuarioNome;

    recalcularParcelasComPagamentos(contrato);

    await contrato.save();

    res.json({
      ok: true,
      message: 'Contrato atualizado com sucesso.',
      contrato: resumoContrato(contrato),
    });
  } catch (err) {
    console.error('[BAILE][ATUALIZAR]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao atualizar contrato.',
    });
  }
});

router.post(
  '/:id/contrato',
  autenticar,
  requireTenant,
  upload.single('contrato'),
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      const contrato = await BaileContrato.findOne({
        _id: req.params.id,
        instituicao,
      });

      if (!contrato) {
        return res.status(404).json({
          ok: false,
          message: 'Contrato não encontrado.',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          message: 'Nenhum arquivo enviado.',
        });
      }

      if (contrato.contratoKey) {
        await deletarArquivoBaile(contrato.contratoKey).catch(() => null);
      }

      const enviado = await uploadArquivoBaile({
        file: req.file,
        instituicaoId: instituicao,
        alunoId: contrato.aluno,
        tipo: 'contratos',
      });

      contrato.contratoAssinado = true;
      contrato.contratoKey = enviado.key;
      contrato.contratoUrl = enviado.url;

      await contrato.save();

      res.json({
        ok: true,
        message: 'Contrato anexado com sucesso.',
        contrato: resumoContrato(contrato),
      });
    } catch (err) {
      console.error('[BAILE][ANEXAR_CONTRATO_S3]', err);
      res.status(500).json({
        ok: false,
        message: err.message || 'Erro ao anexar contrato.',
      });
    }
  }
);

router.post(
  '/:id/pagamentos',
  autenticar,
  requireTenant,
  upload.single('comprovante'),
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const usuarioId = getUsuarioId(req);
      const usuarioNome = getUsuarioNome(req);

      const contrato = await BaileContrato.findOne({
        _id: req.params.id,
        instituicao,
      });

      if (!contrato) {
        return res.status(404).json({
          ok: false,
          message: 'Contrato não encontrado.',
        });
      }

      const {
        valor,
        dataPagamento,
        formaPagamento = 'pix',
        referenciaParcela = '',
        observacao = '',
      } = req.body;

      if (!valor || Number(valor) <= 0) {
        return res.status(400).json({
          ok: false,
          message: 'Informe um valor de pagamento válido.',
        });
      }

      let comprovanteKey = '';
      let comprovanteUrl = '';

      if (req.file) {
        const enviado = await uploadArquivoBaile({
          file: req.file,
          instituicaoId: instituicao,
          alunoId: contrato.aluno,
          tipo: 'comprovantes',
        });

        comprovanteKey = enviado.key;
        comprovanteUrl = enviado.url;
      }

      contrato.pagamentos.push({
        dataPagamento: dataPagamento ? new Date(dataPagamento) : new Date(),
        valor: Number(valor),
        formaPagamento,
        referenciaParcela,
        observacao,
        comprovanteKey,
        comprovanteUrl,
        registradoPor: usuarioId,
        registradoPorNome: usuarioNome,
      });

      recalcularParcelasComPagamentos(contrato);

      await contrato.save();

      res.status(201).json({
        ok: true,
        message: 'Pagamento registrado com sucesso.',
        contrato: resumoContrato(contrato),
      });
    } catch (err) {
      console.error('[BAILE][PAGAMENTO_S3]', err);
      res.status(500).json({
        ok: false,
        message: err.message || 'Erro ao registrar pagamento.',
      });
    }
  }
);

router.delete(
  '/:id/pagamentos/:pagamentoId',
  autenticar,
  requireTenant,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      const contrato = await BaileContrato.findOne({
        _id: req.params.id,
        instituicao,
      });

      if (!contrato) {
        return res.status(404).json({
          ok: false,
          message: 'Contrato não encontrado.',
        });
      }

      const pagamento = contrato.pagamentos.id(req.params.pagamentoId);

      if (!pagamento) {
        return res.status(404).json({
          ok: false,
          message: 'Pagamento não encontrado.',
        });
      }

      if (pagamento.comprovanteKey) {
        await deletarArquivoBaile(pagamento.comprovanteKey).catch(() => null);
      }

      pagamento.deleteOne();

      recalcularParcelasComPagamentos(contrato);

      await contrato.save();

      res.json({
        ok: true,
        message: 'Pagamento removido com sucesso.',
        contrato: resumoContrato(contrato),
      });
    } catch (err) {
      console.error('[BAILE][REMOVER_PAGAMENTO]', err);
      res.status(500).json({
        ok: false,
        message: 'Erro ao remover pagamento.',
      });
    }
  }
);

router.post('/:id/desistencia', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const contrato = await BaileContrato.findOne({
      _id: req.params.id,
      instituicao,
    });

    if (!contrato) {
      return res.status(404).json({
        ok: false,
        message: 'Contrato não encontrado.',
      });
    }

    const statusAnterior = contrato.status;
    const resumo = contrato.calcularResumoFinanceiro();

    contrato.status = 'desistente';
    contrato.dataDesistencia = req.body.dataDesistencia
      ? new Date(req.body.dataDesistencia)
      : new Date();
    contrato.motivoDesistencia = req.body.motivo || '';
    contrato.valorDevolucaoPrevisto = Number((resumo.totalPago * 0.5).toFixed(2));

    contrato.historicoCorrecoes.push({
      campo: 'status',
      valorAnterior: statusAnterior,
      valorNovo: 'desistente',
      motivo: req.body.motivo || 'Registro de desistência.',
      usuario: usuarioId,
      usuarioNome,
    });

    await contrato.save();

    res.json({
      ok: true,
      message: 'Desistência registrada com sucesso.',
      contrato: resumoContrato(contrato),
    });
  } catch (err) {
    console.error('[BAILE][DESISTENCIA]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao registrar desistência.',
    });
  }
});

router.get('/alertas/resumo', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const anoLetivo = Number(req.query.anoLetivo || 2026);

    const contratos = await BaileContrato.find({
      instituicao,
      anoLetivo,
    });

    for (const contrato of contratos) {
      recalcularParcelasComPagamentos(contrato);
      await contrato.save();
    }

    const dados = contratos.map(resumoContrato);

    res.json({
      ok: true,
      alertas: {
        semContrato: dados.filter((c) => c.alertas.semContrato),
        atrasados: dados.filter((c) => c.alertas.atrasado),
        pendentes: dados.filter((c) => c.alertas.possuiPendencia),
        desistentes: dados.filter((c) => c.status === 'desistente'),
      },
    });
  } catch (err) {
    console.error('[BAILE][ALERTAS]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao buscar alertas do baile.',
    });
  }
});
router.get('/dashboard/pro', autenticar, requireTenant, async (req, res) => {
  res.json({
    ok: true,
    resumo: {
      contratos: 0,
      valorPrevisto: 0,
      valorRecebido: 0,
      valorPendente: 0,
      quitados: 0,
      atrasados: 0,
      emDia: 0,
      emAberto: 0,
      desistentes: 0,
      cancelados: 0,
      semContrato: 0,
      comContrato: 0,
      pagamentosPix: 0,
      pagamentosDinheiro: 0,
      pagamentosMisto: 0,
      pagamentosOutro: 0,
      percentualRecebido: 0,
      percentualInadimplencia: 0
    },
    porTurma: [],
    porFormaPagamento: [],
    listas: {
      inadimplentes: [],
      contratosPendentes: [],
      quitados: []
    }
  });
});

module.exports = router;