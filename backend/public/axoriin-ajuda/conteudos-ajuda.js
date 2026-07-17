window.AXORIIN_HELP_CONTENT = {
  "default": {
    "title": "Ajuda desta página",
    "summary": "Use esta área para consultar orientações rápidas sobre a tela atual. As dicas são locais e não alteram seus dados.",
    "steps": [
      "Observe o título e os filtros disponíveis.",
      "Preencha apenas os campos necessários.",
      "Revise as informações antes de confirmar qualquer operação."
    ],
    "tips": [
      "Passe o mouse sobre botões ou campos para verificar descrições adicionais.",
      "Em operações importantes, confirme os dados antes de concluir."
    ],
    "warning": "Em caso de dúvida sobre uma ação irreversível, interrompa a operação e confirme o procedimento com a coordenação responsável."
  },
  "painel.html": {
    "title": "Painel principal",
    "summary": "Esta é a visão geral do Axoriin. Use os indicadores para identificar prioridades e os módulos para acessar cada área de trabalho.",
    "steps": [
      "Confira os indicadores superiores.",
      "Acesse o módulo correspondente à tarefa que deseja realizar.",
      "Use alertas e análises para priorizar acompanhamentos."
    ],
    "tips": [
      "Os indicadores são atualizados com os dados do sistema.",
      "Use Relatórios e Estatísticas para análises mais detalhadas."
    ],
    "tour": [
      {
        "selector": ".metrics",
        "title": "Indicadores principais",
        "text": "Aqui você acompanha rapidamente os números mais importantes do sistema."
      },
      {
        "selector": ".cards, .modules-grid, .grid-cards",
        "title": "Módulos do sistema",
        "text": "Escolha um módulo para iniciar uma tarefa específica."
      },
      {
        "selector": ".sidebar, nav",
        "title": "Navegação",
        "text": "Use o menu para alternar entre as áreas do Axoriin."
      }
    ]
  },
  "lista-alunos.html": {
    "title": "Central de Alunos",
    "summary": "Localize rapidamente qualquer estudante por nome, matrícula ou turma e abra sua ficha individual.",
    "steps": [
      "Digite pelo menos duas letras do nome.",
      "Use a turma como filtro opcional.",
      "Selecione o resultado correto para abrir a ficha."
    ],
    "warning": "Confira nome e turma antes de editar ou excluir um cadastro.",
    "tour": [
      {
        "selector": "input[type=search], input[placeholder*=\"nome\" i]",
        "title": "Busca global",
        "text": "Pesquise diretamente pelo nome do estudante sem precisar abrir uma turma."
      },
      {
        "selector": "select",
        "title": "Filtro opcional",
        "text": "Restrinja os resultados a uma turma quando necessário."
      },
      {
        "selector": ".resultados, .students-list, .lista-alunos",
        "title": "Resultados",
        "text": "Os estudantes encontrados aparecem aqui para acesso rápido."
      }
    ]
  },
  "ficha-aluno.html": {
    "title": "Ficha do aluno",
    "summary": "Consulte o histórico, comportamento, registros e informações do estudante em um único lugar.",
    "steps": [
      "Confirme os dados do aluno.",
      "Escolha a aba ou seção desejada.",
      "Registre novas informações apenas quando necessário."
    ],
    "warning": "Registros disciplinares e observações passam a integrar o histórico do estudante."
  },
  "cadastro-aluno.html": {
    "title": "Cadastrar novo aluno",
    "summary": "Adicione um estudante ao sistema e vincule-o corretamente à turma de entrada.",
    "steps": [
      "Informe o nome completo.",
      "Selecione a turma correta.",
      "Preencha data de entrada e contato do responsável.",
      "Revise e clique em Cadastrar."
    ],
    "warning": "Evite cadastros duplicados. Pesquise o aluno na Central de Alunos antes de criar um novo registro.",
    "tour": [
      {
        "selector": "input[name=nome], #nome, input[placeholder*=\"nome\" i]",
        "title": "Identificação",
        "text": "Digite o nome completo do estudante como consta nos documentos escolares."
      },
      {
        "selector": "select",
        "title": "Turma",
        "text": "Escolha a turma atual do aluno."
      },
      {
        "selector": "button[type=submit], .btn-cadastrar",
        "title": "Finalizar cadastro",
        "text": "Revise os campos antes de concluir."
      }
    ]
  },
  "transferir-turma.html": {
    "title": "Transferência de alunos",
    "summary": "Mova uma turma inteira ou estudantes específicos para outra turma, reduzindo o trabalho de recadastro.",
    "steps": [
      "Escolha o modo de transferência.",
      "Selecione a turma de origem.",
      "Informe a turma de destino.",
      "Selecione os alunos quando necessário.",
      "Revise o resumo e confirme."
    ],
    "warning": "A transferência altera a turma atual dos estudantes. Confira origem, destino e quantidade antes de concluir.",
    "tour": [
      {
        "selector": ".mode-selector, [data-mode], .transfer-mode",
        "title": "Modo da transferência",
        "text": "Escolha entre turma inteira ou alunos específicos."
      },
      {
        "selector": "#turmaOrigem, [name=turmaOrigem], .origin-card select",
        "title": "Turma de origem",
        "text": "Selecione de onde os alunos sairão."
      },
      {
        "selector": "#turmaDestino, [name=turmaDestino], .destination-card select",
        "title": "Turma de destino",
        "text": "Selecione para onde os alunos serão movidos."
      },
      {
        "selector": ".transfer-summary, .resumo-transferencia",
        "title": "Resumo",
        "text": "Confira a operação antes de confirmar."
      }
    ]
  },
  "cadastrar-notificacao.html": {
    "title": "Emitir notificação",
    "summary": "Registre uma ocorrência ou reconhecimento vinculando corretamente estudante, motivo e observação.",
    "steps": [
      "Selecione o aluno.",
      "Escolha o tipo e o motivo adequado.",
      "Descreva objetivamente o ocorrido.",
      "Revise antes de emitir."
    ],
    "warning": "Use linguagem objetiva, respeitosa e baseada nos fatos observados."
  },
  "editar-notificacao.html": {
    "title": "Corrigir notificação",
    "summary": "Ajuste os pontos solicitados pela coordenação antes de reenviar a notificação para análise.",
    "steps": [
      "Leia o motivo da devolução.",
      "Corrija os campos indicados.",
      "Revise o texto completo.",
      "Reenvie para validação."
    ],
    "warning": "Não altere informações essenciais sem verificar o registro original do ocorrido."
  },
  "controle-notificacoes.html": {
    "title": "Validação de notificações",
    "summary": "Analise as notificações antes do envio aos responsáveis, garantindo clareza, coerência e conformidade.",
    "steps": [
      "Selecione uma notificação pendente.",
      "Confira aluno, turma, motivo e observação.",
      "Revise a prévia da comunicação.",
      "Defira ou solicite correção."
    ],
    "warning": "Ao deferir, a notificação poderá seguir para o responsável. Confirme todos os dados antes da decisão.",
    "tour": [
      {
        "selector": ".notifications-list, .notification-list, .inbox-list",
        "title": "Fila de análise",
        "text": "Selecione aqui a notificação que será conferida."
      },
      {
        "selector": ".detail-panel, .notification-detail, .details-panel",
        "title": "Detalhes",
        "text": "Confira os dados do incidente e do estudante."
      },
      {
        "selector": ".decision-area, .action-panel, .validation-actions",
        "title": "Decisão",
        "text": "Defira, solicite correção ou arquive conforme a análise."
      }
    ]
  },
  "notificacoes.html": {
    "title": "Notificações",
    "summary": "Consulte notificações emitidas, acompanhe o status e verifique a ciência on-line dos responsáveis.",
    "steps": [
      "Use os filtros para localizar registros.",
      "Abra a notificação desejada.",
      "Confira envio, visualização e ciência do responsável."
    ],
    "tips": [
      "A ciência on-line substitui o antigo controle de devolução física.",
      "Use o histórico para auditoria e acompanhamento."
    ]
  },
  "processos-disciplinares.html": {
    "title": "Processos disciplinares",
    "summary": "Acompanhe procedimentos disciplinares e organize as etapas, documentos e decisões de cada caso.",
    "steps": [
      "Localize o estudante ou processo.",
      "Confira a etapa atual.",
      "Registre documentos e decisões.",
      "Revise antes de finalizar uma etapa."
    ],
    "warning": "Procedimentos disciplinares exigem registro claro, cronológico e fundamentado."
  },
  "configuracao-disciplinar.html": {
    "title": "Configuração disciplinar",
    "summary": "Defina tipos, classificações, valores e regras utilizadas nas notificações e no comportamento.",
    "steps": [
      "Escolha a categoria que deseja configurar.",
      "Edite somente os campos necessários.",
      "Revise impactos em notificações futuras.",
      "Salve as alterações."
    ],
    "warning": "Mudanças podem afetar cálculos e novos registros. Faça ajustes com cautela."
  },
  "configuracao-documentos.html": {
    "title": "Configuração de documentos",
    "summary": "Personalize brasões, cabeçalhos, rodapés e identidade dos documentos gerados pelo sistema.",
    "steps": [
      "Confira a instituição selecionada.",
      "Ajuste textos e imagens.",
      "Use a prévia quando disponível.",
      "Salve e teste um documento."
    ],
    "warning": "Verifique a qualidade das imagens e os dados institucionais antes de publicar."
  },
  "comunicacao-pais.html": {
    "title": "Comunicação com responsáveis",
    "summary": "Envie comunicações institucionais e acompanhe os canais disponíveis para cada família.",
    "steps": [
      "Defina os destinatários.",
      "Escolha ou escreva a mensagem.",
      "Revise o conteúdo.",
      "Confirme o envio."
    ],
    "warning": "Não inclua dados sensíveis além do necessário para a comunicação."
  },
  "estatisticas.html": {
    "title": "Relatórios e Estatísticas",
    "summary": "Cruze dados de comportamento, turmas, alunos e APH para orientar decisões da gestão escolar.",
    "steps": [
      "Defina o período e a turma.",
      "Aplique os filtros.",
      "Leia o resumo estratégico.",
      "Analise turmas e estudantes prioritários.",
      "Use as recomendações para planejar ações."
    ],
    "tips": [
      "As devolutivas são baseadas nos dados registrados no período.",
      "Combine a leitura dos gráficos com observação pedagógica e escuta da equipe."
    ],
    "tour": [
      {
        "selector": ".filters",
        "title": "Filtros",
        "text": "Defina o recorte que deseja analisar."
      },
      {
        "selector": "#summaryKpis, .summary-grid",
        "title": "Resumo executivo",
        "text": "Veja os principais indicadores do período."
      },
      {
        "selector": "#cardParecerIA, .strategic-main",
        "title": "Leitura estratégica",
        "text": "Aqui estão os pontos fortes, alertas e recomendações."
      }
    ]
  },
  "financeiro.html": {
    "title": "Módulo financeiro",
    "summary": "Acesse as áreas financeiras do sistema, como rifas e baile de formatura.",
    "steps": [
      "Escolha a área financeira desejada.",
      "Confira os dados antes de registrar movimentações.",
      "Use relatórios para conferência."
    ],
    "warning": "Operações financeiras devem ser conferidas antes da confirmação."
  },
  "rifas.html": {
    "title": "Controle de rifas",
    "summary": "Gerencie numeração, vendas, responsáveis e relatórios das rifas.",
    "steps": [
      "Confira a faixa de números.",
      "Registre ou localize o responsável.",
      "Atualize o status da rifa.",
      "Exporte relatórios quando necessário."
    ],
    "warning": "Evite duplicidade de números e confirme os registros financeiros."
  },
  "baile-formatura.html": {
    "title": "Baile de formatura",
    "summary": "Gerencie participantes, pagamentos e informações financeiras do baile.",
    "steps": [
      "Localize o estudante ou participante.",
      "Confira parcelas e situação.",
      "Registre pagamentos corretamente.",
      "Emita relatórios de conferência."
    ],
    "warning": "Confirme valor, data e identificação antes de registrar um pagamento."
  },
  "usuarios.html": {
    "title": "Usuários do sistema",
    "summary": "Gerencie acessos, perfis e permissões dos usuários do Axoriin.",
    "steps": [
      "Localize o usuário.",
      "Confira o perfil e a instituição.",
      "Edite apenas as permissões necessárias.",
      "Salve e teste o acesso."
    ],
    "warning": "Permissões elevadas devem ser concedidas somente a usuários autorizados."
  },
  "cadastro-usuario.html": {
    "title": "Cadastrar usuário",
    "summary": "Crie um novo acesso e defina corretamente perfil, instituição e permissões.",
    "steps": [
      "Informe os dados do usuário.",
      "Escolha o perfil adequado.",
      "Defina a instituição.",
      "Revise e cadastre."
    ],
    "warning": "Não compartilhe senhas e conceda apenas as permissões necessárias."
  },
  "logs.html": {
    "title": "Logs e auditoria",
    "summary": "Consulte ações registradas pelo sistema para conferência, segurança e auditoria.",
    "steps": [
      "Defina filtros de período ou usuário.",
      "Localize a ação desejada.",
      "Abra os detalhes para análise."
    ],
    "tips": [
      "Os logs ajudam a identificar quando e por quem uma ação foi realizada."
    ]
  },
  "gestao-sistema.html": {
    "title": "Gestão do sistema",
    "summary": "Acesse configurações administrativas, usuários, documentos e auditoria.",
    "steps": [
      "Escolha a área que deseja administrar.",
      "Faça alterações de forma controlada.",
      "Revise o impacto antes de salvar."
    ],
    "warning": "Configurações globais podem afetar vários usuários e módulos."
  },
  "observatorio.html": {
    "title": "Observatório Educacional",
    "summary": "Acompanhe indicadores e alertas para apoiar prevenção, proteção e intervenção escolar.",
    "steps": [
      "Escolha o indicador ou recorte.",
      "Identifique padrões e alertas.",
      "Abra os casos relevantes.",
      "Planeje o acompanhamento."
    ],
    "warning": "Indicadores apoiam a decisão, mas não substituem análise pedagógica e escuta qualificada."
  },
  "livro-ocorrencias.html": {
    "title": "Livro de ocorrências",
    "summary": "Registre e consulte ocorrências institucionais de forma cronológica e organizada.",
    "steps": [
      "Selecione o tipo de registro.",
      "Descreva o fato objetivamente.",
      "Informe envolvidos e providências.",
      "Revise e salve."
    ],
    "warning": "Registre fatos verificáveis e evite julgamentos ou linguagem inadequada."
  },
  "aph-atendimento.html": {
    "title": "Registrar atendimento APH",
    "summary": "Registre atendimentos pré-hospitalares, materiais utilizados, providências e desfecho.",
    "steps": [
      "Identifique o aluno e o local.",
      "Informe sinais, sintomas e tipo de ocorrência.",
      "Registre materiais e providências.",
      "Revise e finalize."
    ],
    "warning": "Em situações de urgência, priorize o atendimento e os protocolos de emergência."
  },
  "aph-atendimentos.html": {
    "title": "Atendimentos APH",
    "summary": "Consulte atendimentos registrados e use filtros para localizar casos específicos.",
    "steps": [
      "Defina período, turma ou tipo.",
      "Localize o atendimento.",
      "Abra o registro para conferir detalhes."
    ],
    "tips": [
      "Use os dados consolidados na página Relatórios e Estatísticas para ações preventivas."
    ]
  },
  "ranking-alunos.html": {
    "title": "Ranking de alunos",
    "summary": "Acompanhe o desempenho comportamental e os critérios de reconhecimento do sistema.",
    "steps": [
      "Defina o período ou turma.",
      "Confira os critérios apresentados.",
      "Analise o ranking com o histórico individual."
    ],
    "warning": "Evite interpretações isoladas; considere contexto, evolução e registros do estudante."
  },
  "associacao.html": {
    "title": "Gestão da Associação",
    "summary": "Gerencie associados, entradas, saídas, pendências e relatórios financeiros da Associação.",
    "steps": [
      "Escolha a área de trabalho.",
      "Localize o associado ou lançamento.",
      "Registre os dados.",
      "Confira relatórios e pendências."
    ],
    "warning": "Movimentações financeiras devem ser registradas com identificação e conferência."
  },
  "master-instituicoes.html": {
    "title": "Instituições",
    "summary": "Administre instituições vinculadas ao Axoriin, configurações e acessos principais.",
    "steps": [
      "Localize a instituição.",
      "Abra os detalhes.",
      "Altere somente o necessário.",
      "Salve e valide o acesso."
    ],
    "warning": "Alterações de tenant ou instituição podem afetar acessos e dados vinculados."
  },
  "master-associacoes.html": {
    "title": "Associações",
    "summary": "Administre as associações vinculadas às instituições do sistema.",
    "steps": [
      "Localize a associação.",
      "Confira a instituição vinculada.",
      "Gerencie acesso e configurações."
    ],
    "warning": "Confirme o vínculo institucional antes de criar ou alterar acessos."
  },
  "painel-site.html": {
    "title": "Administração do site",
    "summary": "Gerencie notícias, banners, páginas e conteúdo público do site institucional.",
    "steps": [
      "Escolha o tipo de conteúdo.",
      "Edite textos e imagens.",
      "Use a prévia.",
      "Publique após revisão."
    ],
    "warning": "Conteúdo publicado fica visível ao público. Revise ortografia, datas e imagens."
  },
  "site-analytics.html": {
    "title": "Estatísticas do site",
    "summary": "Acompanhe acessos e comportamento dos visitantes no site institucional.",
    "steps": [
      "Escolha o período.",
      "Observe páginas e origens mais acessadas.",
      "Use os dados para melhorar o conteúdo."
    ],
    "tips": [
      "Variações pequenas devem ser analisadas em períodos mais longos."
    ]
  },
  "admin-redacao.html": {
    "title": "Administração de redações",
    "summary": "Gerencie propostas, correções e devolutivas do módulo de redação.",
    "steps": [
      "Escolha a modalidade ou turma.",
      "Localize a produção.",
      "Revise critérios e devolutiva.",
      "Salve ou publique o resultado."
    ],
    "warning": "Confirme a autoria, turma e versão do texto antes de finalizar a correção."
  }
};
