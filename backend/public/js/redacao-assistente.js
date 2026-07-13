(function(global) {
  'use strict';

  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const words = (s) =>
    String(s || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const groups = {
    adicao: ['além disso', 'ademais', 'também', 'somado a isso', 'outrossim'],
    contraste: ['porém', 'contudo', 'todavia', 'entretanto', 'no entanto'],
    causa: ['porque', 'pois', 'visto que', 'devido a', 'em razão de'],
    consequencia: ['portanto', 'logo', 'assim', 'desse modo', 'por conseguinte'],
    exemplificacao: ['por exemplo', 'como se observa', 'a exemplo de'],
    conclusao: ['portanto', 'dessa forma', 'desse modo', 'em suma', 'assim']
  };

  function hasAny(s, list) {
    const n = norm(s);
    return list.filter((x) => n.includes(norm(x)));
  }

  function sentences(s) {
    return String(s || '')
      .split(/[.!?]+/)
      .map((x) => x.trim())
      .filter((x) => words(x).length > 2);
  }

  function paragraphs(s) {
    return String(s || '')
      .split(/\n+/)
      .map((x) => x.trim())
      .filter((x) => words(x).length > 3);
  }

  function repetitions(s) {
    const stop = new Set(
      'a o e de da do das dos em um uma para por com que se no na nos nas ao aos as os como mais mas ou sua seu suas seus esse essa isso entre sobre'.split(
        ' '
      )
    );
    const mapa = {};

    words(norm(s)).forEach((palavra) => {
      palavra = palavra.replace(/[^a-z0-9]/g, '');
      if (palavra.length > 4 && !stop.has(palavra)) {
        mapa[palavra] = (mapa[palavra] || 0) + 1;
      }
    });

    return Object.entries(mapa)
      .filter(([, quantidade]) => quantidade >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }

  function themeTerms(theme) {
    return [
      ...(theme?.palavrasChave || []),
      ...words(theme?.titulo || '').filter((x) => x.length > 4),
      ...words(theme?.proposta || '').filter((x) => x.length > 5)
    ]
      .map(norm)
      .filter(Boolean);
  }

  function detectarConclusao(paragrafo = '') {
    const n = norm(paragrafo);
    const marcadorConclusivo =
      /(^|\s)(portanto|dessa forma|desse modo|assim|logo|em suma|por fim)(,|\s)/.test(
        n
      );
    const proposta =
      /(deve|devem|devera|deverao|precisa|precisam|promover|criar|implementar|ampliar|garantir|oferecer|instituir|desenvolver|fiscalizar|monitorar)/.test(
        n
      );
    const finalidade =
      /(a fim de|para que|com o objetivo|visando|de modo a|com a finalidade)/.test(
        n
      );

    return marcadorConclusivo || (proposta && finalidade);
  }

  function detectarTese(introducao = '') {
    return /(deve|precisa|necessario|necessaria|fundamental|desafio|problema|obstaculo|decorre|resulta|defende|urge|torna-se|principais causas|principais desafios)/i.test(
      introducao
    );
  }

  function detectarIntervencao(textoFinal = '') {
    const n = norm(textoFinal);

    return {
      agente:
        /(governo|estado|municipio|ministerio|secretaria|escola|instituicao|sociedade|midia|familia|empresas|poder publico|comunidade|ong|organizacoes|gestores|professores|equipes)/.test(
          n
        ),
      acao:
        /(deve|devem|devera|deverao|promover|criar|implementar|ampliar|fiscalizar|garantir|desenvolver|oferecer|instituir|monitorar|realizar|elaborar|fortalecer|capacitar|investir)/.test(
          n
        ),
      meio:
        /(por meio|mediante|atraves|via|a partir|com a criacao|com a oferta|com investimento|por interm[eé]dio|em parceria|utilizando|com equipes|com programas|com projetos|com campanhas|com cursos|com oficinas)/.test(
          n
        ),
      finalidade:
        /(a fim de|para que|com o objetivo|visando|de modo a|com a finalidade|para reduzir|para garantir|para promover|para combater|para assegurar)/.test(
          n
        ),
      detalhe:
        /(tais como|por exemplo|especialmente|sobretudo|incluindo|responsavel por|responsaveis por|periodicamente|individualizado|continuo|formadas por|composto por|de forma|junto as familias|junto às famílias)/.test(
          n
        )
    };
  }

  function analisarEstrutura(ps) {
    const intro = ps[0] || '';
    const ultima = ps[ps.length - 1] || '';
    const conclusaoDetectada = ps.length >= 2 && detectarConclusao(ultima);
    const fimDesenvolvimento = conclusaoDetectada ? ps.length - 1 : ps.length;
    const desenvolvimentos = ps.slice(1, fimDesenvolvimento);

    return {
      introducao: intro,
      introducaoDetectada: words(intro).length >= 20,
      desenvolvimentos,
      conclusao: conclusaoDetectada ? ultima : '',
      conclusaoDetectada,
      tese: detectarTese(intro)
    };
  }

  function analyze(text, theme, telemetry = {}) {
    const p = paragraphs(text);
    const w = words(text);
    const s = sentences(text);
    const n = norm(text);
    const alerts = [];

    const conn = {};
    Object.entries(groups).forEach(([k, v]) => {
      conn[k] = hasAny(n, v);
    });

    const terms = [...new Set(themeTerms(theme))];
    const covered = terms.filter((x) => n.includes(x));
    const thematic = terms.length
      ? covered.length / Math.min(terms.length, 10)
      : 0;

    const estrutura = analisarEstrutura(p);
    const repertory =
      /(constituicao|constituição|ibge|onu|unesco|oms|anpd|lei\s|artigo\s|pesquisa|estudo|segundo\s+[a-z]|estatuto|lgpd)/i.test(
        text
      );

    const baseIntervencao =
      estrutura.conclusao ||
      (p.length ? p.slice(Math.max(0, p.length - 2)).join(' ') : '');
    const intervention = detectarIntervencao(baseIntervencao);
    const interventionCount = Object.values(intervention).filter(Boolean).length;

    const avg = s.length ? w.length / s.length : 0;
    const reps = repetitions(text);
    const connectiveKinds = Object.values(conn).filter((x) => x.length).length;

    if (w.length < 120) {
      alerts.push({
        level: 'alta',
        text: 'O texto ainda está curto para uma redação completa. Aprofunde os argumentos antes da revisão final.'
      });
    }

    if (p.length < 3) {
      alerts.push({
        level: 'alta',
        text: 'A estrutura ainda precisa apresentar introdução, desenvolvimento e conclusão.'
      });
    } else if (
      estrutura.conclusaoDetectada &&
      estrutura.desenvolvimentos.length === 1
    ) {
      alerts.push({
        level: 'media',
        text: 'A estrutura com um desenvolvimento é válida, mas um segundo argumento pode aprofundar a C3.'
      });
    }

    if (!estrutura.tese && w.length > 60) {
      alerts.push({
        level: 'alta',
        text: 'A tese ainda não está clara na introdução: indique o posicionamento que será defendido.'
      });
    }

    if (!estrutura.conclusaoDetectada && w.length > 100) {
      alerts.push({
        level: 'alta',
        text: 'A conclusão ainda não foi reconhecida. Retome a tese e apresente uma intervenção ligada ao problema.'
      });
    }

    if (thematic < 0.2 && w.length > 80) {
      alerts.push({
        level: 'alta',
        text: 'Retome com mais clareza o recorte central do tema, sem apenas repetir o título.'
      });
    }

    if (connectiveKinds < 3 && w.length > 100) {
      alerts.push({
        level: 'media',
        text: 'Varie os conectivos entre causa, contraste, adição e consequência.'
      });
    }

    if (!repertory && w.length > 100) {
      alerts.push({
        level: 'media',
        text: 'Inclua um repertório pertinente e explique como ele sustenta o argumento.'
      });
    }

    if (interventionCount < 3 && estrutura.conclusaoDetectada) {
      alerts.push({
        level: 'alta',
        text: 'Detalhe a intervenção: indique com mais clareza quem agirá, o que será feito e com qual finalidade.'
      });
    } else if (interventionCount < 5 && estrutura.conclusaoDetectada) {
      alerts.push({
        level: 'media',
        text: 'A intervenção foi identificada, mas pode ganhar meio de execução ou detalhamento.'
      });
    }

    if (avg > 32) {
      alerts.push({
        level: 'media',
        text: 'Há períodos muito longos. Divida algumas frases para melhorar a clareza.'
      });
    }

    if (reps.length) {
      alerts.push({
        level: 'baixa',
        text: `Revise repetições frequentes, especialmente: ${reps
          .map((x) => x[0])
          .join(', ')}.`
      });
    }

    if ((telemetry.proporcaoColada || 0) > 0.65) {
      alerts.push({
        level: 'integridade',
        text: 'Uma grande parte do texto foi inserida por colagem. Revise e confirme que o conteúdo corresponde à sua própria produção.'
      });
    }

    let readiness = 0;
    readiness += Math.min(15, (w.length / 220) * 15);
    readiness += estrutura.introducaoDetectada ? 8 : 0;
    readiness += estrutura.tese ? 10 : 0;
    readiness += Math.min(18, estrutura.desenvolvimentos.length * 10);
    readiness += estrutura.conclusaoDetectada ? 10 : 0;
    readiness += Math.min(10, thematic * 28);
    readiness += Math.min(10, connectiveKinds * 3);
    readiness += repertory ? 8 : 0;
    readiness += interventionCount * 2.2;

    readiness = Math.round(Math.min(100, readiness));

    if (w.length < 120) readiness = Math.min(readiness, 65);
    if (!estrutura.tese) readiness = Math.min(readiness, 75);
    if (!estrutura.conclusaoDetectada) readiness = Math.min(readiness, 75);
    if (interventionCount < 3) readiness = Math.min(readiness, 82);
    else if (interventionCount < 4) readiness = Math.min(readiness, 88);
    else if (interventionCount < 5) readiness = Math.min(readiness, 94);

    return {
      wordCount: w.length,
      paragraphs: p,
      sentences: s,
      avgSentenceWords: avg,
      thesis: estrutura.tese,
      repertory,
      thematic,
      covered,
      connectives: conn,
      intervention,
      interventionCount,
      structure: estrutura,
      repetitions: reps,
      readiness,
      alerts: alerts.slice(0, 3)
    };
  }

  function ensurePanel() {
    let el = document.getElementById('assistenteProgresso');
    if (el) return el;

    const ref = document.getElementById('alertasRedacao');
    if (!ref) return null;

    el = document.createElement('div');
    el.id = 'assistenteProgresso';
    el.className = 'assistente-progresso';
    ref.parentNode.insertBefore(el, ref);
    return el;
  }

  function marcarStep(step, status, texto) {
    if (!step) return;
    step.classList.remove('done', 'warn', 'bad');
    step.classList.add(status);
    const small = step.querySelector('small');
    if (small) small.textContent = texto;
  }

  function apply(report) {
    const panel = ensurePanel();
    const interventionCount =
      report.interventionCount ??
      Object.values(report.intervention || {}).filter(Boolean).length;

    if (panel) {
      const mensagem =
        report.readiness === 100
          ? 'Texto pronto para a etapa de revisão'
          : `${report.readiness}% dos critérios formativos identificados`;

      panel.innerHTML =
        `<div class="assistente-top"><strong>Assistente de escrita</strong><span>${mensagem}</span></div>` +
        `<div class="assistente-bar"><i style="width:${report.readiness}%"></i></div>` +
        `<div class="assistente-metricas">` +
        `<span>${report.wordCount} palavras</span>` +
        `<span>${report.paragraphs.length} parágrafos</span>` +
        `<span>${report.thesis ? 'tese detectada' : 'tese a esclarecer'}</span>` +
        `<span>${interventionCount}/5 intervenção</span>` +
        `</div>` +
        `<small>Indicador formativo: não é uma nota ENEM.</small>`;
    }

    document.querySelectorAll('.competencia-live').forEach((c) => {
      const k = c.dataset.comp;
      let ok = false;

      if (k === 'c2') ok = report.thematic >= 0.2;
      if (k === 'c3') {
        ok =
          report.structure?.desenvolvimentos?.length >= 1 &&
          report.thesis;
      }
      if (k === 'c4') {
        ok =
          Object.values(report.connectives).filter((x) => x.length).length >=
          3;
      }
      if (k === 'c5') ok = interventionCount >= 4;

      c.classList.toggle('active', ok);
      c.classList.toggle('warn', !ok);
    });

    const alertas = document.getElementById('alertasRedacao');
    if (alertas) {
      alertas.innerHTML =
        report.alerts
          .map(
            (x) =>
              `<div class="alerta-redacao ${
                x.level === 'alta' || x.level === 'integridade' ? 'bad' : ''
              }">${x.text}</div>`
          )
          .join('') ||
        '<div class="alerta-redacao">Seu texto possui uma base consistente. Faça uma revisão final de clareza, linguagem e autoria.</div>';
    }

    const steps = [
      ...document.querySelectorAll('[data-estrutura-step]')
    ];
    const estrutura = report.structure || {};
    const devs = estrutura.desenvolvimentos || [];

    marcarStep(
      steps[0],
      estrutura.introducaoDetectada ? 'done' : 'warn',
      estrutura.introducaoDetectada ? 'Identificada' : 'Curta ou ausente'
    );

    marcarStep(
      steps[1],
      devs[0] && words(devs[0]).length >= 25 ? 'done' : 'warn',
      devs[0]
        ? words(devs[0]).length >= 25
          ? 'Identificado'
          : 'Curto'
        : 'Faltando'
    );

    if (devs[1]) {
      marcarStep(
        steps[2],
        words(devs[1]).length >= 25 ? 'done' : 'warn',
        words(devs[1]).length >= 25 ? 'Identificado' : 'Curto'
      );
    } else if (devs.length === 1 && estrutura.conclusaoDetectada) {
      marcarStep(steps[2], 'done', 'Opcional para aprofundar');
    } else {
      marcarStep(steps[2], 'warn', 'Faltando');
    }

    marcarStep(
      steps[3],
      estrutura.conclusaoDetectada ? 'done' : 'warn',
      estrutura.conclusaoDetectada ? 'Identificada' : 'Faltando'
    );
  }

  global.AxoriinRedacaoAssistente = {
    analisar: analyze,
    aplicar: apply
  };
})(window);
