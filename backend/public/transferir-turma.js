document.addEventListener("DOMContentLoaded", async () => {
  const turmaAtual = document.getElementById("turmaAtual");
  const novaTurma = document.getElementById("novaTurma");
  const tabela = document.getElementById("tabelaAlunos");
  const btn = document.getElementById("transferirBtn");

  // Verifica login
  const resposta = await fetch("/api/alunos", { credentials: "include" });
  if (resposta.status === 401) return window.location.href = "/login.html";

  const todosAlunos = await resposta.json();
  const turmas = [...new Set(todosAlunos.map(a => a.turma))];
  turmaAtual.innerHTML = turmas.map(t => `<option value="${t}">${t}</option>`).join("");

  async function carregarAlunos() {
    const turma = turmaAtual.value;
    const res = await fetch(`/api/alunos?turma=${encodeURIComponent(turma)}`, { credentials: "include" });
    const alunos = await res.json();
    tabela.innerHTML = alunos.map(a => `
      <tr>
        <td><input type="checkbox" value="${a._id}"></td>
        <td>${a.nome}</td>
        <td>${a.turma}</td>
      </tr>
    `).join("");
  }

  turmaAtual.addEventListener("change", carregarAlunos);

  btn.addEventListener("click", async () => {
    const nova = novaTurma.value.trim();
    if (!nova) return alert("Digite a nova turma");

    const novaNormalizada = nova
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[º°]/g, "º")
      .replace(/[ª]/g, "ª")
      .trim();

    const selecionados = [...document.querySelectorAll("input[type=checkbox]:checked")].map(c => c.value);
    if (selecionados.length === 0) return alert("Selecione pelo menos um aluno.");

    try {
      const res = await fetch("/api/alunos/transferir", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: selecionados, novaTurma: novaNormalizada })
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Erro:", data);
        return alert(data.mensagem || "Erro ao transferir alunos.");
      }

      alert(data.mensagem || "Transferência concluída!");
      carregarAlunos();
    } catch (err) {
      console.error("Erro inesperado:", err);
      alert("Erro ao conectar com o servidor.");
    }
  });

  carregarAlunos();
});
