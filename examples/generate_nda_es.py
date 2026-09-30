#!/usr/bin/env python3
"""Genera el acuerdo de confidencialidad en español, en DOCX, con las variables
que la plantilla de HubSpot puede llenar sola.

Uso:  python3 examples/generate_nda_es.py [ruta-de-salida.docx]
"""

import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from lxml import etree

AZUL = RGBColor(0x00, 0x7B, 0xFF)
TINTA = RGBColor(0x1A, 0x1A, 0x2E)
GRIS = RGBColor(0x55, 0x55, 0x55)

SALIDA = sys.argv[1] if len(sys.argv) > 1 else "examples/NDA_Plantilla_AllSign_ES.docx"


def sombrear(celda, color):
    tc_pr = celda._tc.get_or_add_tcPr()
    shd = etree.SubElement(tc_pr, qn("w:shd"))
    shd.set(qn("w:fill"), color)
    shd.set(qn("w:val"), "clear")


def construir():
    doc = Document()

    for seccion in doc.sections:
        seccion.top_margin = Cm(2.5)
        seccion.bottom_margin = Cm(2.5)
        seccion.left_margin = Cm(2.5)
        seccion.right_margin = Cm(2.5)

    normal = doc.styles["Normal"].font
    normal.name = "Calibri"
    normal.size = Pt(11)
    normal.color.rgb = RGBColor(0x33, 0x33, 0x33)

    titulo = doc.add_paragraph()
    titulo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    titulo.space_after = Pt(4)
    run = titulo.add_run("ACUERDO DE CONFIDENCIALIDAD")
    run.bold = True
    run.font.size = Pt(22)
    run.font.color.rgb = TINTA

    bajada = doc.add_paragraph()
    bajada.alignment = WD_ALIGN_PARAGRAPH.CENTER
    bajada.space_after = Pt(14)
    run = bajada.add_run("Entre las partes que se identifican a continuación")
    run.italic = True
    run.font.size = Pt(12)
    run.font.color.rgb = GRIS

    datos = doc.add_table(rows=4, cols=2)
    datos.style = "Table Grid"
    filas = [
        ("Fecha de celebración", "{{ fecha_efectiva }}"),
        ("Parte que revela", "{{ empresa_emisora }}"),
        ("Parte que recibe", "{{ nombre_cliente }}"),
        ("Empresa que representa", "{{ empresa_cliente }}"),
    ]
    for i, (etiqueta, valor) in enumerate(filas):
        celda = datos.cell(i, 0)
        sombrear(celda, "F4F6F8")
        run = celda.paragraphs[0].add_run(etiqueta)
        run.bold = True
        run.font.size = Pt(10)
        run.font.color.rgb = GRIS

        run = datos.cell(i, 1).paragraphs[0].add_run(valor)
        run.bold = True
        run.font.size = Pt(11)
        run.font.color.rgb = AZUL

    doc.add_paragraph()

    def encabezado(numero, texto):
        p = doc.add_paragraph()
        p.space_before = Pt(16)
        p.space_after = Pt(6)
        run = p.add_run(f"{numero}. {texto}")
        run.bold = True
        run.font.size = Pt(13)
        run.font.color.rgb = TINTA

    def cuerpo(texto):
        p = doc.add_paragraph(texto)
        p.paragraph_format.line_spacing = Pt(16)
        p.space_after = Pt(8)

    def vinetas(items):
        for item in items:
            p = doc.add_paragraph(item, style="List Bullet")
            p.paragraph_format.line_spacing = Pt(15)

    encabezado(1, "OBJETO")
    cuerpo(
        "Este acuerdo se celebra el {{ fecha_efectiva }} entre {{ empresa_emisora }}, "
        "en adelante la Parte que Revela, y {{ nombre_cliente }}, en representación de "
        "{{ empresa_cliente }}, en adelante la Parte que Recibe. Ambas se denominan "
        "conjuntamente las Partes."
    )
    cuerpo(
        "Su objeto es proteger la información confidencial que las Partes se compartan "
        "con motivo de {{ objeto }}."
    )

    encabezado(2, "QUÉ SE CONSIDERA INFORMACIÓN CONFIDENCIAL")
    cuerpo(
        "Toda información, verbal o escrita, que una Parte comparta con la otra y que "
        "esté marcada como confidencial, o que por su naturaleza y por las circunstancias "
        "en que se comparte deba entenderse como tal. Queda comprendida, de manera "
        "enunciativa y no limitativa:"
    )
    vinetas([
        "Planes de negocio, estrategias e información financiera",
        "Datos técnicos, secretos industriales y conocimiento especializado",
        "Planes de producto, diseños y especificaciones",
        "Listas de clientes, estrategias de mercadotecnia e información de ventas",
        "Programas de cómputo, código fuente, algoritmos y bases de datos",
        "Datos personales a los que se tenga acceso con motivo de este acuerdo",
    ])

    encabezado(3, "OBLIGACIONES DE LA PARTE QUE RECIBE")
    cuerpo("La Parte que Recibe se obliga a:")
    vinetas([
        "Guardar la información confidencial con estricta reserva",
        "No revelarla a terceros sin autorización previa y por escrito",
        "Usarla únicamente para el fin descrito en la cláusula primera",
        "Protegerla con el mismo cuidado con que protege la propia, y nunca con menos "
        "del que resulta razonable",
        "Avisar a la otra Parte en cuanto tenga conocimiento de cualquier divulgación o "
        "uso no autorizado",
        "Limitar el acceso a las personas que necesiten conocerla y que estén sujetas a "
        "obligaciones de confidencialidad equivalentes",
    ])

    encabezado(4, "TRATAMIENTO DE DATOS PERSONALES")
    cuerpo(
        "Cuando la información confidencial incluya datos personales, la Parte que Recibe "
        "los tratará conforme a la Ley Federal de Protección de Datos Personales en Posesión "
        "de los Particulares, los usará solo para el fin de este acuerdo y los suprimirá o "
        "devolverá cuando deje de ser necesario conservarlos."
    )

    encabezado(5, "EXCEPCIONES")
    cuerpo("Este acuerdo no aplica a la información que:")
    vinetas([
        "Ya era del dominio público al momento de compartirse, o llegó a serlo después sin "
        "culpa de la Parte que Recibe",
        "La Parte que Recibe ya conocía legítimamente y sin obligación de reserva",
        "Un tercero le compartió sin violar ninguna obligación de confidencialidad",
        "Desarrolló por su cuenta sin usar la información confidencial",
        "Deba revelarse por mandato de autoridad competente, en cuyo caso avisará a la otra "
        "Parte con la anticipación que le sea posible",
    ])

    encabezado(6, "VIGENCIA")
    cuerpo(
        "Las obligaciones de confidencialidad estarán vigentes durante {{ vigencia }} "
        "contados a partir de la fecha de celebración, y subsistirán aunque la relación "
        "entre las Partes termine antes."
    )

    encabezado(7, "DEVOLUCIÓN DE LA INFORMACIÓN")
    cuerpo(
        "A la terminación de este acuerdo, o cuando la otra Parte lo solicite, la Parte que "
        "Recibe devolverá o destruirá la información confidencial que tenga en su poder, "
        "incluidas las copias, y lo confirmará por escrito."
    )

    encabezado(8, "INCUMPLIMIENTO")
    cuerpo(
        "El incumplimiento de estas obligaciones da derecho a la Parte afectada a exigir el "
        "pago de los daños y perjuicios que se le hayan causado, sin perjuicio de las demás "
        "acciones que le correspondan."
    )

    encabezado(9, "LEY APLICABLE Y JURISDICCIÓN")
    cuerpo(
        "Este acuerdo se rige por la legislación aplicable en {{ jurisdiccion }}. Para su "
        "interpretación y cumplimiento, las Partes se someten a los tribunales competentes "
        "de dicha jurisdicción y renuncian a cualquier otro fuero que pudiera corresponderles."
    )

    encabezado(10, "FIRMA ELECTRÓNICA")
    cuerpo(
        "Las Partes aceptan firmar este acuerdo por medios electrónicos y reconocen que la "
        "firma electrónica y su constancia de conservación, emitida conforme a la NOM-151, "
        "tienen la misma validez que la firma autógrafa."
    )

    doc.add_paragraph()
    p = doc.add_paragraph()
    p.space_before = Pt(18)
    p.space_after = Pt(10)
    run = p.add_run("FIRMAS")
    run.bold = True
    run.font.size = Pt(13)
    run.font.color.rgb = TINTA

    cuerpo(
        "Leído el contenido de este acuerdo y enteradas las Partes de su alcance y fuerza "
        "legal, lo firman de conformidad."
    )

    firmas = doc.add_table(rows=2, cols=2)
    firmas.autofit = True
    for columna, (quien, quien_detalle) in enumerate([
        ("{{ empresa_emisora }}", "Parte que revela"),
        ("{{ nombre_cliente }}", "Parte que recibe  ·  {{ correo_cliente }}"),
    ]):
        celda = firmas.cell(0, columna)
        celda.paragraphs[0].add_run("\n\n\n_______________________________")
        p = firmas.cell(1, columna).paragraphs[0]
        run = p.add_run(quien)
        run.bold = True
        run.font.size = Pt(10)
        p.add_run("\n")
        run = p.add_run(quien_detalle)
        run.font.size = Pt(9)
        run.font.color.rgb = GRIS

    doc.save(SALIDA)
    return SALIDA


if __name__ == "__main__":
    print(construir())
