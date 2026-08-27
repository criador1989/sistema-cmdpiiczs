'use strict';

const FONTE_MATRIZ_ENEM = Object.freeze({
  titulo: 'Matrizes de Referência ENEM',
  orgao: 'INEP/MEC',
  ano: 2026,
  publicacao: 'abril de 2026',
  versao: 'ENEM-INEP-2026',
});

const AREAS = Object.freeze({
  LINGUAGENS: {
    codigo: 'LINGUAGENS',
    nome: 'Linguagens, Códigos e suas Tecnologias',
    competencias: [
      { codigo: 'CA1', descricao: 'Aplicar as tecnologias da comunicação e da informação na escola, no trabalho e em outros contextos relevantes para sua vida.', habilidades: {
        H1: 'Identificar as diferentes linguagens e seus recursos expressivos como elementos de caracterização dos sistemas de comunicação.',
        H2: 'Recorrer aos conhecimentos sobre as linguagens dos sistemas de comunicação e informação para resolver problemas sociais.',
        H3: 'Relacionar informações geradas nos sistemas de comunicação e informação, considerando a função social desses sistemas.',
        H4: 'Reconhecer posições críticas aos usos sociais que são feitos das linguagens e dos sistemas de comunicação e informação.',
      } },
      { codigo: 'CA2', descricao: 'Conhecer e usar língua(s) estrangeira(s) moderna(s) como instrumento de acesso a informações e a outras culturas e grupos sociais.', habilidades: {
        H5: 'Associar vocábulos e expressões de um texto em LEM ao seu tema.',
        H6: 'Utilizar os conhecimentos da LEM e de seus mecanismos como meio de ampliar as possibilidades de acesso a informações, tecnologias e culturas.',
        H7: 'Relacionar um texto em LEM, as estruturas linguísticas, sua função e seu uso social.',
        H8: 'Reconhecer a importância da produção cultural em LEM como representação da diversidade cultural e linguística.',
      } },
      { codigo: 'CA3', descricao: 'Compreender e usar a linguagem corporal como relevante para a própria vida, integradora social e formadora da identidade.', habilidades: {
        H9: 'Reconhecer as manifestações corporais de movimento como originárias de necessidades cotidianas de um grupo social.',
        H10: 'Reconhecer a necessidade de transformação de hábitos corporais em função das necessidades cinestésicas.',
        H11: 'Reconhecer a linguagem corporal como meio de interação social, considerando os limites de desempenho e as alternativas de adaptação para diferentes indivíduos.',
      } },
      { codigo: 'CA4', descricao: 'Compreender a arte como saber cultural e estético gerador de significação e integrador da organização do mundo e da própria identidade.', habilidades: {
        H12: 'Reconhecer diferentes funções da arte, do trabalho da produção dos artistas em seus meios culturais.',
        H13: 'Analisar as diversas produções artísticas como meio de explicar diferentes culturas, padrões de beleza e preconceitos.',
        H14: 'Reconhecer o valor da diversidade artística e das inter-relações de elementos que se apresentam nas manifestações de vários grupos sociais e étnicos.',
      } },
      { codigo: 'CA5', descricao: 'Analisar, interpretar e aplicar recursos expressivos das linguagens, relacionando textos com seus contextos, mediante a natureza, função, organização, estrutura das manifestações, de acordo com as condições de produção e recepção.', habilidades: {
        H15: 'Estabelecer relações entre o texto literário e o momento de sua produção, situando aspectos do contexto histórico, social e político.',
        H16: 'Relacionar informações sobre concepções artísticas e procedimentos de construção do texto literário.',
        H17: 'Reconhecer a presença de valores sociais e humanos atualizáveis e permanentes no patrimônio literário nacional.',
      } },
      { codigo: 'CA6', descricao: 'Compreender e usar os sistemas simbólicos das diferentes linguagens como meios de organização cognitiva da realidade pela constituição de significados, expressão, comunicação e informação.', habilidades: {
        H18: 'Identificar os elementos que concorrem para a progressão temática e para a organização e estruturação de textos de diferentes gêneros e tipos.',
        H19: 'Analisar a função da linguagem predominante nos textos em situações específicas de interlocução.',
        H20: 'Reconhecer a importância do patrimônio linguístico para a preservação da memória e da identidade nacional.',
      } },
      { codigo: 'CA7', descricao: 'Confrontar opiniões e pontos de vista sobre as diferentes linguagens e suas manifestações específicas.', habilidades: {
        H21: 'Reconhecer, em textos de diferentes gêneros, recursos verbais e não verbais utilizados com a finalidade de criar e mudar comportamentos e hábitos.',
        H22: 'Relacionar, em diferentes textos, opiniões, temas, assuntos e recursos linguísticos.',
        H23: 'Inferir em um texto quais são os objetivos de seu produtor e quem é seu público-alvo, pela análise dos procedimentos argumentativos utilizados.',
        H24: 'Reconhecer no texto estratégias argumentativas empregadas para o convencimento do público, tais como a intimidação, sedução, comoção, chantagem, entre outras.',
      } },
      { codigo: 'CA8', descricao: 'Compreender e usar a língua portuguesa como língua materna, geradora de significação e integradora da organização do mundo e da própria identidade.', habilidades: {
        H25: 'Identificar, em textos de diferentes gêneros, as marcas linguísticas que singularizam as variedades linguísticas sociais, regionais e de registro.',
        H26: 'Relacionar as variedades linguísticas a situações específicas de uso social.',
        H27: 'Reconhecer os usos da norma-padrão da língua portuguesa nas diferentes situações de comunicação.',
      } },
      { codigo: 'CA9', descricao: 'Entender os princípios, a natureza, a função e o impacto das tecnologias da comunicação e da informação na sua vida pessoal e social, no desenvolvimento do conhecimento, associando-os aos conhecimentos científicos, às linguagens que lhes dão suporte, às demais tecnologias, aos processos de produção e aos problemas que se propõem solucionar.', habilidades: {
        H28: 'Reconhecer a função e o impacto social das diferentes tecnologias da comunicação e informação.',
        H29: 'Identificar, pela análise de suas linguagens, as tecnologias da comunicação e informação.',
        H30: 'Relacionar as tecnologias de comunicação e informação ao desenvolvimento das sociedades e ao conhecimento que elas produzem.',
      } },
    ],
  },
  MATEMATICA: {
    codigo: 'MATEMATICA',
    nome: 'Matemática e suas Tecnologias',
    competencias: [
      { codigo: 'CA1', descricao: 'Construir significados para os números naturais, inteiros, racionais e reais.', habilidades: {
        H1: 'Reconhecer, no contexto social, diferentes significados e representações dos números e operações — naturais, inteiros, racionais ou reais.',
        H2: 'Identificar padrões numéricos ou princípios de contagem.',
        H3: 'Resolver situação-problema envolvendo conhecimentos numéricos.',
        H4: 'Avaliar a razoabilidade de um resultado numérico na construção de argumentos sobre afirmações quantitativas.',
        H5: 'Avaliar propostas de intervenção na realidade utilizando conhecimentos numéricos.',
      } },
      { codigo: 'CA2', descricao: 'Utilizar o conhecimento geométrico para realizar a leitura e a representação da realidade e agir sobre ela.', habilidades: {
        H6: 'Interpretar a localização e a movimentação de pessoas/objetos no espaço tridimensional e sua representação no espaço bidimensional.',
        H7: 'Identificar características de figuras planas ou espaciais.',
        H8: 'Resolver situação-problema que envolva conhecimentos geométricos de espaço e forma.',
        H9: 'Utilizar conhecimentos geométricos de espaço e forma na seleção de argumentos propostos como solução de problemas do cotidiano.',
      } },
      { codigo: 'CA3', descricao: 'Construir noções de grandezas e medidas para a compreensão da realidade e a solução de problemas do cotidiano.', habilidades: {
        H10: 'Identificar relações entre grandezas e unidades de medida.',
        H11: 'Utilizar a noção de escalas na leitura de representação de situação do cotidiano.',
        H12: 'Resolver situação-problema que envolva medidas de grandezas.',
        H13: 'Avaliar o resultado de uma medição na construção de um argumento consistente.',
        H14: 'Avaliar proposta de intervenção na realidade utilizando conhecimentos geométricos relacionados a grandezas e medidas.',
      } },
      { codigo: 'CA4', descricao: 'Construir noções de variação de grandezas para a compreensão da realidade e a solução de problemas do cotidiano.', habilidades: {
        H15: 'Identificar a relação de dependência entre grandezas.',
        H16: 'Resolver situação-problema envolvendo a variação de grandezas, direta ou inversamente proporcionais.',
        H17: 'Analisar informações envolvendo a variação de grandezas como recurso para a construção de argumentação.',
        H18: 'Avaliar propostas de intervenção na realidade envolvendo variação de grandezas.',
      } },
      { codigo: 'CA5', descricao: 'Modelar e resolver problemas que envolvem variáveis socioeconômicas ou técnico-científicas, usando representações algébricas.', habilidades: {
        H19: 'Identificar representações algébricas que expressem a relação entre grandezas.',
        H20: 'Interpretar gráfico cartesiano que represente relações entre grandezas.',
        H21: 'Resolver situação-problema cuja modelagem envolva conhecimentos algébricos.',
        H22: 'Utilizar conhecimentos algébricos/geométricos como recurso para a construção de argumentação.',
        H23: 'Avaliar propostas de intervenção na realidade utilizando conhecimentos algébricos.',
      } },
      { codigo: 'CA6', descricao: 'Interpretar informações de natureza científica e social obtidas da leitura de gráficos e tabelas, realizando previsão de tendência, extrapolação, interpolação e interpretação.', habilidades: {
        H24: 'Utilizar informações expressas em gráficos ou tabelas para fazer inferências.',
        H25: 'Resolver problema com dados apresentados em tabelas ou gráficos.',
        H26: 'Analisar informações expressas em gráficos ou tabelas como recurso para a construção de argumentos.',
      } },
      { codigo: 'CA7', descricao: 'Compreender o caráter aleatório e não determinístico dos fenômenos naturais e sociais, e utilizar instrumentos adequados para medidas, determinação de amostras e cálculos de probabilidade para interpretar informações de variáveis apresentadas em uma distribuição estatística.', habilidades: {
        H27: 'Calcular medidas de tendência central ou de dispersão de um conjunto de dados expressos em uma tabela de frequências de dados agrupados (não em classes) ou em gráficos.',
        H28: 'Resolver situação-problema que envolva conhecimentos de estatística e probabilidade.',
        H29: 'Utilizar conhecimentos de estatística e probabilidade como recurso para a construção de argumentação.',
        H30: 'Avaliar propostas de intervenção na realidade utilizando conhecimentos de estatística e probabilidade.',
      } },
    ],
  },
  NATUREZA: {
    codigo: 'NATUREZA',
    nome: 'Ciências da Natureza e suas Tecnologias',
    competencias: [
      { codigo: 'CA1', descricao: 'Compreender as ciências naturais e as tecnologias a elas associadas como construções humanas, percebendo seus papéis nos processos de produção e no desenvolvimento econômico e social da humanidade.', habilidades: {
        H1: 'Reconhecer características ou propriedades de fenômenos ondulatórios ou oscilatórios, relacionando-os a seus usos em diferentes contextos.',
        H2: 'Associar a solução de problemas de comunicação, transporte, saúde ou outro, com o correspondente desenvolvimento científico e tecnológico.',
        H3: 'Confrontar interpretações científicas com interpretações baseadas no senso comum, ao longo do tempo ou em diferentes culturas.',
        H4: 'Avaliar propostas de intervenção no ambiente, considerando a qualidade da vida humana ou as medidas de conservação, recuperação ou utilização sustentável da biodiversidade.',
      } },
      { codigo: 'CA2', descricao: 'Identificar a presença e aplicar as tecnologias associadas às ciências naturais em diferentes contextos.', habilidades: {
        H5: 'Dimensionar circuitos ou dispositivos elétricos de uso cotidiano.',
        H6: 'Relacionar informações para compreender manuais de instalação ou utilização de aparelhos ou sistemas tecnológicos de uso comum.',
        H7: 'Selecionar testes de controle, parâmetros ou critérios para a comparação de materiais e produtos, tendo em vista a defesa do consumidor, a saúde do trabalhador ou a qualidade de vida.',
      } },
      { codigo: 'CA3', descricao: 'Associar intervenções que resultam em degradação ou conservação ambiental a processos produtivos e sociais e a instrumentos ou ações científico-tecnológicos.', habilidades: {
        H8: 'Identificar etapas em processos de obtenção, transformação, utilização ou reciclagem de recursos naturais, energéticos ou matérias-primas, considerando processos biológicos, químicos ou físicos neles envolvidos.',
        H9: 'Compreender a importância dos ciclos biogeoquímicos ou do fluxo de energia para a vida ou da ação de agentes ou fenômenos que possam causar alterações nesses processos.',
        H10: 'Analisar perturbações ambientais, identificando fontes, transporte e(ou) destino dos poluentes ou prevendo efeitos em sistemas naturais, produtivos ou sociais.',
        H11: 'Reconhecer benefícios, limitações e aspectos éticos da biotecnologia, considerando estruturas e processos biológicos envolvidos em produtos biotecnológicos.',
        H12: 'Avaliar impactos em ambientes naturais decorrentes de atividades sociais ou econômicas, considerando interesses contraditórios.',
      } },
      { codigo: 'CA4', descricao: 'Compreender interações entre organismos e ambiente, em particular aquelas relacionadas à saúde humana, relacionando conhecimentos científicos, aspectos culturais e características individuais.', habilidades: {
        H13: 'Reconhecer mecanismos de transmissão da vida, prevendo ou explicando a manifestação de características dos seres vivos.',
        H14: 'Identificar padrões em fenômenos e processos vitais dos organismos, como manutenção do equilíbrio interno, defesa, relações com o ambiente, sexualidade, entre outros.',
        H15: 'Interpretar modelos e experimentos para explicar fenômenos ou processos biológicos em qualquer nível de organização dos sistemas biológicos.',
        H16: 'Compreender o papel da evolução na produção de padrões, processos biológicos ou na organização taxonômica dos seres vivos.',
      } },
      { codigo: 'CA5', descricao: 'Entender métodos e procedimentos próprios das ciências naturais e aplicá-los em diferentes contextos.', habilidades: {
        H17: 'Relacionar informações apresentadas em diferentes formas de linguagem e representação usadas nas ciências físicas, químicas ou biológicas, como texto discursivo, gráficos, tabelas, relações matemáticas ou linguagem simbólica.',
        H18: 'Relacionar propriedades físicas, químicas ou biológicas de produtos, sistemas ou procedimentos tecnológicos às finalidades a que se destinam.',
        H19: 'Avaliar métodos, processos ou procedimentos das ciências naturais que contribuam para diagnosticar ou solucionar problemas de ordem social, econômica ou ambiental.',
      } },
      { codigo: 'CA6', descricao: 'Apropriar-se de conhecimentos da física para, em situações-problema, interpretar, avaliar ou planejar intervenções científico-tecnológicas.', habilidades: {
        H20: 'Caracterizar causas ou efeitos dos movimentos de partículas, substâncias, objetos ou corpos celestes.',
        H21: 'Utilizar leis físicas e(ou) químicas para interpretar processos naturais ou tecnológicos inseridos no contexto da termodinâmica e(ou) do eletromagnetismo.',
        H22: 'Compreender fenômenos decorrentes da interação entre a radiação e a matéria em suas manifestações em processos naturais ou tecnológicos, ou em suas implicações biológicas, sociais, econômicas ou ambientais.',
        H23: 'Avaliar possibilidades de geração, uso ou transformação de energia em ambientes específicos, considerando implicações éticas, ambientais, sociais e(ou) econômicas.',
      } },
      { codigo: 'CA7', descricao: 'Apropriar-se de conhecimentos da química para, em situações-problema, interpretar, avaliar ou planejar intervenções científico-tecnológicas.', habilidades: {
        H24: 'Utilizar códigos e nomenclatura da química para caracterizar materiais, substâncias ou transformações químicas.',
        H25: 'Caracterizar materiais ou substâncias, identificando etapas, rendimentos ou implicações biológicas, sociais, econômicas ou ambientais de sua obtenção ou produção.',
        H26: 'Avaliar implicações sociais, ambientais e(ou) econômicas na produção ou no consumo de recursos energéticos ou minerais, identificando transformações químicas ou de energia envolvidas nesses processos.',
        H27: 'Avaliar propostas de intervenção no meio ambiente aplicando conhecimentos químicos, observando riscos ou benefícios.',
      } },
      { codigo: 'CA8', descricao: 'Apropriar-se de conhecimentos da biologia para, em situações-problema, interpretar, avaliar ou planejar intervenções científico-tecnológicas.', habilidades: {
        H28: 'Associar características adaptativas dos organismos com seu modo de vida ou com seus limites de distribuição em diferentes ambientes, em especial em ambientes brasileiros.',
        H29: 'Interpretar experimentos ou técnicas que utilizam seres vivos, analisando implicações para o ambiente, a saúde, a produção de alimentos, as matérias-primas ou os produtos industriais.',
        H30: 'Avaliar propostas de alcance individual ou coletivo, identificando aquelas que visam à preservação e à implementação da saúde individual, coletiva ou do ambiente.',
      } },
    ],
  },
  HUMANAS: {
    codigo: 'HUMANAS',
    nome: 'Ciências Humanas e suas Tecnologias',
    competencias: [
      { codigo: 'CA1', descricao: 'Compreender os elementos culturais que constituem as identidades.', habilidades: {
        H1: 'Interpretar historicamente e(ou) geograficamente fontes documentais acerca de aspectos da cultura.',
        H2: 'Analisar a produção da memória pelas sociedades humanas.',
        H3: 'Associar as manifestações culturais do presente aos seus processos históricos.',
        H4: 'Comparar pontos de vista expressos em diferentes fontes sobre determinado aspecto da cultura.',
        H5: 'Identificar as manifestações ou representações da diversidade do patrimônio cultural e artístico em diferentes sociedades.',
      } },
      { codigo: 'CA2', descricao: 'Compreender as transformações dos espaços geográficos como produto das relações socioeconômicas e culturais de poder.', habilidades: {
        H6: 'Interpretar diferentes representações gráficas e cartográficas dos espaços geográficos.',
        H7: 'Identificar os significados histórico-geográficos das relações de poder entre as nações.',
        H8: 'Analisar a ação dos Estados nacionais no que se refere à dinâmica dos fluxos populacionais e no enfrentamento de problemas de ordem econômico-social.',
        H9: 'Comparar o significado histórico-geográfico das organizações políticas e socioeconômicas em escala local, regional ou mundial.',
        H10: 'Reconhecer a dinâmica da organização dos movimentos sociais e a importância da participação da coletividade na transformação da realidade histórico-geográfica.',
      } },
      { codigo: 'CA3', descricao: 'Compreender a produção e o papel histórico das instituições sociais, políticas e econômicas, associando-as aos diferentes grupos, conflitos e movimentos sociais.', habilidades: {
        H11: 'Identificar registros de práticas de grupos sociais no tempo e no espaço.',
        H12: 'Analisar o papel da justiça como instituição na organização das sociedades.',
        H13: 'Analisar a atuação dos movimentos sociais que contribuíram para mudanças ou rupturas em processos de disputa pelo poder.',
        H14: 'Comparar diferentes pontos de vista, presentes em textos analíticos e interpretativos, sobre situação ou fatos de natureza histórico-geográfica acerca das instituições sociais, políticas e econômicas.',
        H15: 'Avaliar criticamente conflitos culturais, sociais, políticos, econômicos ou ambientais ao longo da história.',
      } },
      { codigo: 'CA4', descricao: 'Entender as transformações técnicas e tecnológicas e seu impacto nos processos de produção, no desenvolvimento do conhecimento e na vida social.', habilidades: {
        H16: 'Identificar registros sobre o papel das técnicas e tecnologias na organização do trabalho e(ou) da vida social.',
        H17: 'Analisar fatores que explicam o impacto das novas tecnologias no processo de territorialização da produção.',
        H18: 'Analisar diferentes processos de produção ou circulação de riquezas e suas implicações sócio-espaciais.',
        H19: 'Reconhecer as transformações técnicas e tecnológicas que determinam as várias formas de uso e apropriação dos espaços rural e urbano.',
        H20: 'Selecionar argumentos favoráveis ou contrários às modificações impostas pelas novas tecnologias à vida social e ao mundo do trabalho.',
      } },
      { codigo: 'CA5', descricao: 'Utilizar os conhecimentos históricos para compreender e valorizar os fundamentos da cidadania e da democracia, favorecendo uma atuação consciente do indivíduo na sociedade.', habilidades: {
        H21: 'Identificar o papel dos meios de comunicação na construção da vida social.',
        H22: 'Analisar as lutas sociais e conquistas obtidas no que se refere às mudanças nas legislações ou nas políticas públicas.',
        H23: 'Analisar a importância dos valores éticos na estruturação política das sociedades.',
        H24: 'Relacionar cidadania e democracia na organização das sociedades.',
        H25: 'Identificar estratégias que promovam formas de inclusão social.',
      } },
      { codigo: 'CA6', descricao: 'Compreender a sociedade e a natureza, reconhecendo suas interações no espaço em diferentes contextos históricos e geográficos.', habilidades: {
        H26: 'Identificar em fontes diversas o processo de ocupação dos meios físicos e as relações da vida humana com a paisagem.',
        H27: 'Analisar de maneira crítica as interações da sociedade com o meio físico, levando em consideração aspectos históricos e(ou) geográficos.',
        H28: 'Relacionar o uso das tecnologias com os impactos sócio-ambientais em diferentes contextos histórico-geográficos.',
        H29: 'Reconhecer a função dos recursos naturais na produção do espaço geográfico, relacionando-os com as mudanças provocadas pelas ações humanas.',
        H30: 'Avaliar as relações entre preservação e degradação da vida no planeta nas diferentes escalas.',
      } },
    ],
  },
});

function texto(value) {
  return String(value ?? '').trim();
}

function semAcentos(value) {
  return texto(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarArea(value) {
  const chave = semAcentos(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!chave) return '';
  if (chave.includes('LINGUAG')) return 'LINGUAGENS';
  if (chave.includes('MATEMAT')) return 'MATEMATICA';
  if (chave.includes('NATUREZA') || chave === 'CN' || chave.includes('CIENCIAS_DA_NATUREZA')) return 'NATUREZA';
  if (chave.includes('HUMAN') || chave === 'CH' || chave.includes('CIENCIAS_HUMANAS')) return 'HUMANAS';
  return '';
}

function normalizarHabilidade(value) {
  const raw = texto(value).toUpperCase();
  if (!raw) return '';
  const match = raw.match(/(?:^|[^A-Z0-9])H\s*0?([1-9]|[12]\d|30)(?:\b|[^0-9])/i) || raw.match(/^0?([1-9]|[12]\d|30)$/);
  return match ? `H${Number(match[1])}` : '';
}

function resolverHabilidadeEnem(areaInput, habilidadeInput) {
  const areaCodigo = normalizarArea(areaInput);
  const habilidadeCodigo = normalizarHabilidade(habilidadeInput);
  const area = AREAS[areaCodigo];
  if (!area || !habilidadeCodigo) return null;
  for (const competencia of area.competencias) {
    const descricao = competencia.habilidades[habilidadeCodigo];
    if (!descricao) continue;
    return {
      fonte: FONTE_MATRIZ_ENEM,
      areaCodigo: area.codigo,
      areaNome: area.nome,
      competenciaCodigo: competencia.codigo,
      competenciaDescricao: competencia.descricao,
      habilidadeCodigo,
      habilidadeDescricao: descricao,
      rotuloHabilidade: `${habilidadeCodigo} - ${descricao}`,
      rotuloCompetencia: `${competencia.codigo} - ${competencia.descricao}`,
    };
  }
  return null;
}

function listarReferenciaEnem() {
  const linhas = [];
  Object.values(AREAS).forEach((area) => {
    area.competencias.forEach((competencia) => {
      Object.entries(competencia.habilidades).forEach(([habilidadeCodigo, habilidadeDescricao]) => {
        linhas.push({
          areaCodigo: area.codigo,
          areaNome: area.nome,
          competenciaCodigo: competencia.codigo,
          competenciaDescricao: competencia.descricao,
          habilidadeCodigo,
          habilidadeDescricao,
          fonte: FONTE_MATRIZ_ENEM.versao,
        });
      });
    });
  });
  return linhas;
}

function contarHabilidadesArea(areaInput) {
  const area = AREAS[normalizarArea(areaInput)];
  if (!area) return 0;
  return area.competencias.reduce((total, competencia) => total + Object.keys(competencia.habilidades).length, 0);
}

module.exports = {
  FONTE_MATRIZ_ENEM,
  AREAS,
  normalizarArea,
  normalizarHabilidade,
  resolverHabilidadeEnem,
  listarReferenciaEnem,
  contarHabilidadesArea,
};
