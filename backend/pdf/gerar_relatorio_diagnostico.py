#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera o relatório PDF gerencial/pedagógico do módulo Simulados.

Uso:
    python gerar_relatorio_diagnostico.py entrada.json saida.pdf

O JSON é produzido pelo backend a partir do MESMO dashboard usado na tela/XLSX.
Nenhum cálculo de desempenho é refeito aqui; o script apenas organiza e apresenta
as métricas já calculadas pelo Axoriin.
"""

from __future__ import annotations

import json
import math
import os
import sys
from datetime import datetime
from typing import Any, Iterable
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle

from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

TEAL = HexColor('#0F766E')
TEAL_DARK = HexColor('#115E59')
NAVY = HexColor('#0F172A')
SLATE = HexColor('#475569')
MUTED = HexColor('#64748B')
LINE = HexColor('#CBD5E1')
BG = HexColor('#F8FAFC')
MINT = HexColor('#ECFDF5')
MINT_LINE = HexColor('#A7F3D0')
AMBER = HexColor('#FFF7ED')
AMBER_LINE = HexColor('#FED7AA')
RED = HexColor('#FEF2F2')
RED_LINE = HexColor('#FECACA')
BLUE = HexColor('#EFF6FF')
BLUE_LINE = HexColor('#BFDBFE')
WHITE = colors.white

PAGE_W, PAGE_H = A4
LAND_W, LAND_H = landscape(A4)


def txt(value: Any, default: str = '') -> str:
    if value is None:
        return default
    if isinstance(value, bool):
        return 'Sim' if value else 'Não'
    value = str(value).strip()
    return value or default


def num(value: Any, default: float = 0.0) -> float:
    try:
        n = float(value)
        return n if math.isfinite(n) else default
    except Exception:
        return default


def inteiro(value: Any) -> int:
    return int(round(num(value, 0)))


def pct(value: Any) -> str:
    return f'{num(value):.1f}%'.replace('.', ',')


def normalize_display(value: Any) -> str:
    s = txt(value)
    return (
        s.replace('—', '-')
         .replace('–', '-')
         .replace('≥', '>=')
         .replace('≤', '<=')
         .replace('÷', '/')
         .replace('“', '"')
         .replace('”', '"')
         .replace('’', "'")
    )


def html(value: Any) -> str:
    return escape(normalize_display(value))


def nivel_label(value: Any) -> str:
    chave = txt(value).lower()
    return {
        'critico': 'Crítico',
        'prioridade_alta': 'Prioridade alta',
        'em_atencao': 'Em atenção',
        'consolidado': 'Consolidado',
        'em_desenvolvimento': 'Em desenvolvimento',
        'prioritario': 'Prioritário',
        'participacao_parcial': 'Participação parcial',
        'evidencia_insuficiente': 'Evidência insuficiente',
    }.get(chave, normalize_display(value) or '-')


def nivel_bg(value: Any):
    chave = txt(value).lower()
    return {
        'consolidado': MINT,
        'em_desenvolvimento': AMBER,
        'em_atencao': AMBER,
        'prioridade_alta': RED,
        'critico': RED,
        'prioritario': RED,
        'participacao_parcial': BLUE,
        'evidencia_insuficiente': BG,
    }.get(chave, WHITE)


def faixa_item_label(value: Any) -> str:
    chave = txt(value).lower()
    return {
        'muito_baixo': 'Muito baixo',
        'baixo': 'Baixo',
        'intermediario': 'Intermediário',
        'alto': 'Alto',
        'muito_alto': 'Muito alto',
        'evidencia_insuficiente': 'Evidência insuficiente',
    }.get(chave, normalize_display(value) or '-')


def discriminacao_label(item: dict[str, Any]) -> str:
    d = item.get('discriminacao') or {}
    if not d.get('disponivel'):
        return 'Amostra insuficiente'
    leitura = {
        'negativa': 'Negativa - revisar item',
        'baixa': 'Baixa',
        'moderada': 'Moderada',
        'boa': 'Boa',
        'forte': 'Forte',
    }.get(txt(d.get('leitura')).lower(), txt(d.get('leitura'), '-'))
    indice = num(d.get('indice'))
    return f"{indice:+.1f} p.p. - {leitura}".replace('.', ',')

def linguagem(value: Any) -> str:
    chave = txt(value).upper()
    return {
        'INGLES': 'Inglês',
        'ESPANHOL': 'Espanhol',
        'NAO_MARCADO': 'Não marcou',
        'NAO_INFORMADO': 'Pendente',
        'NAO_APLICAVEL': 'Não aplicável',
    }.get(chave, normalize_display(value) or '-')


class RelatorioDoc(BaseDocTemplate):
    def __init__(self, filename: str, meta: dict[str, Any]):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=14 * mm,
            rightMargin=14 * mm,
            topMargin=18 * mm,
            bottomMargin=16 * mm,
            title=f"Diagnóstico - {txt(meta.get('titulo'))}",
            author='Axoriin - Diagnóstico de Simulados',
            subject='Relatório gerencial e pedagógico',
        )
        self.meta = meta
        portrait = Frame(14 * mm, 16 * mm, PAGE_W - 28 * mm, PAGE_H - 34 * mm, id='portrait')
        land = Frame(12 * mm, 15 * mm, LAND_W - 24 * mm, LAND_H - 32 * mm, id='landscape')
        self.addPageTemplates([
            PageTemplate(id='Retrato', pagesize=A4, frames=[portrait], onPage=self._header_footer),
            PageTemplate(id='Paisagem', pagesize=landscape(A4), frames=[land], onPage=self._header_footer_land),
        ])

    def _draw_common(self, canvas, page_width, page_height):
        canvas.saveState()
        canvas.setStrokeColor(TEAL)
        canvas.setLineWidth(2)
        canvas.line(12 * mm, page_height - 10 * mm, page_width - 12 * mm, page_height - 10 * mm)
        canvas.setFont('Helvetica-Bold', 7.4)
        canvas.setFillColor(NAVY)
        canvas.drawString(14 * mm, page_height - 8 * mm, 'AXORIIN - DIAGNÓSTICO DE SIMULADOS')
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(MUTED)
        titulo = normalize_display(self.meta.get('titulo', ''))
        turma = normalize_display(self.meta.get('turma', 'Todas permitidas'))
        rodape = f'{titulo} | Recorte: {turma}'
        canvas.drawString(14 * mm, 7.5 * mm, rodape[:115])
        canvas.drawRightString(page_width - 14 * mm, 7.5 * mm, f'Página {canvas.getPageNumber()}')
        canvas.restoreState()

    def _header_footer(self, canvas, doc):
        self._draw_common(canvas, PAGE_W, PAGE_H)

    def _header_footer_land(self, canvas, doc):
        self._draw_common(canvas, LAND_W, LAND_H)


styles = getSampleStyleSheet()
TITLE = ParagraphStyle('AxTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=22, leading=25, textColor=NAVY, alignment=TA_LEFT, spaceAfter=4)
SUBTITLE = ParagraphStyle('AxSubtitle', parent=styles['BodyText'], fontName='Helvetica', fontSize=9.5, leading=13, textColor=SLATE, spaceAfter=10)
KICKER = ParagraphStyle('AxKicker', parent=styles['BodyText'], fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=TEAL, spaceBefore=2, spaceAfter=5)
H1 = ParagraphStyle('AxH1', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=15.5, leading=19, textColor=NAVY, spaceBefore=11, spaceAfter=7)
H2 = ParagraphStyle('AxH2', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=11.2, leading=14, textColor=NAVY, spaceBefore=9, spaceAfter=5)
BODY = ParagraphStyle('AxBody', parent=styles['BodyText'], fontName='Helvetica', fontSize=8.7, leading=12.2, textColor=SLATE, spaceAfter=5)
BODY_DARK = ParagraphStyle('AxBodyDark', parent=BODY, textColor=NAVY)
SMALL = ParagraphStyle('AxSmall', parent=BODY, fontSize=7.4, leading=10, textColor=MUTED)
SMALL_CENTER = ParagraphStyle('AxSmallCenter', parent=SMALL, alignment=TA_CENTER)
CELL = ParagraphStyle('AxCell', parent=BODY, fontSize=7.2, leading=9.3, spaceAfter=0)
CELL_SMALL = ParagraphStyle('AxCellSmall', parent=CELL, fontSize=6.3, leading=8.1)
CELL_BOLD = ParagraphStyle('AxCellBold', parent=CELL, fontName='Helvetica-Bold', textColor=NAVY)
CELL_CENTER = ParagraphStyle('AxCellCenter', parent=CELL, alignment=TA_CENTER)
HEAD = ParagraphStyle('AxHead', parent=CELL, fontName='Helvetica-Bold', textColor=WHITE, alignment=TA_CENTER, fontSize=6.8, leading=8.4)
METRIC_VALUE = ParagraphStyle('MetricValue', parent=BODY, fontName='Helvetica-Bold', fontSize=17, leading=19, textColor=NAVY, alignment=TA_CENTER)
METRIC_LABEL = ParagraphStyle('MetricLabel', parent=SMALL, fontName='Helvetica-Bold', fontSize=6.5, leading=8, textColor=SLATE, alignment=TA_CENTER)


def p(value: Any, style=BODY) -> Paragraph:
    return Paragraph(html(value), style)


def rich(value: str, style=BODY) -> Paragraph:
    # Conteúdo controlado pelo gerador; valores externos devem passar por html().
    return Paragraph(value, style)


def section(title: str, subtitle: str | None = None) -> list:
    out = [Paragraph(html(title), H1)]
    if subtitle:
        out.append(Paragraph(html(subtitle), SMALL))
    return out


def table(data: list[list[Any]], widths: list[float] | None = None, *, header=True, font_small=False, row_backgrounds: dict[int, Any] | None = None, repeat_rows=1) -> Table:
    parsed: list[list[Any]] = []
    for r, row in enumerate(data):
        parsed_row = []
        for cell in row:
            if isinstance(cell, Paragraph):
                parsed_row.append(cell)
            else:
                parsed_row.append(p(cell, HEAD if header and r == 0 else (CELL_SMALL if font_small else CELL)))
        parsed.append(parsed_row)
    t = Table(parsed, colWidths=widths, repeatRows=repeat_rows if header else 0, hAlign='LEFT')
    commands = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.35, LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]
    if header and data:
        commands += [
            ('BACKGROUND', (0, 0), (-1, 0), TEAL_DARK),
            ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ]
    for row_index, bg in (row_backgrounds or {}).items():
        commands.append(('BACKGROUND', (0, row_index), (-1, row_index), bg))
    t.setStyle(TableStyle(commands))
    return t


def metric_cards(items: list[tuple[str, str, str]], columns=3) -> Table:
    rows = []
    for i in range(0, len(items), columns):
        bloco = items[i:i + columns]
        while len(bloco) < columns:
            bloco.append(('', '', ''))
        cards = []
        for label, value, note in bloco:
            if not label:
                cards.append('')
                continue
            cards.append([
                Paragraph(html(label.upper()), METRIC_LABEL),
                Spacer(1, 1.5 * mm),
                Paragraph(html(value), METRIC_VALUE),
                Spacer(1, 0.8 * mm),
                Paragraph(html(note), SMALL_CENTER),
            ])
        rows.append(cards)
    colw = (PAGE_W - 28 * mm - (columns - 1) * 4 * mm) / columns
    t = Table(rows, colWidths=[colw] * columns, hAlign='LEFT')
    cmds = [
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 0, WHITE),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]
    for r in range(len(rows)):
        for c in range(columns):
            if rows[r][c] != '':
                cmds += [
                    ('BACKGROUND', (c, r), (c, r), BG),
                    ('BOX', (c, r), (c, r), 0.6, LINE),
                ]
    t.setStyle(TableStyle(cmds))
    return t


def callout(title: str, body: str, kind='info') -> Table:
    palette = {
        'ok': (MINT, MINT_LINE, TEAL_DARK),
        'warn': (AMBER, AMBER_LINE, HexColor('#9A3412')),
        'bad': (RED, RED_LINE, HexColor('#991B1B')),
        'info': (BLUE, BLUE_LINE, HexColor('#1E40AF')),
    }
    bg, border, accent = palette.get(kind, palette['info'])
    content = [[rich(f'<b>{html(title)}</b><br/>{html(body)}', BODY_DARK)]]
    t = Table(content, colWidths=[PAGE_W - 28 * mm], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('BOX', (0, 0), (-1, -1), 0.7, border),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return t


def metric_rows(items: Iterable[dict[str, Any]], limit: int | None = None) -> list[dict[str, Any]]:
    arr = list(items or [])
    if limit is not None:
        arr = arr[:limit]
    return arr


def metric_table(items: Iterable[dict[str, Any]], title_col='Alvo', limit=12, include_level=True) -> Table:
    arr = metric_rows(items, limit)
    headers = [title_col, 'Desempenho', 'Acerto marcado', 'Cobertura', 'Questões', 'Alunos', 'Evidências']
    if include_level:
        headers.append('Leitura')
    data = [headers]
    backgrounds = {}
    for idx, item in enumerate(arr, start=1):
        row = [
            txt(item.get('rotulo'), '-'),
            pct(item.get('percentualPontuacao')),
            pct(item.get('percentualAcerto')),
            pct(item.get('coberturaPercentual')),
            inteiro(item.get('questoes', item.get('totalQuestoes'))),
            inteiro(item.get('estudantesComEvidencia', item.get('estudantes'))),
            inteiro(item.get('evidencias', item.get('observadas'))),
        ]
        if include_level:
            row.append(nivel_label(item.get('nivel')))
        data.append(row)
        backgrounds[idx] = nivel_bg(item.get('nivel'))
    widths = [60 * mm, 18 * mm, 16 * mm, 16 * mm, 13 * mm, 13 * mm, 14 * mm] + ([28 * mm] if include_level else [])
    return table(data, widths, row_backgrounds=backgrounds)


def student_priority_text(item: dict[str, Any], max_items=3) -> str:
    needs = item.get('necessidades') or []
    partes = []
    for alvo in needs[:max_items]:
        partes.append(f"{txt(alvo.get('rotulo'))} ({pct(alvo.get('percentualPontuacao'))})")
    return '; '.join(partes) or '-'


def result_priority_text(item: dict[str, Any], max_items=4) -> str:
    combined = list(item.get('porHabilidadeEnem') or []) + list(item.get('porHabilidade') or []) + list(item.get('porEixo') or []) + list(item.get('porConteudo') or [])
    combined = [x for x in combined if txt(x.get('nivel')) == 'prioritario' and x.get('evidenciaSuficiente') and txt(x.get('chave')) != 'NAO_CLASSIFICADO']
    combined.sort(key=lambda x: num(x.get('percentualPontuacao')))
    out, seen = [], set()
    for x in combined:
        key = (txt(x.get('chave')), txt(x.get('rotulo')))
        if key in seen:
            continue
        seen.add(key)
        out.append(f"{txt(x.get('rotulo'))} ({pct(x.get('percentualPontuacao'))})")
        if len(out) >= max_items:
            break
    return '; '.join(out) or '-'



def area_sigla_enem(value: Any) -> str:
    chave = txt(value).upper()
    return {
        'LINGUAGENS': 'LC',
        'MATEMATICA': 'MAT',
        'NATUREZA': 'CN',
        'HUMANAS': 'CH',
    }.get(chave, chave or '-')


def habilidade_codigo_qualificado(item: dict[str, Any]) -> str:
    sigla = area_sigla_enem(item.get('areaCodigo'))
    codigo = txt(item.get('codigo') or item.get('habilidadeCodigo'), '-')
    return f'{sigla}-{codigo}' if sigla and sigla != '-' else codigo



def visual_level_color(level: Any):
    key = txt(level).lower()
    return {
        'consolidado': HexColor('#2FA57F'),
        'em_desenvolvimento': HexColor('#C3A63B'),
        'prioritario': HexColor('#D95F6B'),
        'evidencia_insuficiente': HexColor('#64748B'),
        'critico': HexColor('#9F3651'),
        'prioridade_alta': HexColor('#C9515E'),
        'em_atencao': HexColor('#D58B3E'),
    }.get(key, HexColor('#2C9DB6'))


def chart_horizontal(items: list[dict[str, Any]], label_key='rotulo', value_key='percentualPontuacao', width=175*mm, height=None) -> Drawing:
    items = list(items or [])[:8]
    h = height or max(48*mm, (len(items) * 11 + 18) * mm)
    d = Drawing(width, h)
    left = 52*mm
    right = 15*mm
    top = 7*mm
    bottom = 9*mm
    usable = width - left - right
    row_h = (h - top - bottom) / max(1, len(items))
    for v in (0, 25, 50, 70, 100):
        x = left + usable * v / 100
        d.add(Line(x, bottom, x, h - top, strokeColor=HexColor('#D9E2E8'), strokeWidth=0.5, strokeDashArray=[2,2] if v in (50,70) else None))
        d.add(String(x, 2.4*mm, f'{v}%', fontName='Helvetica', fontSize=6, fillColor=MUTED, textAnchor='middle'))
    for i, item in enumerate(items):
        y = h - top - (i + 0.72) * row_h
        val = max(0, min(100, num(item.get(value_key))))
        d.add(String(1*mm, y + 1.5*mm, normalize_display(item.get(label_key))[:36], fontName='Helvetica-Bold', fontSize=6.5, fillColor=NAVY))
        d.add(Rect(left, y, usable, 5.2*mm, fillColor=HexColor('#F1F5F9'), strokeColor=None, rx=2, ry=2))
        d.add(Rect(left, y, usable * val / 100, 5.2*mm, fillColor=visual_level_color(item.get('nivel')), strokeColor=None, rx=2, ry=2))
        d.add(String(min(width-9*mm, left + usable * val / 100 + 2*mm), y + 1.35*mm, pct(val), fontName='Helvetica-Bold', fontSize=6.5, fillColor=NAVY))
    return d


def chart_histograma(items: list[dict[str, Any]], width=175*mm, height=58*mm) -> Drawing:
    data = list(items or [])
    d = Drawing(width, height)
    if not data:
        d.add(String(width/2, height/2, 'Sem base adequada para o histograma.', fontName='Helvetica', fontSize=8, fillColor=MUTED, textAnchor='middle'))
        return d
    left=12*mm; bottom=10*mm; top=6*mm; right=4*mm
    usable_w=width-left-right; usable_h=height-bottom-top
    maxv=max(1, max(inteiro(x.get('alunos')) for x in data))
    step=usable_w/max(1,len(data)); bw=step*0.72
    for idx,item in enumerate(data):
        count=inteiro(item.get('alunos')); bh=usable_h*count/maxv
        x=left+idx*step+(step-bw)/2
        y=bottom
        color = HexColor('#D95F6B') if idx < 5 else (HexColor('#C3A63B') if idx < 7 else HexColor('#2FA57F'))
        d.add(Rect(x,y,bw,bh,fillColor=color,strokeColor=None,rx=2,ry=2))
        d.add(String(x+bw/2, 2.8*mm, str(inteiro(item.get('inicio'))), fontName='Helvetica', fontSize=5.5, fillColor=MUTED, textAnchor='middle'))
        if count:
            d.add(String(x+bw/2, y+bh+1.2*mm, str(count), fontName='Helvetica-Bold', fontSize=6, fillColor=NAVY, textAnchor='middle'))
    d.add(Line(left,bottom,width-right,bottom,strokeColor=LINE,strokeWidth=.6))
    d.add(String(width-right,2.8*mm,'100',fontName='Helvetica',fontSize=5.5,fillColor=MUTED,textAnchor='end'))
    return d


def chart_turmas(items: list[dict[str, Any]], media_geral: float, width=175*mm, height=62*mm) -> Drawing:
    data=list(items or [])
    d=Drawing(width,height)
    if not data:
        d.add(String(width/2,height/2,'Sem turmas para comparar.',fontName='Helvetica',fontSize=8,fillColor=MUTED,textAnchor='middle'))
        return d
    left=14*mm; bottom=12*mm; top=6*mm; right=4*mm
    usable_w=width-left-right; usable_h=height-bottom-top
    for v in (0,25,50,70,100):
        y=bottom+usable_h*v/100
        d.add(Line(left,y,width-right,y,strokeColor=HexColor('#E2E8F0'),strokeWidth=.5,strokeDashArray=[2,2] if v in (50,70) else None))
        d.add(String(left-2*mm,y-1.2*mm,str(v),fontName='Helvetica',fontSize=5.5,fillColor=MUTED,textAnchor='end'))
    avg_y=bottom+usable_h*max(0,min(100,media_geral))/100
    d.add(Line(left,avg_y,width-right,avg_y,strokeColor=NAVY,strokeWidth=.8,strokeDashArray=[3,2]))
    group=usable_w/max(1,len(data)); bw=min(9*mm,group*.28)
    for idx,item in enumerate(data):
        cx=left+group*(idx+.5)
        score=max(0,min(100,num(item.get('percentualPontuacao')))); coverage=max(0,min(100,num(item.get('coberturaPercentual'))))
        d.add(Rect(cx-bw-1*mm,bottom,bw,usable_h*score/100,fillColor=visual_level_color(item.get('nivel')),strokeColor=None,rx=2,ry=2))
        d.add(Rect(cx+1*mm,bottom,bw,usable_h*coverage/100,fillColor=HexColor('#7DD3FC'),strokeColor=None,rx=2,ry=2))
        d.add(String(cx,bottom-4.5*mm,txt(item.get('turma'))[:12],fontName='Helvetica-Bold',fontSize=6,fillColor=NAVY,textAnchor='middle'))
    return d


def chart_evolucao_areas(items: list[dict[str, Any]], width=175*mm, height=62*mm) -> Drawing:
    data=list(items or [])[:6]
    d=Drawing(width,height)
    if not data:
        d.add(String(width/2,height/2,'Vincule um simulado de referência para visualizar a evolução por área.',fontName='Helvetica',fontSize=7.5,fillColor=MUTED,textAnchor='middle'))
        return d
    left=45*mm; bottom=10*mm; top=6*mm; right=8*mm
    usable=width-left-right; row_h=(height-bottom-top)/max(1,len(data))
    for v in (0,25,50,70,100):
        x=left+usable*v/100
        d.add(Line(x,bottom,x,height-top,strokeColor=HexColor('#E2E8F0'),strokeWidth=.5,strokeDashArray=[2,2] if v in (50,70) else None))
        d.add(String(x,2.5*mm,f'{v}%',fontName='Helvetica',fontSize=5.5,fillColor=MUTED,textAnchor='middle'))
    for idx,item in enumerate(data):
        y=height-top-row_h*(idx+.55)
        antes=max(0,min(100,num(item.get('anterior')))); depois=max(0,min(100,num(item.get('atual')))); delta=num(item.get('variacao'))
        x1=left+usable*antes/100; x2=left+usable*depois/100
        d.add(String(1*mm,y-1.5*mm,txt(item.get('rotulo'))[:31],fontName='Helvetica-Bold',fontSize=6,fillColor=NAVY))
        color=HexColor('#2FA57F') if delta>=0 else HexColor('#D95F6B')
        d.add(Line(x1,y,x2,y,strokeColor=color,strokeWidth=2.0))
        d.add(Circle(x1,y,2.2*mm,fillColor=HexColor('#94A3B8'),strokeColor=WHITE,strokeWidth=.5))
        d.add(Circle(x2,y,2.5*mm,fillColor=color,strokeColor=WHITE,strokeWidth=.5))
        d.add(String(min(width-8*mm,max(x1,x2)+3*mm),y-1.5*mm,f'{delta:+.1f} p.p.'.replace('.',','),fontName='Helvetica-Bold',fontSize=6,fillColor=color))
    return d


def build_story_visual(payload: dict[str, Any]) -> list:
    sim = payload.get('simulado') or {}
    dashboard = payload.get('dashboard') or {}
    resumo = dashboard.get('resumo') or {}
    visual = dashboard.get('analiseVisual') or {}
    comparacao = payload.get('comparacao') or {}
    filtro = payload.get('filtro') or {}
    story: list[Any] = []

    story.append(Paragraph('RELATÓRIO VISUAL - DIAGNÓSTICO PEDAGÓGICO', KICKER))
    story.append(Paragraph('Painel Visual de Resultados', H1))
    story.append(p(f"{txt(sim.get('titulo'),'Simulado')} | Recorte: {txt(filtro.get('turma'),'Todas permitidas')}", BODY_DARK))
    story.append(p('Este relatório traduz o mesmo diagnóstico do Axoriin em gráficos para facilitar leitura de tendências, diferenças entre turmas, concentração de dificuldades e evolução. Não estima TRI.', SMALL))
    story.append(Spacer(1, 2*mm))
    story.append(metric_cards([
        ('Participantes', str(inteiro(resumo.get('participantes'))), f"{inteiro(resumo.get('turmas'))} turma(s)"),
        ('Desempenho confirmado', pct(resumo.get('percentualPontuacao')), 'acertos brutos confirmados'),
        ('Cobertura dos dados', pct(resumo.get('coberturaPercentual')), 'respostas confirmadas / aplicáveis'),
        ('Participação completa + base adequada', str(inteiro(resumo.get('alunosBaseAdequada'))), 'classificação global permitida'),
        ('Participação parcial confirmada', str(inteiro(resumo.get('alunosParticipacaoParcial'))), 'analisar apenas dias/áreas realizados'),
        ('Base realmente incompleta', str(inteiro(resumo.get('alunosBaseIncompleta'))), 'exige conferência antes de conclusão global'),
    ], columns=3))

    story += section('1. Visão geral por área', 'As linhas de 50% e 70% são faixas internas de gestão pedagógica; não são cortes oficiais do ENEM.')
    story.append(chart_horizontal(visual.get('porArea') or dashboard.get('porArea') or []))

    story += section('2. Como os estudantes estão distribuídos', 'O histograma considera somente estudantes com participação completa e base adequada. Participação parcial confirmada aparece separada e não é confundida com evidência insuficiente.')
    story.append(chart_histograma(visual.get('histogramaDesempenho') or []))
    dist = visual.get('distribuicaoFaixas') or dashboard.get('distribuicaoAlunos') or []
    if dist:
        resumo_dist = ' · '.join(f"{nivel_label(x.get('nivel'))}: {inteiro(x.get('quantidade'))}" for x in dist)
        story.append(p(resumo_dist, SMALL))

    story += [PageBreak()]
    story += section('3. Turmas lado a lado', 'Barras sólidas mostram desempenho; barras azuis mostram cobertura. A linha horizontal representa a média geral do recorte.')
    story.append(chart_turmas(visual.get('porTurma') or dashboard.get('porTurma') or [], num(resumo.get('percentualPontuacao'))))
    turmas=visual.get('porTurma') or dashboard.get('porTurma') or []
    if turmas:
        data=[['Turma','Alunos','Desempenho','Cobertura','Leitura']]
        for x in turmas:
            data.append([txt(x.get('turma')),inteiro(x.get('alunos')),pct(x.get('percentualPontuacao')),pct(x.get('coberturaPercentual')),nivel_label(x.get('nivel'))])
        story.append(table(data,[35*mm,25*mm,35*mm,35*mm,45*mm]))

    story += section('4. Participação por dia', 'Ausência confirmada não é tratada como erro nem como baixa cobertura artificial.')
    part=visual.get('participacaoPorDia') or dashboard.get('participacaoPorDia') or []
    if part:
        data=[['Dia','Previstos','Presentes','Ausentes confirmados','Participação']]
        for x in part:
            total=max(1,inteiro(x.get('previstos')))
            data.append([f"{inteiro(x.get('dia'))}º dia",total,inteiro(x.get('presentes')),inteiro(x.get('ausentes')),pct(inteiro(x.get('presentes'))*100/total)])
        story.append(table(data,[30*mm,32*mm,32*mm,45*mm,35*mm]))
    else:
        story.append(callout('Sem dados de participação', 'Nenhum dia de aplicação foi identificado neste recorte.', 'info'))

    story += section('5. Questões por faixa de acerto', 'A distribuição ajuda a perceber se a dificuldade está concentrada em alguns itens ou espalhada pela prova.')
    fq=visual.get('faixasQuestoes') or []
    if fq:
        data=[['Faixa do item','Questões']]+[[txt(x.get('rotulo')),inteiro(x.get('quantidade'))] for x in fq]
        story.append(table(data,[95*mm,45*mm]))

    story += [PageBreak()]
    story += section('6. Habilidades ENEM: mapa de prioridades e potencialidades', 'Somente habilidades efetivamente trabalhadas no simulado. Uma habilidade medida por um único item continua sendo leitura indicativa.')
    habilidades=list(dashboard.get('porHabilidadeEnem') or [])
    if habilidades:
        prioridades=[x for x in habilidades if x.get('evidenciaSuficiente') and txt(x.get('nivel')).lower()=='prioritario']
        prioridades.sort(key=lambda x:num(x.get('percentualPontuacao')))
        fortes=[x for x in habilidades if x.get('evidenciaSuficiente') and txt(x.get('nivel')).lower()=='consolidado']
        fortes.sort(key=lambda x:num(x.get('percentualPontuacao')), reverse=True)
        story.append(Paragraph('Prioridades sustentadas', H2))
        data=[['Área','Hab.','Descrição','Desemp.','Questões','Estudantes']]
        for x in prioridades[:16]:
            data.append([txt(x.get('areaCodigo')),txt(x.get('codigo') or x.get('habilidadeCodigo')),txt(x.get('descricao') or x.get('habilidadeDescricao') or x.get('rotulo')),pct(x.get('percentualPontuacao')),inteiro(x.get('questoes') or x.get('totalQuestoes')),inteiro(x.get('estudantesComEvidencia') or x.get('estudantes'))])
        story.append(table(data,[15*mm,15*mm,95*mm,20*mm,18*mm,20*mm],font_small=True))
        story.append(Paragraph('Potencialidades sustentadas', H2))
        if fortes:
            data=[['Área','Hab.','Descrição','Desemp.','Questões']]
            for x in fortes[:10]: data.append([txt(x.get('areaCodigo')),txt(x.get('codigo') or x.get('habilidadeCodigo')),txt(x.get('descricao') or x.get('habilidadeDescricao') or x.get('rotulo')),pct(x.get('percentualPontuacao')),inteiro(x.get('questoes') or x.get('totalQuestoes'))])
            story.append(table(data,[15*mm,15*mm,105*mm,22*mm,18*mm],font_small=True))
        else:
            story.append(p('Ainda não há habilidade ENEM consolidada com evidência suficiente neste recorte.', SMALL))
    else:
        story.append(callout('Sem habilidades ENEM mapeadas', 'O mapa de habilidades estará disponível quando o simulado possuir mapeamento H1-H30 e resultados processados.', 'warn'))

    story += section('7. Evolução contra o simulado de referência', 'A comparação usa os mesmos estudantes presentes nos dois simulados. Diferenças são apresentadas em pontos percentuais de desempenho bruto.')
    if comparacao and inteiro(comparacao.get('alunosComparados')):
        story.append(metric_cards([
            ('Alunos comparados', str(inteiro(comparacao.get('alunosComparados'))), 'mesmos estudantes nos dois simulados'),
            ('Variação média', f"{num(comparacao.get('mediaVariacao')):+.1f} p.p.".replace('.',','), 'desempenho bruto'),
            ('Melhoraram', str(inteiro(comparacao.get('melhoraram'))), 'variação acima de 0 p.p.'),
            ('Reduziram', str(inteiro(comparacao.get('reduziram'))), 'variação abaixo de 0 p.p.'),
        ], columns=2))
        story.append(chart_evolucao_areas(comparacao.get('porArea') or []))
        habilidades_evol=list(comparacao.get('porHabilidadeEnem') or [])
        if habilidades_evol:
            story.append(Paragraph('Maiores mudanças entre habilidades em comum', H2))
            data=[['Hab./alvo','Anterior','Atual','Variação','Alunos']]
            for x in habilidades_evol[:12]:
                rot=txt(x.get('rotulo')) or f"{txt(x.get('areaCodigo'))}-{txt(x.get('habilidadeCodigo'))}"
                data.append([rot,pct(x.get('anterior')),pct(x.get('atual')),f"{num(x.get('variacao')):+.1f} p.p.".replace('.',','),inteiro(x.get('alunos'))])
            story.append(table(data,[83*mm,25*mm,25*mm,27*mm,22*mm],font_small=True))
    else:
        story.append(callout('Ainda sem comparação longitudinal', 'Vincule um simulado de referência na configuração. O Axoriin então compara os mesmos estudantes e as áreas/habilidades em comum, sem misturar turmas diferentes.', 'info'))

    story += [PageBreak()]
    story += section('8. Leitura para tomada de decisão', 'Os gráficos servem para enxergar o padrão; a intervenção deve continuar sustentada pela evidência pedagógica detalhada do diagnóstico.')
    prioridades=dashboard.get('prioridadesPedagogicas') or []
    if prioridades:
        data=[['Pri.','Nível','Foco','Por que agir','Ação sugerida']]
        for x in prioridades[:8]:
            data.append([inteiro(x.get('prioridade')),txt(x.get('nivelIntervencao')),txt(x.get('titulo')),txt(x.get('porQue')),txt(x.get('acaoSugerida'))])
        story.append(table(data,[12*mm,20*mm,55*mm,48*mm,50*mm],font_small=True))
    story.append(callout('Importante', 'Este relatório visual usa somente os dados internos confirmados do Axoriin. Comparações com Brasil, Acre ou Cruzeiro do Sul e estimativas de ganho em pontos TRI exigem base externa oficial e metodologia específica; não são inferidas artificialmente.', 'warn'))
    story.append(p('O caminho recomendado é: diagnosticar → priorizar → intervir → reaplicar itens equivalentes → medir evolução. O PDF visual complementa, mas não substitui, o relatório gerencial e o relatório específico de habilidades ENEM.', SMALL))
    return story

def build_story_habilidades_enem(payload: dict[str, Any]) -> list:
    """Relatório específico: somente competências e habilidades ENEM trabalhadas."""
    sim = payload.get('simulado') or {}
    dashboard = payload.get('dashboard') or {}
    filtro = payload.get('filtro') or {}
    resumo = dashboard.get('resumo') or {}
    cobertura_enem = dashboard.get('coberturaEnem') or {}
    habilidades = list(dashboard.get('porHabilidadeEnem') or [])
    competencias = list(dashboard.get('porCompetenciaEnem') or [])
    prioridades = list(dashboard.get('prioridadesHabilidadeEnem') or [])
    pontos_fortes = list(dashboard.get('pontosFortesHabilidadeEnem') or [])
    cfg = dashboard.get('configuracao') or {}
    metodologia = dashboard.get('metodologia') or {}
    turma = txt(filtro.get('turma'), 'Todas permitidas')

    gerado = txt(payload.get('geradoEm'))
    try:
        dt = datetime.fromisoformat(gerado.replace('Z', '+00:00'))
        gerado_fmt = dt.strftime('%d/%m/%Y %H:%M')
    except Exception:
        gerado_fmt = gerado or datetime.now().strftime('%d/%m/%Y %H:%M')

    sustentadas = [x for x in habilidades if x.get('evidenciaSuficiente')]
    indicativas = [x for x in habilidades if txt(x.get('leituraEvidencia')) == 'indicativa_um_item']
    prioritarias = [x for x in sustentadas if txt(x.get('nivel')).lower() in ('prioritario', 'prioridade_alta', 'critico')]
    consolidadas = [x for x in sustentadas if txt(x.get('nivel')).lower() == 'consolidado']
    total_habilidades = len(habilidades)
    total_variantes = inteiro(cobertura_enem.get('variantesElegiveis'))
    mapeadas = inteiro(cobertura_enem.get('variantesMapeadas'))
    diretas = inteiro(cobertura_enem.get('variantesMapeadasDiretas'))
    aproximadas = inteiro(cobertura_enem.get('variantesMapeadasAproximadas'))

    story: list = [
        Paragraph('RELATÓRIO ESPECÍFICO - MATRIZ ENEM', KICKER),
        Paragraph('Diagnóstico de Habilidades ENEM', TITLE),
        Paragraph(
            f"<b>{html(sim.get('titulo', 'Simulado'))}</b><br/>"
            f"Código: {html(sim.get('codigo', '-'))} &nbsp;&nbsp;|&nbsp;&nbsp; Ano letivo: {html(sim.get('anoLetivo', '-'))} &nbsp;&nbsp;|&nbsp;&nbsp; Recorte: {html(turma)}<br/>"
            f"Gerado em: {html(gerado_fmt)}",
            SUBTITLE,
        ),
    ]

    cards = [
        ('Participantes', str(inteiro(resumo.get('participantes'))), f"{inteiro(resumo.get('turmas'))} turma(s)"),
        ('Mapeamento ENEM', f'{mapeadas}/{total_variantes}', f'{diretas} diretos · {aproximadas} aproximados'),
        ('Habilidades trabalhadas', str(total_habilidades), 'somente as presentes neste simulado'),
        ('Diagnóstico sustentado', str(len(sustentadas)), 'múltiplos itens + base mínima'),
        ('Habilidades prioritárias', str(len(prioritarias)), 'retomada curricular'),
        ('Cobertura dos dados', pct(resumo.get('coberturaPercentual')), 'respostas confirmadas / aplicáveis'),
    ]
    story += [metric_cards(cards), Spacer(1, 4 * mm)]

    fonte = cobertura_enem.get('fonte') or {}
    story.append(callout(
        'Escopo deste relatório',
        'Este documento apresenta somente as competências e habilidades da Matriz de Referência ENEM efetivamente trabalhadas no simulado. '
        'Não repete o relatório gerencial geral, a lista completa de questões, conteúdos isolados ou resultados individuais.',
        'info',
    ))
    story += [Spacer(1, 2 * mm), callout(
        'Referência e rastreabilidade',
        f"Fonte: {txt(fonte.get('titulo'), 'Matrizes de Referência ENEM')} - {txt(fonte.get('orgao'), 'INEP/MEC')}, {txt(fonte.get('ano'), '2026')}. "
        f"Mapeamento: {mapeadas} de {total_variantes} variantes; {diretas} vínculo(s) direto(s) e {aproximadas} aproximação(ões) pedagógica(s) identificada(s).",
        'ok' if total_variantes and mapeadas == total_variantes else 'warn',
    )]

    story += section('1. Cobertura das habilidades trabalhadas', 'Mostra quanto da Matriz ENEM apareceu efetivamente neste simulado; não representa domínio dos estudantes.')
    areas_cov = cobertura_enem.get('areas') or []
    if areas_cov:
        data = [['Área', 'Hab. trabalhadas', 'Total matriz', '% da matriz', 'Competências', 'Questões', 'Variantes', 'Diretas', 'Aprox.']]
        for x in areas_cov:
            data.append([
                txt(x.get('areaNome')), inteiro(x.get('habilidadesTrabalhadas')), inteiro(x.get('totalHabilidadesMatriz')),
                pct(x.get('percentualHabilidadesMatriz')), inteiro(x.get('competenciasTrabalhadas')), inteiro(x.get('questoesMapeadas')),
                inteiro(x.get('variantesMapeadas')), inteiro(x.get('variantesMapeadasDiretas')), inteiro(x.get('variantesMapeadasAproximadas')),
            ])
        story.append(table(data, [47*mm, 20*mm, 18*mm, 19*mm, 20*mm, 16*mm, 17*mm, 15*mm, 15*mm], font_small=True))
    else:
        story.append(callout('Sem cobertura ENEM calculada', 'O simulado ainda não possui dados suficientes para montar a cobertura da Matriz ENEM.', 'warn'))

    story += [NextPageTemplate('Paisagem'), PageBreak()]
    story += section('2. Competências de área efetivamente avaliadas', 'Cada competência abaixo reúne somente as habilidades vinculadas às questões deste simulado.')
    if competencias:
        data = [['Área', 'Comp.', 'Competência', 'Hab.', 'Questões', 'Desemp.', 'Cob.', 'Leitura']]
        for x in competencias:
            leitura = 'Indicativa - 1 item' if txt(x.get('leituraEvidencia')) == 'indicativa_um_item' else nivel_label(x.get('nivel'))
            data.append([
                txt(x.get('areaNome')), txt(x.get('competenciaCodigo') or x.get('codigo')), txt(x.get('competenciaDescricao') or x.get('descricao')),
                inteiro(x.get('habilidades')), inteiro(x.get('questoes')), pct(x.get('percentualPontuacao')), pct(x.get('coberturaPercentual')), leitura,
            ])
        story.append(table(data, [42*mm, 13*mm, 95*mm, 13*mm, 16*mm, 18*mm, 17*mm, 30*mm], font_small=True))
    else:
        story.append(callout('Sem competência ENEM calculada', 'Não há competências agregadas disponíveis neste recorte.', 'warn'))

    story += section('3. Habilidades ENEM trabalhadas - mapa completo', 'Esta é a relação específica das habilidades presentes no simulado. A classificação é sustentada apenas quando há múltiplos itens e base mínima de estudantes.')
    if habilidades:
        ordem_area = {'LINGUAGENS': 1, 'HUMANAS': 2, 'NATUREZA': 3, 'MATEMATICA': 4}
        habilidades.sort(key=lambda x: (ordem_area.get(txt(x.get('areaCodigo')).upper(), 9), txt(x.get('competenciaCodigo')), txt(x.get('codigo'))))
        for area_codigo in ['LINGUAGENS', 'HUMANAS', 'NATUREZA', 'MATEMATICA']:
            itens = [x for x in habilidades if txt(x.get('areaCodigo')).upper() == area_codigo]
            if not itens:
                continue
            story.append(Paragraph(txt(itens[0].get('areaNome'), area_codigo), H2))
            data = [['Comp.', 'Hab.', 'Descrição da habilidade', 'Quest.', 'Estud.', 'Desemp.', 'Acerto', 'Cob.', 'Evidência', 'Map.']]
            backgrounds = {}
            for idx, x in enumerate(itens, 1):
                leitura_evid = 'Indicativa - 1 item' if txt(x.get('leituraEvidencia')) == 'indicativa_um_item' else nivel_label(x.get('nivel'))
                aprox = inteiro(x.get('questoesAproximadas'))
                confianca = f'{aprox} aprox.' if aprox else 'Direta'
                data.append([
                    txt(x.get('competenciaCodigo')), habilidade_codigo_qualificado(x), txt(x.get('descricao')),
                    inteiro(x.get('questoes')), inteiro(x.get('estudantesComEvidencia')), pct(x.get('percentualPontuacao')),
                    pct(x.get('percentualAcerto')), pct(x.get('coberturaPercentual')), leitura_evid, confianca,
                ])
                backgrounds[idx] = nivel_bg(x.get('nivel')) if x.get('evidenciaSuficiente') else BG
            story.append(table(data, [13*mm, 17*mm, 100*mm, 14*mm, 15*mm, 18*mm, 17*mm, 16*mm, 26*mm, 18*mm], font_small=True, row_backgrounds=backgrounds))
    else:
        story.append(callout('Nenhuma habilidade ENEM disponível', 'O mapeamento ainda não gerou habilidades para este recorte.', 'warn'))

    story += section('4. Prioridades e potencialidades por habilidade', 'Aqui aparecem somente conclusões sustentadas. Habilidades observadas em um único item ficam separadas como leitura indicativa.')
    if prioridades:
        prioridades.sort(key=lambda x: num(x.get('percentualPontuacao')))
        story.append(Paragraph('Habilidades prioritárias para retomada', H2))
        data = [['Pri.', 'Área', 'Hab.', 'Descrição', 'Desemp.', 'Quest.', 'Estud.', 'Cob.']]
        for idx, x in enumerate(prioridades[:20], 1):
            data.append([
                idx, txt(x.get('areaNome')), habilidade_codigo_qualificado(x), txt(x.get('descricao')),
                pct(x.get('percentualPontuacao')), inteiro(x.get('questoes')), inteiro(x.get('estudantesComEvidencia')), pct(x.get('coberturaPercentual')),
            ])
        story.append(table(data, [10*mm, 38*mm, 18*mm, 105*mm, 18*mm, 14*mm, 15*mm, 16*mm], font_small=True))
    else:
        story.append(callout('Sem habilidade prioritária sustentada', 'Nenhuma habilidade atendeu simultaneamente aos critérios de prioridade e força de evidência.', 'info'))

    fortes = pontos_fortes or consolidadas
    if fortes:
        fortes.sort(key=lambda x: num(x.get('percentualPontuacao')), reverse=True)
        story.append(Paragraph('Habilidades com evidência consolidada', H2))
        data = [['Área', 'Hab.', 'Descrição', 'Desemp.', 'Quest.', 'Estud.']]
        for x in fortes[:20]:
            data.append([txt(x.get('areaNome')), habilidade_codigo_qualificado(x), txt(x.get('descricao')), pct(x.get('percentualPontuacao')), inteiro(x.get('questoes')), inteiro(x.get('estudantesComEvidencia'))])
        story.append(table(data, [42*mm, 18*mm, 130*mm, 20*mm, 16*mm, 18*mm], font_small=True))

    if indicativas:
        story.append(Paragraph('Habilidades observadas em apenas um item', H2))
        story.append(p('Essas habilidades foram trabalhadas, mas o resultado é apenas indicativo: um único item não sustenta conclusão de domínio ou dificuldade curricular.', SMALL))
        data = [['Área', 'Hab.', 'Descrição', 'Desemp. no item', 'Estudantes']]
        for x in indicativas:
            data.append([txt(x.get('areaNome')), habilidade_codigo_qualificado(x), txt(x.get('descricao')), pct(x.get('percentualPontuacao')), inteiro(x.get('estudantesComEvidencia'))])
        story.append(table(data, [44*mm, 18*mm, 145*mm, 24*mm, 22*mm], font_small=True))

    story += section('5. Intervenção orientada por habilidades ENEM', 'A dificuldade ampla vira retomada coletiva; pequenos grupos ficam reservados a subconjuntos com uma necessidade comum.')
    turma_plano = (dashboard.get('planoIntervencao') or {}).get('turma') or {}
    coletivas = turma_plano.get('habilidadesEnem') or []
    if coletivas:
        story.append(Paragraph('Retomadas coletivas', H2))
        data = [['Hab.', 'Área', 'Descrição', 'Desemp.', 'Questões', 'Estudantes']]
        for x in coletivas:
            item = {
                'areaCodigo': x.get('areaCodigo'),
                'codigo': x.get('habilidadeCodigo'),
            }
            data.append([
                habilidade_codigo_qualificado(item), txt(x.get('areaNome')), txt(x.get('habilidadeDescricao')),
                pct(x.get('percentualPontuacao')), inteiro(x.get('questoes')), inteiro(x.get('estudantes')),
            ])
        story.append(table(data, [20*mm, 42*mm, 132*mm, 20*mm, 18*mm, 20*mm], font_small=True))
    else:
        story.append(callout('Sem retomada coletiva por habilidade', 'Nenhuma habilidade ENEM atingiu o alcance definido para intervenção de turma neste recorte.', 'info'))

    amplas = [g for g in (dashboard.get('intervencoesAmplas') or []) if txt(g.get('tipoAlvo')).lower() == 'habilidade_enem']
    if amplas:
        story.append(Paragraph('Intervenções amplas — organizar por turma', H2))
        story.append(p('Necessidades com mais de 15 estudantes e abaixo do limiar coletivo de 60% não são tratadas como “pequeno grupo”. A coordenação deve distribuir a retomada por turma.', SMALL))
        data = [['Habilidade / alvo', 'Alunos', '% do recorte', 'Leitura operacional']]
        participantes = max(1, inteiro(resumo.get('participantes')))
        for g in amplas[:20]:
            alunos = g.get('alunos') or []
            percentual_part = num(g.get('percentualParticipantes')) or (100 * len(alunos) / participantes)
            data.append([
                txt(g.get('rotulo')), len(alunos), pct(percentual_part),
                'Intervenção ampla organizada por turma; subdividir somente quando necessário.',
            ])
        story.append(table(data, [145*mm, 18*mm, 25*mm, 65*mm], font_small=True))

    grupos = [g for g in (dashboard.get('gruposIntervencao') or []) if txt(g.get('tipoAlvo')).lower() == 'habilidade_enem']
    if grupos:
        story.append(Paragraph('Pequenos grupos por habilidade', H2))
        data = [['Habilidade / alvo', 'Alunos', '% do recorte', 'Leitura operacional']]
        participantes = max(1, inteiro(resumo.get('participantes')))
        for g in grupos[:20]:
            alunos = g.get('alunos') or []
            percentual_part = num(g.get('percentualParticipantes')) or (100 * len(alunos) / participantes)
            data.append([
                txt(g.get('rotulo')), len(alunos), pct(percentual_part),
                'Intervenção focalizada e nova verificação com itens diferentes que meçam o mesmo alvo.',
            ])
        story.append(table(data, [145*mm, 18*mm, 25*mm, 65*mm], font_small=True))

    story += section('6. Critérios de leitura', 'O relatório específico mantém as mesmas regras metodológicas do diagnóstico geral, mas restringe a apresentação à Matriz ENEM.')
    criterio = (
        f"Diagnóstico sustentado exige no mínimo {inteiro(cfg.get('minimoQuestoesIndicador', 2))} questões no indicador e base coletiva mínima configurada. "
        "Habilidade medida por um único item permanece como evidência indicativa. Mapeamentos aproximados são identificados explicitamente."
    )
    story.append(callout('Força da evidência', criterio, 'info'))
    if txt(metodologia.get('matrizEnem')):
        story.append(callout('Matriz ENEM', txt(metodologia.get('matrizEnem')), 'info'))
    if txt(metodologia.get('evidenciaHabilidadeEnem')):
        story.append(callout('Evidência para habilidade ENEM', txt(metodologia.get('evidenciaHabilidadeEnem')), 'info'))
    story.append(callout(
        'Limite metodológico',
        'Os percentuais representam acertos brutos para diagnóstico pedagógico e não correspondem à nota TRI oficial do ENEM. '
        'Use este relatório para planejamento, retomada e acompanhamento formativo, combinado com outras evidências escolares.',
        'warn',
    ))
    return story

def build_story(payload: dict[str, Any]) -> list:
    sim = payload.get('simulado') or {}
    dashboard = payload.get('dashboard') or {}
    results = payload.get('resultados') or []
    comparacao = payload.get('comparacao') or {}
    filtro = payload.get('filtro') or {}
    resumo = dashboard.get('resumo') or {}
    cfg = dashboard.get('configuracao') or {}
    leitura = dashboard.get('leituraExecutiva') or {}
    metodologia = dashboard.get('metodologia') or {}
    turma = txt(filtro.get('turma'), 'Todas permitidas')
    gerado = txt(payload.get('geradoEm'))
    try:
        dt = datetime.fromisoformat(gerado.replace('Z', '+00:00'))
        gerado_fmt = dt.strftime('%d/%m/%Y %H:%M')
    except Exception:
        gerado_fmt = gerado or datetime.now().strftime('%d/%m/%Y %H:%M')

    story: list = []
    story += [
        Paragraph('RELATÓRIO GERENCIAL E PEDAGÓGICO', KICKER),
        Paragraph('Diagnóstico de Simulado', TITLE),
        Paragraph(
            f"<b>{html(sim.get('titulo', 'Simulado'))}</b><br/>"
            f"Código: {html(sim.get('codigo', '-'))} &nbsp;&nbsp;|&nbsp;&nbsp; Ano letivo: {html(sim.get('anoLetivo', '-'))} &nbsp;&nbsp;|&nbsp;&nbsp; Recorte: {html(turma)}<br/>"
            f"Gerado em: {html(gerado_fmt)}",
            SUBTITLE,
        ),
    ]

    cards = [
        ('Participantes', str(inteiro(resumo.get('participantes'))), f"{inteiro(resumo.get('turmas'))} turma(s)"),
        ('Desempenho confirmado', pct(resumo.get('percentualPontuacao')), 'brancos entram como zero'),
        ('Acerto nas respostas marcadas', pct(resumo.get('percentualAcerto')), 'acertos entre A-E marcadas'),
        ('Cobertura dos dados', pct(resumo.get('coberturaPercentual')), f"{inteiro(resumo.get('observadas'))} de {inteiro(resumo.get('aplicaveis'))} aplicáveis"),
        ('Participação completa + base adequada', str(inteiro(resumo.get('alunosBaseAdequada'))), f"mínimo {pct(cfg.get('minimoCoberturaIndividual', 80))}"),
        ('Participação parcial confirmada', str(inteiro(resumo.get('alunosParticipacaoParcial'))), 'áreas/dias realizados permanecem válidos'),
        ('Base realmente incompleta', str(inteiro(resumo.get('alunosBaseIncompleta'))), 'exige conferência antes de conclusão global'),
    ]
    story += [metric_cards(cards, columns=4), Spacer(1, 4 * mm)]

    status = txt(leitura.get('statusDados')).lower()
    if status == 'completo':
        story.append(callout('Base completa para o recorte', txt(leitura.get('sintese'), 'A cobertura do recorte está completa.'), 'ok'))
    else:
        detalhe = txt(leitura.get('sintese'))
        detalhe += f" Há {inteiro(resumo.get('naoInformadas'))} resposta(s) não importada(s) e {inteiro(resumo.get('alunosIdiomaPendente'))} aluno(s) com língua pendente."
        story.append(callout('Base parcial: decisões coletivas e individuais exigem leituras diferentes', detalhe, 'warn'))

    if inteiro(resumo.get('alunosSemOpcaoIdioma')) > 0:
        story += [Spacer(1, 2 * mm), callout(
            'Língua não marcada é ocorrência procedimental, não conteúdo pedagógico',
            f"{inteiro(resumo.get('alunosSemOpcaoIdioma'))} aluno(s) não marcou(aram) Inglês nem Espanhol. O zero permanece no resultado das questões de língua, mas essa ocorrência não entra como conteúdo, habilidade, eixo pedagógico ou questão acadêmica prioritária.",
            'info',
        )]

    story += section('1. Leitura executiva para a gestão', 'A ordem de ação é turma → grupo → individual; alertas de integridade ficam separados das prioridades de aprendizagem.')
    story.append(p(txt(leitura.get('sintese'), 'Sem síntese disponível.')))
    story.append(p(txt(leitura.get('criterio'), '')))

    alerts = dashboard.get('alertasIntegridade') or []
    story.append(Paragraph('Alertas de integridade e procedimento', H2))
    if alerts:
        data = [['Alerta', 'O que significa', 'Ação sugerida', 'Base da evidência']]
        for a in alerts[:8]:
            data.append([txt(a.get('titulo')), txt(a.get('mensagem')), txt(a.get('acaoSugerida')), txt(a.get('evidencia'))])
        story.append(table(data, [42 * mm, 45 * mm, 50 * mm, 43 * mm], font_small=True))
    else:
        story.append(callout('Sem alerta relevante de integridade', 'A base deste recorte não apresenta pendência de procedimento que altere a interpretação gerencial.', 'ok'))

    actions = dashboard.get('prioridadesPedagogicas') or dashboard.get('acoesGestao') or []
    story.append(Paragraph('Prioridades pedagógicas para decisão', H2))
    if actions:
        data = [['Pri.', 'Nível', 'Foco', 'Por que agir', 'Ação sugerida', 'Base da evidência']]
        for a in actions[:5]:
            data.append([
                inteiro(a.get('prioridade')),
                txt(a.get('nivelIntervencao'), '-'),
                txt(a.get('titulo')),
                txt(a.get('porQue')),
                txt(a.get('acaoSugerida')),
                txt(a.get('evidencia')),
            ])
        story.append(table(data, [9 * mm, 18 * mm, 34 * mm, 38 * mm, 43 * mm, 38 * mm], font_small=True))
    else:
        story.append(callout('Sem prioridade acadêmica sustentada', 'Não houve prioridade pedagógica que atendesse simultaneamente aos critérios de evidência e abrangência.', 'info'))

    story += section('2. Qualidade e abrangência da evidência', 'A cobertura geral pode ser alta mesmo quando alguns estudantes possuem metade da prova ausente; por isso a cobertura individual é mostrada separadamente.')
    quality_data = [
        ['Indicador', 'Valor', 'Leitura operacional'],
        ['Respostas aplicáveis', inteiro(resumo.get('aplicaveis')), 'Universo de respostas que poderiam compor este recorte.'],
        ['Respostas observadas', inteiro(resumo.get('observadas')), 'Confirmadas, incluindo brancos e língua não marcada.'],
        ['Respostas não importadas', inteiro(resumo.get('naoInformadas')), 'Reduzem cobertura; não entram automaticamente como erro.'],
        ['Respostas em branco', inteiro(resumo.get('brancos')), 'São evidência confirmada e valem zero no desempenho.'],
        ['Alunos com base completa', inteiro(resumo.get('alunosBaseCompleta')), 'Participação completa, cobertura de 100% e sem língua pendente.'],
        ['Participação completa + base adequada', inteiro(resumo.get('alunosBaseAdequada')), f"Participação completa, cobertura de pelo menos {pct(cfg.get('minimoCoberturaIndividual', 80))} e sem língua pendente."],
        ['Participação parcial confirmada', inteiro(resumo.get('alunosParticipacaoParcial')), 'Ausência confirmada em ao menos um dia; não entra na classificação global, mas os dias/áreas realizados permanecem válidos.'],
        ['Base realmente incompleta', inteiro(resumo.get('alunosBaseIncompleta')), 'Participação completa, porém a cobertura/evidência ainda não sustenta conclusão global individual.'],
        ['Alunos sem opção de língua', inteiro(resumo.get('alunosSemOpcaoIdioma')), 'O zero afeta o resultado, mas não vira prioridade curricular.'],
    ]
    story.append(table(quality_data, [56 * mm, 24 * mm, 100 * mm]))

    dist = dashboard.get('distribuicaoAlunos') or []
    if dist:
        story.append(Paragraph('Distribuição dos estudantes por faixa operacional', H2))
        total = max(1, sum(inteiro(x.get('quantidade')) for x in dist))
        data = [['Faixa', 'Alunos', '% do recorte']]
        backgrounds = {}
        for idx, x in enumerate(dist, 1):
            q = inteiro(x.get('quantidade'))
            data.append([nivel_label(x.get('nivel')), q, pct(100 * q / total)])
            backgrounds[idx] = nivel_bg(x.get('nivel'))
        story.append(table(data, [80 * mm, 30 * mm, 30 * mm], row_backgrounds=backgrounds))

    turmas = dashboard.get('porTurma') or []
    if turmas:
        story.append(Paragraph('Comparação por turma', H2))
        data = [['Turma', 'Alunos', 'Desempenho', 'Acerto marcado', 'Cobertura', 'Dif. geral', 'Leitura']]
        backgrounds = {}
        for idx, x in enumerate(turmas, 1):
            delta = num(x.get('diferencaGeral'))
            data.append([
                txt(x.get('turma')), inteiro(x.get('alunos')), pct(x.get('percentualPontuacao')), pct(x.get('percentualAcerto')),
                pct(x.get('coberturaPercentual')), (('+' if delta > 0 else '') + pct(delta)), nivel_label(x.get('nivel')),
            ])
            backgrounds[idx] = nivel_bg(x.get('nivel'))
        story.append(table(data, [36 * mm, 16 * mm, 24 * mm, 24 * mm, 22 * mm, 20 * mm, 38 * mm], row_backgrounds=backgrounds))

    story += section('3. Prioridades de aprendizagem', 'Uma prioridade curricular só aparece quando há evidência em múltiplas questões e número mínimo de estudantes. Itens isolados ficam na seção de revisão de questões.')
    prioridades_eixo = dashboard.get('prioridadesEixo') or []
    prioridades_h = dashboard.get('prioridadesHabilidade') or []
    prioridades_h_enem = dashboard.get('prioridadesHabilidadeEnem') or []
    prioridades_c = dashboard.get('prioridadesConteudo') or []
    if prioridades_eixo:
        story.append(Paragraph('Eixos pedagógicos prioritários', H2))
        story.append(p('O eixo usa MACROCONTEUDO quando a matriz o informa; se estiver vazio, usa o componente curricular como agrupador transparente, sem inventar uma taxonomia.', SMALL))
        story.append(metric_table(prioridades_eixo, 'Eixo pedagógico', 12))
    if prioridades_h_enem:
        story.append(Paragraph('Habilidades ENEM prioritárias', H2))
        story.append(p('Para simulados ENEM, este quadro prioriza as habilidades oficiais com evidência sustentada; o código deve ser lido junto com a área.', SMALL))
        data = [['Área', 'Hab.', 'Descrição', 'Desemp.', 'Cob.', 'Questões', 'Estudantes']]
        for x in prioridades_h_enem[:12]:
            aprox = inteiro(x.get('questoesAproximadas'))
            questoes_txt = str(inteiro(x.get('questoes'))) + (f' ({aprox} aprox.)' if aprox else '')
            data.append([txt(x.get('areaNome')), txt(x.get('codigo')), txt(x.get('descricao')), pct(x.get('percentualPontuacao')), pct(x.get('coberturaPercentual')), questoes_txt, inteiro(x.get('estudantesComEvidencia'))])
        story.append(table(data, [34*mm, 11*mm, 78*mm, 17*mm, 16*mm, 17*mm, 18*mm], font_small=True))
    elif prioridades_h:
        story.append(Paragraph('Habilidades prioritárias', H2))
        story.append(metric_table(prioridades_h, 'Habilidade', 12))
    if prioridades_c:
        story.append(Paragraph('Conteúdos prioritários sustentados por múltiplos itens', H2))
        story.append(metric_table(prioridades_c, 'Conteúdo', 12))
    if not prioridades_eixo and not prioridades_h_enem and not prioridades_h and not prioridades_c:
        story.append(callout('Sem agrupamento curricular suficiente', 'Os conteúdos podem estar descritos questão a questão, mas ainda não há repetição suficiente do mesmo alvo para afirmar dificuldade curricular consolidada.', 'info'))

    areas = list(dashboard.get('porArea') or [])
    if areas:
        areas.sort(key=lambda x: num(x.get('percentualPontuacao')))
        story.append(Paragraph('Áreas do conhecimento', H2))
        story.append(metric_table(areas, 'Área', 20))

    strengths = list(dashboard.get('pontosFortesHabilidadeEnem') or []) + list(dashboard.get('pontosFortesHabilidade') or []) + list(dashboard.get('pontosFortesEixo') or [])
    if strengths:
        strengths.sort(key=lambda x: num(x.get('percentualPontuacao')), reverse=True)
        story.append(Paragraph('Pontos com evidência consolidada', H2))
        story.append(metric_table(strengths, 'Ponto consolidado', 10))

    if txt(sim.get('tipo')).lower() == 'enem' or dashboard.get('coberturaEnem'):
        story.append(CondPageBreak(70 * mm))
        story += section('4. Diagnóstico das competências e habilidades da Matriz ENEM', 'O mapeamento é explícito por questão. O Axoriin não deduz uma habilidade oficial apenas pelo conteúdo do item.')
        cobertura_enem = dashboard.get('coberturaEnem') or {}
        fonte_enem = cobertura_enem.get('fonte') or {}
        total_var = inteiro(cobertura_enem.get('variantesElegiveis'))
        map_var = inteiro(cobertura_enem.get('variantesMapeadas'))
        map_diretas = inteiro(cobertura_enem.get('variantesMapeadasDiretas'))
        map_aprox = inteiro(cobertura_enem.get('variantesMapeadasAproximadas'))
        detalhe_confianca = f" São {map_diretas} vínculo(s) direto(s) e {map_aprox} aproximação(ões) pedagógica(s) identificada(s)." if map_var else ''
        story.append(callout(
            'Referência oficial e rastreabilidade',
            f"Fonte: {txt(fonte_enem.get('titulo'), 'Matrizes de Referência ENEM')} — {txt(fonte_enem.get('orgao'), 'INEP/MEC')}, {txt(fonte_enem.get('ano'), '2026')}. Mapeamento atual: {map_var} de {total_var} variante(s) pedagógica(s).{detalhe_confianca} Quando HABILIDADE_ENEM não está preenchida ou não é válida para a área, o item permanece visível como não mapeado e não entra no diagnóstico oficial de habilidade.",
            'info' if map_var == total_var and total_var else 'warn',
        ))

        areas_enem = cobertura_enem.get('areas') or []
        if areas_enem:
            story.append(Paragraph('Cobertura das habilidades trabalhadas no simulado', H2))
            data = [['Área', 'Hab. trabalhadas', 'Total matriz', '% da matriz', 'Competências', 'Questões mapeadas']]
            for x in areas_enem:
                data.append([
                    txt(x.get('areaNome')), inteiro(x.get('habilidadesTrabalhadas')), inteiro(x.get('totalHabilidadesMatriz')),
                    pct(x.get('percentualHabilidadesMatriz')), inteiro(x.get('competenciasTrabalhadas')), inteiro(x.get('questoesMapeadas')),
                ])
            story.append(table(data, [58*mm, 25*mm, 22*mm, 22*mm, 25*mm, 28*mm]))

        competencias_enem = dashboard.get('porCompetenciaEnem') or []
        if competencias_enem:
            story.append(Paragraph('Diagnóstico por competência de área', H2))
            data = [['Área', 'Comp.', 'Competência', 'Desemp.', 'Cob.', 'Hab.', 'Questões', 'Leitura']]
            for x in competencias_enem:
                leitura_comp = nivel_label(x.get('nivel')) if x.get('evidenciaSuficiente') else ('Indicativa — 1 item' if txt(x.get('leituraEvidencia')) == 'indicativa_um_item' else 'Evidência insuficiente')
                data.append([
                    txt(x.get('areaNome')), txt(x.get('codigo')), txt(x.get('descricao')), pct(x.get('percentualPontuacao')),
                    pct(x.get('coberturaPercentual')), inteiro(x.get('habilidades')), inteiro(x.get('questoes')), leitura_comp,
                ])
            story.append(table(data, [30*mm, 11*mm, 70*mm, 15*mm, 14*mm, 10*mm, 12*mm, 28*mm], font_small=True))

        habilidades_enem = dashboard.get('porHabilidadeEnem') or []
        sustentadas = [x for x in habilidades_enem if x.get('evidenciaSuficiente')]
        sustentadas.sort(key=lambda x: (num(x.get('percentualPontuacao')), txt(x.get('areaNome')), txt(x.get('codigo'))))
        if sustentadas:
            story.append(Paragraph('Habilidades ENEM com diagnóstico sustentado', H2))
            story.append(p('A classificação abaixo exige múltiplas questões e número mínimo de estudantes. Por isso, ela pode orientar retomada curricular com mais segurança do que o resultado de um único item. Vínculos aproximados permanecem identificados no mapeamento e não são apresentados como correspondência direta.', SMALL))
            data = [['Área', 'Comp.', 'Hab.', 'Descrição da habilidade', 'Desemp.', 'Acerto marcado', 'Cob.', 'Questões', 'Estudantes', 'Leitura']]
            backgrounds = {}
            for idx, x in enumerate(sustentadas, 1):
                data.append([
                    txt(x.get('areaNome')), txt(x.get('competenciaCodigo')), txt(x.get('codigo')), txt(x.get('descricao')),
                    pct(x.get('percentualPontuacao')), pct(x.get('percentualAcerto')), pct(x.get('coberturaPercentual')),
                    inteiro(x.get('questoes')), inteiro(x.get('estudantesComEvidencia')), nivel_label(x.get('nivel')),
                ])
                backgrounds[idx] = nivel_bg(x.get('nivel'))
            story.append(table(data, [28*mm, 11*mm, 10*mm, 63*mm, 14*mm, 16*mm, 13*mm, 11*mm, 14*mm, 25*mm], font_small=True, row_backgrounds=backgrounds))
        else:
            story.append(callout('Ainda sem habilidade ENEM com evidência suficiente', 'Mapear uma questão para H1-H30 não basta para concluir domínio ou fragilidade da habilidade. Com os critérios atuais, são necessários múltiplos itens e número mínimo de estudantes.', 'info'))

        indicativas = [x for x in habilidades_enem if txt(x.get('leituraEvidencia')) == 'indicativa_um_item']
        if indicativas:
            story.append(Paragraph('Habilidades observadas em apenas um item — leitura indicativa', H2))
            data = [['Área', 'Comp.', 'Hab.', 'Descrição', 'Desemp. no item', 'Estudantes', 'Leitura']]
            for x in indicativas:
                data.append([
                    txt(x.get('areaNome')), txt(x.get('competenciaCodigo')), txt(x.get('codigo')), txt(x.get('descricao')),
                    pct(x.get('percentualPontuacao')), inteiro(x.get('estudantesComEvidencia')), 'Indicativa; não concluir domínio da habilidade',
                ])
            story.append(table(data, [30*mm, 12*mm, 10*mm, 70*mm, 20*mm, 15*mm, 43*mm], font_small=True))

        nao_mapeadas = cobertura_enem.get('naoMapeadas') or []
        if nao_mapeadas:
            story.append(Paragraph('Itens ainda sem HABILIDADE_ENEM', H2))
            data = [['Questão', 'Variante', 'Área', 'Componente / conteúdo']]
            for x in nao_mapeadas[:40]:
                alvo = ' — '.join(v for v in [txt(x.get('componente')), txt(x.get('conteudo'))] if v) or '-'
                data.append([txt(x.get('codigoQuestao')), txt(x.get('variante')), txt(x.get('area')), alvo])
            if len(nao_mapeadas) > 40:
                data.append([f'+{len(nao_mapeadas)-40} item(ns)', '', '', 'Consulte o XLSX / planilha de mapeamento para completar a lista.'])
            story.append(table(data, [22*mm, 20*mm, 38*mm, 100*mm], font_small=True))

    story += section('5. Questões que merecem revisão pedagógica', 'A faixa do item descreve apenas o desempenho naquela questão. Ela não chama uma habilidade de “consolidada” com base em um único item.')
    qprio = dashboard.get('questoesPrioritarias') or []
    if qprio:
        data = [['Questão', 'Área / conteúdo', 'Faixa do item', 'Desemp.', 'Obs.', 'Distrator', '% erros no distrator', 'Discriminação', 'Cobertura']]
        for x in qprio[:25]:
            alvo = txt(x.get('conteudo')) or txt(x.get('eixoPedagogico')) or txt(x.get('area')) or '-'
            data.append([
                f"{txt(x.get('codigoQuestao'))} ({txt(x.get('variante'), '-')})",
                alvo,
                faixa_item_label(x.get('leituraQuestao')),
                pct(x.get('percentualPontuacao')),
                inteiro(x.get('observadas')),
                txt(x.get('distratorDominante'), '-'),
                pct(x.get('concentracaoDistrator')) if txt(x.get('distratorDominante')) else '-',
                discriminacao_label(x),
                pct(x.get('coberturaPercentual')),
            ])
        story.append(table(data, [21 * mm, 38 * mm, 18 * mm, 15 * mm, 9 * mm, 12 * mm, 18 * mm, 25 * mm, 14 * mm], font_small=True))

        revisao = dashboard.get('questoesRevisao') or []
        negativas = [x for x in revisao if (x.get('discriminacao') or {}).get('disponivel') and num((x.get('discriminacao') or {}).get('indice')) < 0]
        if negativas:
            story += [Spacer(1, 2 * mm), callout(
                'Sinal técnico de revisão de item',
                f"{len(negativas)} questão(ões) apresentou(aram) discriminação simples negativa entre grupos de maior e menor desempenho. Isso não prova erro de gabarito; sinaliza necessidade de conferir item, chave, enunciado e aderência ao que foi ensinado.",
                'warn',
            )]
        concentradas = [x for x in qprio if txt(x.get('distratorDominante')) and num(x.get('concentracaoDistrator')) >= 60]
        if concentradas:
            story += [Spacer(1, 2 * mm), callout(
                'Distratores com erro concentrado',
                f"{len(concentradas)} questão(ões) prioritária(s) têm ao menos 60% dos erros concentrados em um mesmo distrator. O padrão pode orientar a investigação de concepção alternativa, leitura do enunciado ou pré-requisito.",
                'info',
            )]
    else:
        story.append(callout('Sem questão acadêmica prioritária com evidência suficiente', 'Ocorrências de língua não marcada não entram nesta lista; elas permanecem nos alertas procedimentais.', 'ok'))

    story += section('6. Plano de intervenção em quatro níveis', 'Quando a dificuldade é ampla, a resposta começa coletivamente. Necessidades numerosas abaixo do limiar coletivo viram intervenção ampla por turma; pequenos grupos vêm depois e a intervenção individual fica reservada aos casos críticos com cobertura suficiente.')
    plano = dashboard.get('planoIntervencao') or {}
    turma_plano = plano.get('turma') or {}
    turma_areas = turma_plano.get('areas') or []
    turma_eixos = turma_plano.get('eixos') or []
    turma_habilidades_enem = turma_plano.get('habilidadesEnem') or []
    if turma_areas or turma_eixos or turma_habilidades_enem:
        story.append(Paragraph('Nível 1 - Turma / planejamento coletivo', H2))
        data = [['Alvo coletivo', 'Desempenho', 'Base']]
        for x in turma_areas[:4]:
            data.append([f"Área: {txt(x.get('rotulo'))}", pct(x.get('percentualPontuacao')), f"{inteiro(x.get('evidencias'))} evidências"])
        for x in turma_habilidades_enem[:6]:
            sigla = {'LINGUAGENS':'LC', 'MATEMATICA':'MAT', 'NATUREZA':'CN', 'HUMANAS':'CH'}.get(txt(x.get('areaCodigo')).upper(), txt(x.get('areaCodigo')))
            data.append([f"ENEM {sigla}-{txt(x.get('habilidadeCodigo'))}: {txt(x.get('habilidadeDescricao'))}", pct(x.get('percentualPontuacao')), f"{inteiro(x.get('questoes'))} questões · {inteiro(x.get('estudantes'))} estudantes"])
        for x in turma_eixos[:5]:
            data.append([f"Eixo: {txt(x.get('rotulo'))}", pct(x.get('percentualPontuacao')), f"{inteiro(x.get('questoes'))} questões · {inteiro(x.get('estudantes'))} estudantes"])
        story.append(table(data, [88 * mm, 30 * mm, 62 * mm]))

    broad_groups = dashboard.get('intervencoesAmplas') or []
    if broad_groups:
        story.append(Paragraph('Nível 2 - Intervenções amplas organizadas por turma', H2))
        story.append(p('Esses alvos atingem mais de 15 estudantes, mas não alcançam o limiar coletivo de 60% do recorte. Não devem ser tratados como um único pequeno grupo.', SMALL))
        data = [['Alvo comum', 'Qtd.', '% recorte', 'Orientação']]
        for g in broad_groups[:15]:
            data.append([
                txt(g.get('rotulo')), len(g.get('alunos') or []), pct(g.get('percentualParticipantes')),
                'Organizar a retomada por turma e subdividir apenas se necessário.',
            ])
        story.append(table(data, [75 * mm, 14 * mm, 20 * mm, 71 * mm], font_small=True))

    groups = dashboard.get('gruposIntervencao') or []
    if groups:
        story.append(Paragraph('Nível 3 - Pequenos grupos com dificuldade comum', H2))
        data = [['Alvo comum', 'Tipo', 'Qtd.', 'Estudantes']]
        for g in groups[:15]:
            students = g.get('alunos') or []
            nomes = '; '.join(f"{txt(s.get('nome'))} ({txt(s.get('turma'))})" for s in students[:12])
            if len(students) > 12:
                nomes += f"; +{len(students) - 12} outro(s)"
            data.append([txt(g.get('rotulo')), txt(g.get('tipoAlvo'), '-'), len(students), nomes])
        story.append(table(data, [48 * mm, 22 * mm, 12 * mm, 98 * mm], font_small=True))

    students = dashboard.get('alunosIntervencaoIndividual') or []
    if students:
        story.append(Paragraph('Nível 4 - Casos críticos para análise individual', H2))
        story.append(p('A presença nesta lista não encerra o diagnóstico. O caso deve ser confrontado com avaliações formativas, produções de sala e observação docente.', SMALL))
        data = [['Aluno', 'Turma', 'Desempenho', 'Cobertura', 'Até 3 alvos sustentados']]
        for s in students[:100]:
            data.append([
                txt(s.get('nome')),
                txt(s.get('turma')),
                pct(s.get('percentualPontuacao')),
                pct(s.get('coberturaPercentual')),
                student_priority_text(s),
            ])
        story.append(table(data, [46 * mm, 22 * mm, 22 * mm, 20 * mm, 70 * mm], font_small=True))
    else:
        story.append(callout('Sem caso crítico conclusivo para intervenção individual', 'Isso não significa ausência de dificuldades; indica que a resposta prioritária deve permanecer coletiva, em intervenção ampla por turma ou em pequenos grupos com os critérios atuais.', 'info'))

    partial_participation = dashboard.get('alunosParticipacaoParcial') or []
    if partial_participation:
        story.append(Paragraph('Estudantes com participação parcial confirmada', H2))
        story.append(p('A cobertura pode aparecer como 100% sobre o que foi efetivamente realizado. Isso não significa participação completa. Esses estudantes ficam fora da classificação global comparável; as áreas e habilidades dos dias realizados continuam válidas e devem ser interpretadas normalmente.', SMALL))
        data = [['Aluno', 'Turma', 'Dias ausentes', 'Cobertura aplicável', 'Leitura']]
        for s in partial_participation[:100]:
            dias = ', '.join(f"{inteiro(d)}º dia" for d in (s.get('diasAusentes') or []))
            data.append([
                txt(s.get('nome')), txt(s.get('turma')), dias or '-',
                pct(s.get('coberturaPercentual')),
                'Analisar somente áreas e habilidades efetivamente realizadas.',
            ])
        story.append(table(data, [48 * mm, 24 * mm, 28 * mm, 28 * mm, 52 * mm], font_small=True))

    low_cov = dashboard.get('alunosBaixaCobertura') or []
    if low_cov:
        story.append(Paragraph('Estudantes com base realmente incompleta', H2))
        data = [['Aluno', 'Turma', 'Cobertura', 'Desempenho', 'Leitura']]
        for s in low_cov[:50]:
            leitura_cov = 'Cobertura parcial; conferir antes de concluir o diagnóstico individual.'
            if s.get('idiomaPendente'):
                leitura_cov = 'Língua pendente; conferir antes de concluir o diagnóstico.'
            data.append([txt(s.get('nome')), txt(s.get('turma')), pct(s.get('coberturaPercentual')), pct(s.get('percentualPontuacao')), leitura_cov])
        story.append(table(data, [46 * mm, 22 * mm, 20 * mm, 22 * mm, 70 * mm], font_small=True))

    highlights = dashboard.get('alunosDestaque') or []
    if highlights:
        story.append(Paragraph('Maiores desempenhos com base individual adequada', H2))
        story.append(p('A lista é relativa ao grupo analisado e não equivale a nota TRI nem garante domínio de todas as habilidades.', SMALL))
        data = [['Aluno', 'Turma', 'Desempenho', 'Acerto marcado', 'Cobertura']]
        for s in highlights[:20]:
            data.append([txt(s.get('nome')), txt(s.get('turma')), pct(s.get('percentualPontuacao')), pct(s.get('percentualAcerto')), pct(s.get('coberturaPercentual'))])
        story.append(table(data, [66 * mm, 28 * mm, 28 * mm, 28 * mm, 28 * mm]))

    if comparacao and inteiro(comparacao.get('alunosComparados')):
        story += section('7. Evolução em relação ao simulado de referência', 'A comparação usa apenas estudantes presentes nos dois recortes.')
        story.append(metric_cards([
            ('Alunos comparados', str(inteiro(comparacao.get('alunosComparados'))), 'presentes nas duas aplicações'),
            ('Variação média', (('+' if num(comparacao.get('mediaVariacao')) > 0 else '') + pct(comparacao.get('mediaVariacao'))), 'pontos percentuais'),
            ('Melhoraram', str(inteiro(comparacao.get('melhoraram'))), f"{inteiro(comparacao.get('reduziram'))} reduziram"),
        ], columns=3))
        data = [['Aluno', 'Turma', 'Anterior', 'Atual', 'Variação']]
        for s in (comparacao.get('alunos') or [])[:100]:
            delta = num(s.get('variacao'))
            data.append([txt(s.get('nome')), txt(s.get('turma')), pct(s.get('anterior')), pct(s.get('atual')), (('+' if delta > 0 else '') + pct(delta))])
        story.append(table(data, [70 * mm, 30 * mm, 27 * mm, 27 * mm, 27 * mm]))

    story += [
        NextPageTemplate('Paisagem'),
        PageBreak(),
        Paragraph('ANEXOS TÉCNICOS', KICKER),
        Paragraph('Detalhamento para conferência e planejamento', TITLE),
        p('Os anexos preservam a rastreabilidade. Questões procedimentais permanecem visíveis, mas são identificadas como não pedagógicas.', SUBTITLE),
    ]

    all_questions = dashboard.get('questoes') or []
    story.append(Paragraph('A. Todas as questões analisadas', H1))
    if all_questions:
        data = [['Questão', 'Dia', 'Var.', 'Natureza', 'Área', 'Componente', 'H ENEM', 'Conf. ENEM', 'Comp. ENEM', 'Eixo', 'Conteúdo', 'Desemp.', 'Faixa item', 'Cob.', 'Ac.', 'Er.', 'Br.', 'N/imp.', 'Sem língua', 'Distrator', 'Conc.', 'Discrim.']]
        backgrounds = {}
        for idx, x in enumerate(all_questions, 1):
            natureza = 'Procedimental' if txt(x.get('naturezaEvidencia')).lower() == 'procedimental' else 'Pedagógica'
            data.append([
                txt(x.get('codigoQuestao')), inteiro(x.get('dia')), txt(x.get('variante'), '-'), natureza,
                txt(x.get('area'), '-'), txt(x.get('componente'), '-'), txt(x.get('habilidadeEnemCodigo'), '-'), ('Aprox.' if txt(x.get('habilidadeEnemConfianca')).lower() == 'aproximada' else ('Direta' if txt(x.get('habilidadeEnemCodigo')) else '-')), txt(x.get('competenciaEnemCodigo'), '-'), txt(x.get('eixoPedagogico'), '-'), txt(x.get('conteudo'), '-'),
                pct(x.get('percentualPontuacao')), ('Procedimental' if natureza == 'Procedimental' else faixa_item_label(x.get('leituraQuestao'))), pct(x.get('coberturaPercentual')),
                inteiro(x.get('acertos')), inteiro(x.get('erros')), inteiro(x.get('brancos')), inteiro(x.get('naoInformadas')), inteiro(x.get('semOpcaoIdioma')),
                txt(x.get('distratorDominante'), '-'), pct(x.get('concentracaoDistrator')) if txt(x.get('distratorDominante')) else '-', discriminacao_label(x) if natureza == 'Pedagógica' else '-',
            ])
            if natureza == 'Procedimental':
                backgrounds[idx] = BLUE
            elif txt(x.get('leituraQuestao')) in ('muito_baixo', 'baixo'):
                backgrounds[idx] = RED
            elif txt(x.get('leituraQuestao')) == 'intermediario':
                backgrounds[idx] = AMBER
            elif txt(x.get('leituraQuestao')) in ('alto', 'muito_alto'):
                backgrounds[idx] = MINT
        story.append(table(data, [14*mm, 6*mm, 8*mm, 14*mm, 18*mm, 16*mm, 10*mm, 10*mm, 12*mm, 18*mm, 23*mm, 11*mm, 15*mm, 10*mm, 6*mm, 6*mm, 6*mm, 8*mm, 8*mm, 9*mm, 9*mm, 20*mm], font_small=True, row_backgrounds=backgrounds))
    else:
        story.append(p('Sem questões no recorte.'))

    story += [PageBreak(), Paragraph('B. Todos os estudantes do recorte', H1)]
    if results:
        ordered = sorted(results, key=lambda x: (txt(x.get('alunoTurmaSnapshot')), txt(x.get('alunoNomeSnapshot'))))
        data = [['Aluno', 'Turma', 'Língua', 'Ac.', 'Marc.', 'Br.', 'N/imp.', 'Sem língua', 'Desemp.', 'Acerto marcado', 'Cob.', 'Prioridades pedagógicas', 'Avisos procedimentais']]
        for x in ordered:
            r = x.get('resumoGeral') or {}
            data.append([
                txt(x.get('alunoNomeSnapshot')), txt(x.get('alunoTurmaSnapshot')), linguagem(x.get('idiomaEstrangeiroEfetivo') or x.get('idiomaEstrangeiro')),
                inteiro(r.get('acertos')), inteiro(r.get('respondidas')), inteiro(r.get('brancos')), inteiro(r.get('naoInformadas')), inteiro(r.get('semOpcaoIdioma')),
                pct(r.get('percentualPontuacao')), pct(r.get('percentualAcerto')), pct(r.get('coberturaPercentual')),
                result_priority_text(x), '; '.join(normalize_display(v) for v in (x.get('avisos') or [])[:4]) or '-',
            ])
        story.append(table(data, [32*mm, 18*mm, 19*mm, 7*mm, 8*mm, 7*mm, 9*mm, 10*mm, 14*mm, 15*mm, 13*mm, 48*mm, 51*mm], font_small=True))
    else:
        story.append(p('Sem estudantes no recorte.'))

    story += [PageBreak(), Paragraph('C. Metodologia e limites de interpretação', H1)]
    indicadores = metodologia.get('indicadores') or []
    if indicadores:
        data = [['Indicador', 'Fórmula', 'Uso no diagnóstico']]
        for x in indicadores:
            data.append([txt(x.get('nome')), txt(x.get('formula')), txt(x.get('uso'))])
        story.append(table(data, [52*mm, 119*mm, 88*mm]))
    faixas = metodologia.get('faixas') or []
    if faixas:
        story.append(Paragraph('Faixas operacionais dos estudantes', H2))
        data = [['Faixa', 'Regra']]
        for x in faixas:
            data.append([nivel_label(x.get('nivel')), txt(x.get('regra'))])
        story.append(table(data, [55*mm, 204*mm]))

    for titulo, chave in [
        ('Classificação de questões individuais', 'classificacaoItens'),
        ('Triagem simples de discriminação dos itens', 'discriminacaoItens'),
        ('Separação entre procedimento e aprendizagem', 'separacaoProcedimental'),
        ('Hierarquia de intervenção', 'hierarquiaIntervencao'),
        ('Matriz de Referência ENEM', 'matrizEnem'),
        ('Evidência para habilidade ENEM', 'evidenciaHabilidadeEnem'),
    ]:
        if txt(metodologia.get(chave)):
            story += [Spacer(1, 2*mm), callout(titulo, txt(metodologia.get(chave)), 'info')]

    story += [Spacer(1, 2*mm), callout(
        'Limite metodológico importante',
        txt(metodologia.get('observacao'), 'Os percentuais são acertos brutos para diagnóstico pedagógico e não correspondem à TRI oficial do ENEM.'),
        'warn',
    )]
    story.append(Spacer(1, 3*mm))
    story.append(p('Recomendação de uso: combine este diagnóstico com evidências de sala de aula, avaliações formativas e análise docente antes de tomar decisões de alto impacto sobre estudantes ou turmas.', SMALL))
    return story

def main() -> int:
    if len(sys.argv) != 3:
        print('Uso: gerar_relatorio_diagnostico.py entrada.json saida.pdf', file=sys.stderr)
        return 2
    entrada, saida = sys.argv[1], sys.argv[2]
    with open(entrada, 'r', encoding='utf-8') as f:
        payload = json.load(f)
    sim = payload.get('simulado') or {}
    filtro = payload.get('filtro') or {}
    meta = {
        'titulo': txt(sim.get('titulo'), 'Simulado'),
        'turma': txt(filtro.get('turma'), 'Todas permitidas'),
    }
    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
    doc = RelatorioDoc(saida, meta)
    modo = txt(payload.get('modoRelatorio'), 'geral').lower()
    story = build_story_visual(payload) if modo == 'visual' else (build_story_habilidades_enem(payload) if modo == 'habilidades_enem' else build_story(payload))
    doc.build(story)
    if not os.path.isfile(saida) or os.path.getsize(saida) < 1500:
        raise RuntimeError('O PDF foi gerado com tamanho inválido.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f'Falha ao gerar relatório PDF: {exc}', file=sys.stderr)
        raise
