import sys
import io
import json
import os
import qrcode
import zipfile
import unicodedata
import re
from reportlab.lib.pagesizes import A6
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm

# Funções auxiliares
def remover_acentos(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn')

def nome_para_arquivo(texto):
    texto = remover_acentos(texto)
    texto = re.sub(r'[^a-zA-Z0-9_-]', '_', texto)
    return texto.strip('_') or "aluno"

# Caminhos permitidos no Render
BASE_DIR = "/tmp/cartoes"
LOGO_PATH = os.path.join(os.path.dirname(__file__), "logo_cmdp.jpg")

os.makedirs(BASE_DIR, exist_ok=True)

sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
dados = json.load(sys.stdin)

pdfs = []

for aluno in dados:
    nome = aluno.get("nome", "Aluno")
    turma = aluno.get("turma", "")
    codigo = aluno.get("codigoAcesso", "")
    url = f"https://sistema-cmdpiiczs.onrender.com/ficha-responsavel.html?codigo={codigo}"

    qr_path = os.path.join(BASE_DIR, f"qr_{codigo}.png")
    qrcode.make(url).save(qr_path)

    nome_arquivo = nome_para_arquivo(nome)
    nome_pdf = f"{nome_arquivo}.pdf"
    caminho_pdf = os.path.join(BASE_DIR, nome_pdf)
    pdfs.append(caminho_pdf)

    c = canvas.Canvas(caminho_pdf, pagesize=A6)
    w, h = A6

    if os.path.exists(LOGO_PATH):
        c.drawImage(LOGO_PATH, w/2 - 25, h - 50, width=50, preserveAspectRatio=True, mask='auto')

    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(w/2, h - 60, "COLÉGIO MILITAR DOM PEDRO II")
    c.setFont("Helvetica", 8)
    c.drawCentredString(w/2, h - 72, "Cruzeiro do Sul - Acre")

    c.setFont("Helvetica", 8)
    c.drawString(10 * mm, h - 90, f"Nome: {nome}")
    c.drawString(10 * mm, h - 102, f"Turma: {turma}")
    c.drawString(10 * mm, h - 114, f"Código: {codigo}")

    c.setFont("Helvetica-Oblique", 7)
    c.drawString(10 * mm, h - 128, "Escaneie o QR Code para acessar a ficha:")
    c.drawImage(qr_path, 55, 10, width=70, preserveAspectRatio=True, mask='auto')

    c.showPage()
    c.save()

# Compactar PDFs no /tmp
saida_zip = "/tmp/cartoes_turma.zip"
with zipfile.ZipFile(saida_zip, "w") as zipf:
    for pdf in pdfs:
        if os.path.exists(pdf):
            zipf.write(pdf, os.path.basename(pdf))

print(saida_zip)
