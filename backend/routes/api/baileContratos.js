'use strict';

const express = require('express');
const multer = require('multer');

const BaileContrato = require('../../models/BaileContrato');
const Aluno = require('../../models/Aluno');
const BaileControle = require('../../models/BaileControle');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const { uploadArquivoBaile, deletarArquivoBaile } = require('../../utils/s3BaileUpload');

const router = express.Router();

const CAPACIDADE_PADRAO_CADEIRAS = 700;
const VALOR_UNITARIO_PADRAO = 150;
const LIMITE_PARCELAS_PADRAO = 12;

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

function inteiroSeguro(valor, padrao = 0, minimo = 0, maximo = 9999) {
  const n = Number(valor);

  if (!Number.isFinite(n)) return padrao;

  return Math.max(minimo, Math.min(Math.floor(n), maximo));
}

async function obterControleBaile(instituicao, anoLetivo) {
  const ano = Number(anoLetivo || new Date().getFullYear());

  let controle = await BaileControle.findOne({
    instituicao,
    anoLetivo: ano,
  }).lean();

  if (!controle) {
    controle = {
      capacidadeBase: CAPACIDADE_PADRAO_CADEIRAS,
      cadeirasExtrasConvidados: 0,
    };
  }

  const capacidadeBase = Number(
    controle.capacidadeBase ?? CAPACIDADE_PADRAO_CADEIRAS
  );

  const cadeirasExtrasConvidados = Number(
    controle.cadeirasExtrasConvidados || 0
  );

  return {
    ...controle,
    capacidadeBase,
    cadeirasExtrasConvidados,
    capacidadeTotal: capacidadeBase + cadeirasExtrasConvidados,
  };
}

function gerarParcelas({ valorTotal, quantidadeParcelas, dataInicial }) {
  const qtd = Math.max(
    1,
    Math.min(Number(quantidadeParcelas || 8), LIMITE_PARCELAS_PADRAO)
  );

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

  const obj = contrato.toObject();

  return {
    ...obj,
    statusParticipacao: obj.statusParticipacao || 'participante',
    ingressosIniciais:
      obj.ingressosIniciais !== undefined
        ? obj.ingressosIniciais
        : Number(obj.quantidadeIngressos || 0),
    ingressosAdicionais: Number(obj.ingressosAdicionais || 0),
    financeiro,
    alertas: {
      semContrato: !contrato.contratoAssinado,
      possuiPendencia: financeiro.valorPendente > 0,
      parcelasAtrasadas,
      atrasado: contrato.status === 'atrasado',
      quitado: contrato.status === 'quitado',
      desistente: contrato.status === 'desistente',
      naoParticipa: obj.statusParticipacao === 'nao_participa',
    },
  };
}

function contratoContaComoParticipante(c) {
  return (
    (c.statusParticipacao || 'participante') === 'participante' &&
    !['desistente', 'cancelado'].includes(c.status)
  );
}

async function buscarAlunosTerceiros(instituicao) {
  const alunos = await Aluno.find({
    instituicao,
    ativo: { $ne: false },
  })
    .select('_id nome turma responsavel responsavelNome cpfResponsavel telefoneResponsavel')
    .sort({ turma: 1, nome: 1 })
    .lean();

  return alunos.filter((a) => isTerceiroAno(a.turma));
}

router.get('/alunos-terceiros', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const terceiros = await buscarAlunosTerceiros(instituicao);

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
      statusParticipacao,
      busca,
      somenteAlertas,
    } = req.query;

    const filtro = {
      instituicao,
      anoLetivo: Number(anoLetivo),
    };

    if (turma) filtro.turma = turma;
    if (status) filtro.status = status;
    if (statusParticipacao) filtro.statusParticipacao = statusParticipacao;

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

    const controleBaile = await obterControleBaile(instituicao, Number(anoLetivo));

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
          c.alertas.atrasado ||
          c.alertas.naoParticipa
      );
    }

    const terceiros = await buscarAlunosTerceiros(instituicao);
    const alunosComRegistro = new Set(
      dados.map((c) => String(c.aluno || '')).filter(Boolean)
    );

    const totais = dados.reduce(
      (acc, c) => {
        const participante = contratoContaComoParticipante(c);
        const qtdIngressos = participante ? Number(c.quantidadeIngressos || 0) : 0;

        acc.valorPrevisto += Number(c.financeiro.valorTotal || 0);
        acc.valorRecebido += Number(c.financeiro.totalPago || 0);
        acc.valorPendente += Number(c.financeiro.valorPendente || 0);
        acc.cadeirasSolicitadas += qtdIngressos;
        acc.ingressosIniciais += Number(c.ingressosIniciais || 0);
        acc.ingressosAdicionais += Number(c.ingressosAdicionais || 0);

        if (participante) acc.participantes += 1;
        if ((c.statusParticipacao || '') === 'nao_participa') acc.naoParticipam += 1;
        if (c.status === 'quitado') acc.quitados += 1;
        if (c.status === 'atrasado') acc.atrasados += 1;
        if (!c.contratoAssinado && participante) acc.semContrato += 1;

        return acc;
      },
      {
        contratos: dados.length,
        participantes: 0,
        naoParticipam: 0,
        semResposta: 0,
        valorPrevisto: 0,
        valorRecebido: 0,
        valorPendente: 0,
        quitados: 0,
        atrasados: 0,
        semContrato: 0,
        capacidadeBase: Number(controleBaile.capacidadeBase || CAPACIDADE_PADRAO_CADEIRAS),
        cadeirasExtrasConvidados: Number(controleBaile.cadeirasExtrasConvidados || 0),
        capacidadeMaximaCadeiras: Number(controleBaile.capacidadeTotal || CAPACIDADE_PADRAO_CADEIRAS),
        cadeirasSolicitadas: 0,
        cadeirasDisponiveis: Number(controleBaile.capacidadeTotal || CAPACIDADE_PADRAO_CADEIRAS),
        ingressosIniciais: 0,
        ingressosAdicionais: 0,
      }
    );

    totais.semResposta = terceiros.filter((a) => !alunosComRegistro.has(String(a._id))).length;
    totais.cadeirasDisponiveis = Math.max(
      totais.capacidadeMaximaCadeiras - totais.cadeirasSolicitadas,
      0
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
      quantidadeIngressos,
      ingressosIniciais,
      ingressosAdicionais,
      quantidadeParcelas = 8,
      responsavelNome = '',
      responsavelCpf = '',
      responsavelTelefone = '',
      observacoes = '',
      anoLetivo = 2026,
      dataAdesao,
      statusParticipacao = 'participante',
      valorUnitario = VALOR_UNITARIO_PADRAO,
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

    const participa = statusParticipacao !== 'nao_participa';

    const qtdInicial =
      ingressosIniciais !== undefined
        ? inteiroSeguro(ingressosIniciais, 0, 0, CAPACIDADE_PADRAO_CADEIRAS)
        : inteiroSeguro(quantidadeIngressos, participa ? 1 : 0, 0, CAPACIDADE_PADRAO_CADEIRAS);

    const qtdAdicional = inteiroSeguro(
      ingressosAdicionais,
      0,
      0,
      CAPACIDADE_PADRAO_CADEIRAS
    );

    const qtdIngressos = participa
      ? Math.min(qtdInicial + qtdAdicional, CAPACIDADE_PADRAO_CADEIRAS)
      : 0;

    const unitario = Number(valorUnitario || VALOR_UNITARIO_PADRAO);
    const valorTotal = qtdIngressos * unitario;
    const qtdParcelas = Math.max(
      1,
      Math.min(Number(quantidadeParcelas || 8), LIMITE_PARCELAS_PADRAO)
    );

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
      aderiu: participa,
      statusParticipacao: participa ? 'participante' : 'nao_participa',
      ingressosIniciais: qtdInicial,
      ingressosAdicionais: qtdAdicional,
      quantidadeIngressos: qtdIngressos,
      valorUnitario: unitario,
      valorTotal,
      quantidadeParcelas: qtdParcelas,
      dataAdesao: dataAdesao ? new Date(dataAdesao) : new Date(),
      parcelas: participa
        ? gerarParcelas({
            valorTotal,
            quantidadeParcelas: qtdParcelas,
            dataInicial: '2026-04-30T12:00:00',
          })
        : [],
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
      message: participa
        ? 'Contrato do baile cadastrado com sucesso.'
        : 'Aluno registrado como não participante do baile.',
      contrato: resumoContrato(contrato),
    });
  } catch (err) {
    console.error('[BAILE][CRIAR]', err);

    if (err.code === 11000) {
      return res.status(409).json({
        ok: false,
        message: 'Este aluno já possui registro cadastrado para este baile.',
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
      'ingressosIniciais',
      'ingressosAdicionais',
      'quantidadeParcelas',
      'observacoes',
      'dataAdesao',
      'status',
      'statusParticipacao',
      'mesaNumero',
      'cadeiraNumero',
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

    const participa = contrato.statusParticipacao !== 'nao_participa';

    const qtdInicial =
      req.body.ingressosIniciais !== undefined
        ? inteiroSeguro(req.body.ingressosIniciais, 0, 0, CAPACIDADE_PADRAO_CADEIRAS)
        : inteiroSeguro(
            contrato.ingressosIniciais || contrato.quantidadeIngressos,
            participa ? 1 : 0,
            0,
            CAPACIDADE_PADRAO_CADEIRAS
          );

    const qtdAdicional = inteiroSeguro(
      contrato.ingressosAdicionais,
      0,
      0,
      CAPACIDADE_PADRAO_CADEIRAS
    );

    contrato.ingressosIniciais = participa ? qtdInicial : 0;
    contrato.ingressosAdicionais = participa ? qtdAdicional : 0;
    contrato.quantidadeIngressos = participa
      ? Math.min(qtdInicial + qtdAdicional, CAPACIDADE_PADRAO_CADEIRAS)
      : 0;

    contrato.quantidadeParcelas = Math.max(
      1,
      Math.min(Number(contrato.quantidadeParcelas || 8), LIMITE_PARCELAS_PADRAO)
    );

    contrato.aderiu = participa;
    contrato.valorTotal =
      Number(contrato.quantidadeIngressos || 0) *
      Number(contrato.valorUnitario || VALOR_UNITARIO_PADRAO);

    if (!participa) {
      contrato.status = 'cancelado';
      contrato.parcelas = [];
    } else if (
      req.body.quantidadeIngressos !== undefined ||
      req.body.ingressosIniciais !== undefined ||
      req.body.ingressosAdicionais !== undefined ||
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
    contrato.statusParticipacao = 'nao_participa';
    contrato.aderiu = false;
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
        naoParticipam: dados.filter((c) => c.statusParticipacao === 'nao_participa'),
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
    const terceiros = await buscarAlunosTerceiros(instituicao);

    const porTurmaMap = new Map();

    const resumo = dados.reduce(
      (acc, c) => {
        const participante = contratoContaComoParticipante(c);
        const qtdIngressos = participante ? Number(c.quantidadeIngressos || 0) : 0;

        acc.contratos += 1;
        acc.valorPrevisto += Number(c.financeiro.valorTotal || 0);
        acc.valorRecebido += Number(c.financeiro.totalPago || 0);
        acc.valorPendente += Number(c.financeiro.valorPendente || 0);
        acc.cadeirasSolicitadas += qtdIngressos;
        acc.ingressosIniciais += participante ? Number(c.ingressosIniciais || 0) : 0;
        acc.ingressosAdicionais += participante ? Number(c.ingressosAdicionais || 0) : 0;

        if (participante) acc.participantes += 1;
        if (c.statusParticipacao === 'nao_participa') acc.naoParticipam += 1;
        if (c.status === 'quitado') acc.quitados += 1;
        if (c.status === 'atrasado') acc.atrasados += 1;
        if (c.status === 'em_dia') acc.emDia += 1;
        if (c.status === 'em_aberto') acc.emAberto += 1;
        if (c.status === 'desistente') acc.desistentes += 1;
        if (c.status === 'cancelado') acc.cancelados += 1;
        if (!c.contratoAssinado && participante) acc.semContrato += 1;
        if (c.contratoAssinado) acc.comContrato += 1;

        (c.pagamentos || []).forEach((pg) => {
          const valor = Number(pg.valor || 0);

          if (pg.formaPagamento === 'pix') acc.pagamentosPix += valor;
          else if (pg.formaPagamento === 'dinheiro') acc.pagamentosDinheiro += valor;
          else if (pg.formaPagamento === 'misto') acc.pagamentosMisto += valor;
          else acc.pagamentosOutro += valor;
        });

        const turma = c.turma || 'Sem turma';

        if (!porTurmaMap.has(turma)) {
          porTurmaMap.set(turma, {
            turma,
            contratos: 0,
            participantes: 0,
            naoParticipam: 0,
            cadeirasSolicitadas: 0,
            valorPrevisto: 0,
            valorRecebido: 0,
            valorPendente: 0,
          });
        }

        const t = porTurmaMap.get(turma);
        t.contratos += 1;
        if (participante) t.participantes += 1;
        if (c.statusParticipacao === 'nao_participa') t.naoParticipam += 1;
        t.cadeirasSolicitadas += qtdIngressos;
        t.valorPrevisto += Number(c.financeiro.valorTotal || 0);
        t.valorRecebido += Number(c.financeiro.totalPago || 0);
        t.valorPendente += Number(c.financeiro.valorPendente || 0);

        return acc;
      },
      {
        contratos: 0,
        participantes: 0,
        naoParticipam: 0,
        semResposta: 0,
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
        percentualInadimplencia: 0,
        capacidadeMaximaCadeiras: CAPACIDADE_PADRAO_CADEIRAS,
        cadeirasSolicitadas: 0,
        cadeirasDisponiveis: CAPACIDADE_PADRAO_CADEIRAS,
        ingressosIniciais: 0,
        ingressosAdicionais: 0,
      }
    );

    const alunosComRegistro = new Set(
      dados.map((c) => String(c.aluno || '')).filter(Boolean)
    );

    resumo.semResposta = terceiros.filter((a) => !alunosComRegistro.has(String(a._id))).length;
    resumo.cadeirasDisponiveis = Math.max(
      resumo.capacidadeMaximaCadeiras - resumo.cadeirasSolicitadas,
      0
    );

    resumo.percentualRecebido =
      resumo.valorPrevisto > 0
        ? Number(((resumo.valorRecebido / resumo.valorPrevisto) * 100).toFixed(1))
        : 0;

    resumo.percentualInadimplencia =
      resumo.valorPrevisto > 0
        ? Number(((resumo.valorPendente / resumo.valorPrevisto) * 100).toFixed(1))
        : 0;

    res.json({
      ok: true,
      resumo,
      porTurma: Array.from(porTurmaMap.values()).sort((a, b) =>
        String(a.turma).localeCompare(String(b.turma), 'pt-BR')
      ),
      porFormaPagamento: [
        { forma: 'PIX', valor: resumo.pagamentosPix },
        { forma: 'Dinheiro', valor: resumo.pagamentosDinheiro },
        { forma: 'Misto', valor: resumo.pagamentosMisto },
        { forma: 'Outro', valor: resumo.pagamentosOutro },
      ],
      listas: {
        inadimplentes: dados.filter((c) => c.status === 'atrasado'),
        contratosPendentes: dados.filter((c) => !c.contratoAssinado && contratoContaComoParticipante(c)),
        quitados: dados.filter((c) => c.status === 'quitado'),
        participantes: dados.filter((c) => contratoContaComoParticipante(c)),
        naoParticipam: dados.filter((c) => c.statusParticipacao === 'nao_participa'),
        semResposta: terceiros.filter((a) => !alunosComRegistro.has(String(a._id))),
      },
    });
  } catch (err) {
    console.error('[BAILE][DASHBOARD_PRO]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao gerar dashboard do baile.',
    });
  }
});

module.exports = router;