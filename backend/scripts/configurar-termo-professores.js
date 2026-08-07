'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const Instituicao = require('../models/Instituicao');
const Usuario = require('../models/Usuario');
const UsuarioVinculoInstituicao = require('../models/UsuarioVinculoInstituicao');
const TermoCompromissoProfessor = require('../models/TermoCompromissoProfessor');
const AceiteTermoProfessor = require('../models/AceiteTermoProfessor');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i += 1; }
  }
  return args;
}

function escapeRx(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolverInstituicao(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Informe --instituicao com ID, slug, sigla ou nome.');
  if (mongoose.isValidObjectId(raw)) {
    const byId = await Instituicao.findById(raw);
    if (byId) return byId;
  }
  const rx = new RegExp(`^${escapeRx(raw)}$`, 'i');
  const doc = await Instituicao.findOne({ $or: [{ slug: rx }, { sigla: rx }, { nome: rx }, { nomeExibicao: rx }] });
  if (!doc) throw new Error(`Instituição não encontrada: ${raw}`);
  return doc;
}

function nomeInstituicao(inst) {
  return inst.nomeExibicao || inst.nome || inst.sigla || 'Instituição de Ensino';
}

function criarConteudo(inst) {
  const nome = nomeInstituicao(inst);
  return `TERMO DE COMPROMISSO, RESPONSABILIDADE, SIGILO E USO ADEQUADO DO AXORIIN

Pelo presente instrumento, o(a) PROFESSOR(A), identificado(a) por sua conta pessoal de acesso, declara ciência e assume os compromissos abaixo perante ${nome}, doravante denominada INSTITUIÇÃO, relativos ao uso do Axoriin — Plataforma de Gestão, Acompanhamento e Proteção Estudantil.

1. FINALIDADE DO ACESSO

1.1. O acesso ao Axoriin será utilizado exclusivamente para atividades institucionais, pedagógicas, administrativas e de acompanhamento estudantil compatíveis com as atribuições do(a) professor(a).

1.2. O(A) professor(a) utilizará apenas os módulos, turmas, estudantes e informações aos quais tenha sido autorizado(a), abstendo-se de tentar acessar áreas, dados ou funcionalidades não relacionadas às suas atribuições.

2. CONTA, SENHA E SEGURANÇA

2.1. A conta é pessoal e intransferível. É proibido compartilhar senha, permitir o uso da conta por terceiros ou utilizar credenciais de outro usuário.

2.2. O(A) professor(a) compromete-se a criar senha segura, mantê-la em sigilo, encerrar a sessão em equipamentos compartilhados e comunicar imediatamente à INSTITUIÇÃO qualquer suspeita de perda, exposição, uso indevido ou acesso não autorizado.

2.3. Registros realizados por meio da conta autenticada serão associados ao respectivo usuário, sem prejuízo da apuração de eventual uso indevido comunicado formalmente.

3. PROTEÇÃO DE DADOS E SIGILO

3.1. As informações de estudantes, responsáveis, servidores e demais usuários deverão ser tratadas com confidencialidade, necessidade, adequação e finalidade institucional, observadas as normas aplicáveis de proteção de dados pessoais.

3.2. É vedado copiar, fotografar, capturar telas, exportar, imprimir, encaminhar, publicar ou compartilhar dados obtidos no Axoriin fora das hipóteses autorizadas pela INSTITUIÇÃO e estritamente necessárias ao exercício da função.

3.3. Dados pessoais e documentos não deverão ser armazenados em dispositivos, contas, aplicativos ou serviços pessoais sem autorização institucional e sem as medidas de segurança adequadas.

3.4. O dever de sigilo permanece mesmo após o encerramento do vínculo, da função ou da autorização de acesso.

4. QUALIDADE E RESPONSABILIDADE DOS REGISTROS

4.1. O(A) professor(a) compromete-se a registrar fatos verdadeiros, objetivos, claros, respeitosos e relacionados ao contexto escolar, evitando julgamentos ofensivos, informações discriminatórias, acusações sem fundamento ou exposição desnecessária.

4.2. Antes de concluir qualquer registro, deverá conferir a identificação do estudante, turma, data, descrição e demais informações inseridas.

4.3. Eventual erro deverá ser comunicado e corrigido pelos meios disponibilizados, preservando-se o histórico e a rastreabilidade quando aplicável.

5. CONDUTAS VEDADAS

5.1. São vedadas, entre outras condutas: utilizar o sistema para finalidade particular; inserir conteúdo falso ou impróprio; alterar ou excluir registros sem autorização; explorar falhas; contornar controles de acesso; instalar ferramentas destinadas a capturar dados; ceder informações a terceiros; e usar os dados para constranger, discriminar, retaliar ou expor qualquer pessoa.

6. AUDITORIA E RASTREABILIDADE

6.1. O(A) professor(a) declara ciência de que o Axoriin poderá registrar ações realizadas na plataforma, incluindo usuário, instituição, data, horário, endereço IP, navegador, dispositivo, módulo e operação executada, para fins de segurança, auditoria, suporte, prevenção de incidentes e responsabilização.

6.2. Os registros de auditoria serão acessados apenas por pessoas autorizadas e tratados de acordo com as finalidades institucionais e as normas aplicáveis.

7. INCIDENTES E DEVER DE COMUNICAÇÃO

7.1. O(A) professor(a) comunicará imediatamente à gestão qualquer acesso suspeito, vazamento, perda de equipamento, envio equivocado, exposição de senha, visualização indevida de dados ou outra ocorrência que possa comprometer a segurança das informações.

7.2. O(A) professor(a) colaborará com as medidas de contenção, correção e apuração adotadas pela INSTITUIÇÃO.

8. ATUALIZAÇÕES DO TERMO

8.1. A INSTITUIÇÃO poderá publicar nova versão deste Termo quando houver alteração de funcionalidades, procedimentos, normas ou riscos. A nova versão poderá exigir novo aceite antes da continuidade do acesso.

8.2. Cada aceite ficará vinculado à versão e ao conteúdo integral apresentados no momento da confirmação, preservando-se o histórico das versões anteriores.

9. ACEITE ELETRÔNICO

9.1. Ao marcar as declarações e selecionar “Aceitar e concluir”, o(a) professor(a) confirma que leu, compreendeu e concorda com este Termo.

9.2. O Axoriin armazenará comprovante eletrônico contendo a identificação da conta, instituição, versão do termo, conteúdo aceito, data, horário, código de verificação, hash de integridade e dados técnicos disponíveis da sessão.

9.3. O registro de aceite não equivale, por si só, a certificado digital ICP-Brasil, sem prejuízo de sua utilização como evidência eletrônica do procedimento realizado por conta autenticada.

10. RESPONSABILIDADE E MEDIDAS CABÍVEIS

10.1. O descumprimento deste Termo poderá resultar em bloqueio ou suspensão de acesso, orientação, apuração administrativa e demais medidas institucionais ou legais cabíveis, assegurados os procedimentos aplicáveis.

11. DISPOSIÇÕES FINAIS

11.1. Este Termo complementa as normas internas, orientações funcionais, políticas de segurança e proteção de dados da INSTITUIÇÃO, não substituindo outros deveres profissionais ou legais.

11.2. Dúvidas sobre o uso do sistema, correção de registros, privacidade ou segurança deverão ser encaminhadas à gestão da INSTITUIÇÃO ou ao responsável indicado para suporte e proteção de dados.

DECLARAÇÃO FINAL

Declaro que li integralmente este Termo de Compromisso, compreendi as responsabilidades relacionadas ao uso do Axoriin e comprometo-me a cumprir suas disposições durante todo o período em que possuir acesso à plataforma.`;
}

async function obterProfessores(instituicaoId) {
  const [primarios, vinculos] = await Promise.all([
    Usuario.find({
      tipo: 'professor',
      $or: [{ instituicao: instituicaoId }, { tenantId: instituicaoId }],
      ativo: { $ne: false },
    }).select('_id nome email ativo onboardingProfessor').lean(),
    UsuarioVinculoInstituicao.find({
      instituicao: instituicaoId,
      tipoInstitucional: 'professor',
      ativo: true,
    }).select('usuario').lean(),
  ]);
  const ids = new Set(primarios.map((u) => String(u._id)));
  for (const vinculo of vinculos) ids.add(String(vinculo.usuario));
  return [...ids];
}

async function main() {
  const args = parseArgs(process.argv);
  const confirmar = args.confirmar === true;
  const versao = String(args.versao || '1.0').trim();
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGODB_URI/MONGO_URI não configurada.');

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000, maxPoolSize: 10, autoIndex: false });
  await Promise.all([
    TermoCompromissoProfessor.createIndexes(),
    AceiteTermoProfessor.createIndexes(),
  ]);
  const inst = await resolverInstituicao(args.instituicao);
  const conteudo = criarConteudo(inst);
  const hash = TermoCompromissoProfessor.hashConteudo(conteudo);
  const professorIds = await obterProfessores(inst._id);
  const existente = await TermoCompromissoProfessor.findOne({ instituicao: inst._id, publico: 'professor', versao });
  const aceitesExistentes = existente
    ? await AceiteTermoProfessor.countDocuments({ termo: existente._id })
    : 0;

  console.log('CONFIGURAÇÃO DO TERMO DOS PROFESSORES');
  console.log(`Instituição: ${nomeInstituicao(inst)} (${inst.slug || inst._id})`);
  console.log(`Versão: ${versao}`);
  console.log(`SHA-256 do conteúdo: ${hash}`);
  console.log(`Professores encontrados: ${professorIds.length}`);
  console.log(`Termo da versão já existe: ${Boolean(existente)}`);
  console.log(`Aceites já vinculados à versão: ${aceitesExistentes}`);

  if (!confirmar) {
    console.log('\nSIMULAÇÃO: nada foi alterado. Execute novamente com --confirmar para aplicar.');
    return;
  }

  if (existente && aceitesExistentes > 0 && existente.conteudoHash !== hash) {
    throw new Error('Esta versão já possui aceites e seu conteúdo não pode ser alterado. Use uma nova versão.');
  }

  await TermoCompromissoProfessor.updateMany(
    { instituicao: inst._id, publico: 'professor', ativo: true, versao: { $ne: versao } },
    { $set: { ativo: false } }
  );

  const termo = await TermoCompromissoProfessor.findOneAndUpdate(
    { instituicao: inst._id, publico: 'professor', versao },
    {
      $set: {
        tenantId: inst._id,
        titulo: 'Termo de Compromisso, Responsabilidade, Sigilo e Uso Adequado do Axoriin',
        conteudo,
        conteudoHash: hash,
        ativo: true,
        publicadoEm: existente?.publicadoEm || new Date(),
        observacao: 'Versão inicial preparada para o primeiro acesso dos professores.',
      },
      $setOnInsert: { instituicao: inst._id, publico: 'professor' },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  let marcados = 0;
  if (args['nao-marcar-professores'] !== true && professorIds.length) {
    const result = await Usuario.updateMany(
      { _id: { $in: professorIds }, ativo: { $ne: false } },
      {
        $set: {
          'onboardingProfessor.obrigarTrocaSenha': true,
          'onboardingProfessor.senhaTemporariaDefinidaEm': new Date(),
          'onboardingProfessor.senhaAlteradaEm': null,
        },
      }
    );
    marcados = result.modifiedCount || 0;
  }

  console.log('\nAPLICAÇÃO CONCLUÍDA');
  console.log(`Termo ativo: ${termo._id}`);
  console.log(`Professores marcados para troca obrigatória de senha: ${marcados}`);
  console.log('Os professores deverão alterar a senha e aceitar o termo vigente no próximo login.');
}

main().catch((error) => {
  console.error(`ERRO: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect().catch(() => null);
});
