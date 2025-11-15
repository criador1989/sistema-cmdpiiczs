import os
import io
import sys
import json
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import Table, TableStyle
from reportlab.lib.units import cm

sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
dados = json.load(sys.stdin)

saida_path = os.path.join(os.path.dirname(__file__), "relatorio_notificacoes.pdf")
c = canvas.Canvas(saida_path, pagesize=A4)
width, height = A4

c.setFont("Helvetica-Bold", 16)
c.drawCentredString(width / 2, height - 50, "Relatório Geral de Notificações Disciplinares")
c.setFont("Helvetica", 12)
c.drawCentredString(width / 2, height - 70, f"Instituição: {dados.get('instituicao', 'N/A')}")
c.drawCentredString(width / 2, height - 85, f"Data de geração: {datetime.now().strftime('%d/%m/%Y %H:%M')}")

tabela_dados = [["Nº", "Aluno", "Turma", "Tipo", "Motivo", "Data", "Valor", "Nota Ant.", "Nota Atual"]]

for i, n in enumerate(dados.get("notificacoes", []), 1):
    tabela_dados.append([
        str(i).zfill(2),
        n.get("aluno", "N/A"),
        n.get("turma", "N/A"),
        n.get("tipoMedida", "N/A"),
        n.get("motivo", "N/A"),
        n.get("data", "N/A"),
        f'{n.get("valor", 0):.2f}',
        f'{n.get("notaAnterior", 8):.2f}',
        f'{n.get("notaAtual", 8):.2f}'
    ])

table = Table(tabela_dados, colWidths=[2*cm, 4*cm, 2*cm, 2.5*cm, 4*cm, 2.5*cm, 2*cm, 2*cm, 2*cm])
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.darkred),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ("FONTSIZE", (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))

table.wrapOn(c, width, height)
table.drawOn(c, 30, height - 120 - 20 * len(tabela_dados))

c.setFont("Helvetica", 10)
c.drawString(30, 50, "Assinatura da Coordenação: __________________________")
c.drawRightString(width - 30, 50, "Sistema Escolar - Colégio Militar Dom Pedro II")

c.save()
print(saida_path)
