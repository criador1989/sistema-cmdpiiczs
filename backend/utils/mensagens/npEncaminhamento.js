// backend/utils/mensagens/npEncaminhamento.js
// Gera { subject, text, html } para o caso de encaminhamento ao NP (nota 5,00–6,99).

function montarEmailNP({
  aluno,
  turma,
  notaAtual,
  linkAgendamento,
  contatoEscola,

  // novos campos opcionais por instituição/tenant
  siglaInstituicao,
  nomeInstituicao,
  setorResponsavel,
  subtituloEmail,
  cabecalhoEmail,
  mensagemAutomatica,
  rodapeAviso,
  baseNormativaTitulo,
  baseNormativaTexto,
  proximosPassos,
  observacaoFinal
}) {
  const nome = String(aluno || '').trim();
  const turmaTxt = String(turma || '').trim();
  const nota = Number(notaAtual || 0);
  const notaFmt = Number.isFinite(nota) ? nota.toFixed(2) : String(notaAtual || '');

  // =========================
  // FALLBACKS SEGUROS
  // =========================
  // Prioriza nome da instituição para evitar herdar sigla antiga de outro tenant.
  const instituicaoPrincipal =
    String(nomeInstituicao || siglaInstituicao || 'CMDPII/CZS').trim();

  const siglaOuNomeCurto =
    String(siglaInstituicao || nomeInstituicao || 'CMDPII/CZS').trim();

  const setorLabel =
    String(setorResponsavel || cabecalhoEmail || 'Coordenação de Ensino').trim();

  const tituloCabecalho = `${instituicaoPrincipal} – ${setorLabel}`;

  const subtituloCab =
    String(subtituloEmail || 'Notificação de Encaminhamento ao Núcleo Psicossocial').trim();

  const assinaturaFinal = `${setorLabel} – ${instituicaoPrincipal}`;

  const mensagemAutomaticaFinal =
    String(mensagemAutomatica || `Mensagem automática do Sistema Escolar – ${instituicaoPrincipal}.`).trim();

  const rodapeAvisoFinal =
    String(rodapeAviso || 'Caso já tenha ocorrido o atendimento no NP, desconsidere esta mensagem.').trim();

  const baseNormativaTituloFinal =
    String(baseNormativaTitulo || 'Base normativa').trim();

  const baseNormativaTextoFinal =
    String(
      baseNormativaTexto ||
      'Art. 51 — “Encaminhar ao Núcleo Psicossocial (NP) e registrar no histórico. O NP deve informar os responsáveis.”'
    ).trim();

  const observacaoFinalTexto =
    String(
      observacaoFinal ||
      'Pedimos acompanhamento e alinhamento com a Monitoria/Coordenação. Em caso de dúvidas, estamos à disposição.'
    ).trim();

  const passos = Array.isArray(proximosPassos) && proximosPassos.length
    ? proximosPassos
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    : [
        'Encaminhamento ao NP para escuta e orientação;',
        'Registro no histórico escolar;',
        'Contato do NP com os responsáveis;',
        'Acompanhamento conjunto com a monitoria.'
      ];

  const assunto = `[${siglaOuNomeCurto}] Encaminhamento ao Núcleo Psicossocial – ${nome} (${turmaTxt})`;

  const texto =
`Prezados responsáveis de ${nome} (${turmaTxt}),

Informamos que a Nota de Comportamento atual do(a) estudante é ${notaFmt} — classificação: REGULAR (entre 5,00 e 6,99).

Conforme o Regulamento Disciplinar, o aluno deverá ser encaminhado ao Núcleo Psicossocial (NP):
${baseNormativaTextoFinal}

Próximos passos:
${passos.map((p) => `• ${p.replace(/[;.]$/, '')}`).join('\n')}

${linkAgendamento ? `Agende por aqui: ${linkAgendamento}\n` : ''}Em caso de dúvidas: ${contatoEscola || ''}

${observacaoFinalTexto}

Atenciosamente,
${assinaturaFinal}`;

  const html = `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><title>Encaminhamento ao NP</title>
</head><body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif;color:#222;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:620px;max-width:100%;background:#ffffff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.06);overflow:hidden;border:1px solid #eceff3;">
    <tr>
      <td style="background:#8B0000;padding:16px 22px;color:#fff;">
        <div style="font-weight:700;font-size:18px;letter-spacing:.2px;">${escapeHtml(tituloCabecalho)}</div>
        <div style="opacity:.9;font-size:13px;">${escapeHtml(subtituloCab)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:22px;">
        <p style="margin:0 0 10px 0;font-size:16px;">Prezados responsáveis de <b>${escapeHtml(nome)}</b> (<b>${escapeHtml(turmaTxt)}</b>),</p>

        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.5;">
          Informamos que a <b>Nota de Comportamento</b> atual do(a) estudante é
          <span style="display:inline-block;background:#fff3cd;color:#7a5a00;border:1px solid #ffe69c;padding:3px 8px;border-radius:999px;font-weight:700;">
            ${escapeHtml(notaFmt)} – REGULAR
          </span>
          (faixa entre 5,00 e 6,99).
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:14px 0 16px 0;">
          <tr>
            <td style="background:#fff7f7;border:1px solid #f3d1d1;border-radius:10px;padding:14px;">
              <div style="font-size:14px;color:#5a0c0d;font-weight:700;margin-bottom:6px;">${escapeHtml(baseNormativaTituloFinal)}</div>
              <div style="font-size:14px;color:#5a0c0d;line-height:1.5;">
                <em>${escapeHtml(baseNormativaTextoFinal)}</em>
              </div>
            </td>
          </tr>
        </table>

        <div style="font-size:15px;margin:0 0 10px 0;font-weight:700;">Próximos passos</div>
        <ul style="margin:0 0 16px 18px;padding:0;font-size:14.5px;line-height:1.55;">
          ${passos.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}
        </ul>

        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
          ${escapeHtml(observacaoFinalTexto)}
        </p>

        ${linkAgendamento ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 18px 0;"><tr><td>
          <a href="${escapeAttr(linkAgendamento)}" style="background:#8B0000;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;display:inline-block;font-weight:700;">Agendar atendimento no NP</a>
        </td></tr></table>` : ''}

        <p style="margin:0 0 4px 0;font-size:14px;color:#444;">Contato da escola: <b>${escapeHtml(contatoEscola || '')}</b></p>
        <p style="margin:0;font-size:13px;color:#6b6f76;">${escapeHtml(mensagemAutomaticaFinal)}</p>
      </td>
    </tr>
    <tr>
      <td style="background:#fafbfc;border-top:1px solid #eceff3;padding:14px 22px;color:#6b6f76;font-size:12.5px;">
        ${escapeHtml(rodapeAvisoFinal)}
      </td>
    </tr>
  </table>

  <div style="font-size:12px;color:#7b7f86;margin-top:10px;">
    Prévia: Encaminhamento ao NP – ${escapeHtml(nome)} (${escapeHtml(turmaTxt)}) • Nota ${escapeHtml(notaFmt)} – REGULAR
  </div>
</td></tr></table>
</body></html>`;

  return { subject: assunto, text: texto, html };
}

// Helpers simples de escapagem para HTML
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

module.exports = { montarEmailNP };