import { useState } from "react";

function App() {
  const [alunos, setAlunos] = useState([]);
  const [notificacoes, setNotificacoes] = useState([]);

  // Estados para formulário de alunos
  const [nomeAluno, setNomeAluno] = useState("");
  const [turmaAluno, setTurmaAluno] = useState("");

  // Estados para formulário de notificações
  const [alunoSelecionado, setAlunoSelecionado] = useState("");
  const [descricaoNotificacao, setDescricaoNotificacao] = useState("");

  // Função para cadastrar aluno
  function handleCadastrarAluno(e) {
    e.preventDefault();
    if (!nomeAluno || !turmaAluno) return alert("Preencha todos os campos do aluno");
    setAlunos([...alunos, { id: Date.now(), nome: nomeAluno, turma: turmaAluno }]);
    setNomeAluno("");
    setTurmaAluno("");
  }

  // Função para cadastrar notificação
  function handleCadastrarNotificacao(e) {
    e.preventDefault();
    if (!alunoSelecionado || !descricaoNotificacao)
      return alert("Preencha todos os campos da notificação");
    setNotificacoes([
      ...notificacoes,
      {
        id: Date.now(),
        alunoId: alunoSelecionado,
        descricao: descricaoNotificacao,
        data: new Date().toLocaleDateString(),
      },
    ]);
    setAlunoSelecionado("");
    setDescricaoNotificacao("");
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-8 space-y-10">
      {/* Formulário de cadastro de alunos */}
      <div className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Cadastro de Aluno</h1>

        <form onSubmit={handleCadastrarAluno} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome do Aluno</label>
            <input
              type="text"
              placeholder="Digite o nome"
              value={nomeAluno}
              onChange={(e) => setNomeAluno(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Turma</label>
            <input
              type="text"
              placeholder="Digite a turma"
              value={turmaAluno}
              onChange={(e) => setTurmaAluno(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Cadastrar Aluno
          </button>
        </form>
      </div>

      {/* Formulário de cadastro de notificações */}
      <div className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-md">
        <h2 className="text-xl font-bold text-center mb-6">Cadastro de Notificação Disciplinar</h2>

        <form onSubmit={handleCadastrarNotificacao} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Aluno</label>
            <select
              value={alunoSelecionado}
              onChange={(e) => setAlunoSelecionado(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione um aluno</option>
              {alunos.map((aluno) => (
                <option key={aluno.id} value={aluno.id}>
                  {aluno.nome} - Turma {aluno.turma}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Descrição</label>
            <textarea
              placeholder="Descreva a notificação"
              value={descricaoNotificacao}
              onChange={(e) => setDescricaoNotificacao(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-red-600 text-white font-semibold py-2 rounded-lg hover:bg-red-700 transition"
          >
            Cadastrar Notificação
          </button>
        </form>

        {/* Lista de notificações */}
        {notificacoes.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2">Notificações Registradas:</h3>
            <ul className="space-y-2 max-h-48 overflow-auto">
              {notificacoes.map((notif) => {
                const aluno = alunos.find((a) => a.id.toString() === notif.alunoId.toString());
                return (
                  <li
                    key={notif.id}
                    className="border border-gray-300 rounded-lg p-3 bg-gray-50"
                  >
                    <p>
                      <strong>Aluno:</strong> {aluno ? aluno.nome : "Aluno não encontrado"}
                    </p>
                    <p>
                      <strong>Turma:</strong> {aluno ? aluno.turma : "-"}
                    </p>
                    <p>
                      <strong>Descrição:</strong> {notif.descricao}
                    </p>
                    <p className="text-sm text-gray-500">Data: {notif.data}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
