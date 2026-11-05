from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

ROOT = Path(__file__).parent / "centris"
ROOT.mkdir(parents=True, exist_ok=True)


def create_pdf(name: str, pages: list[list[str]]) -> None:
    document = canvas.Canvas(str(ROOT / name), pagesize=letter, pageCompression=0)
    for lines in pages:
        y = 750
        for line in lines:
            document.drawString(54, y, line)
            y -= 20
        document.showPage()
    document.save()


create_pdf(
    "fiche-complete.pdf",
    [[
        "FICHE CENTRIS",
        "Adresse : 1250 rue Ontario, Montreal (Quebec)",
        "Type d'immeuble : Triplex",
        "Nombre de logements : 3",
        "Prix demande : 725 000 $",
        "Revenus actuels : 58 800 $",
        "Revenus potentiels : 64 800 $",
        "Logement 1 : 4 1/2 rez-de-chaussee | Loyer actuel : 1 650 $ | Loyer potentiel : 1 800 $",
        "Logement 2 : 4 1/2 deuxieme etage | Loyer actuel : 1 600 $ | Loyer potentiel : 1 750 $",
        "Logement 3 : 3 1/2 troisieme etage | Loyer actuel : 1 550 $ | Loyer potentiel : 1 650 $",
    ], [
        "DEPENSES",
        "Taxes municipales : 5 400 $",
        "Taxes scolaires : 620 $",
        "Assurance : 2 650 $",
        "Deneigement : 950 $",
        "Electricite : 800 $",
    ]],
)

create_pdf(
    "fiche-partielle.pdf",
    [[
        "SOMMAIRE CENTRIS",
        "Adresse de la propriete : 88 avenue du Parc, Quebec (Quebec)",
        "Genre de propriete : Duplex",
        "Nb. de logements : 2",
        "Prix de vente : 515 000 $",
        "Taxes municipales : 3 900 $",
        "Taxes scolaires : 410 $",
        "Logement 1 : 5 1/2 principal | Loyer actuel : 1 450 $",
        "Logement 2 : 3 1/2 sous-sol | Loyer actuel : 1 050 $",
    ]],
)

create_pdf(
    "fiche-totaux-seulement.pdf",
    [[
        "FICHE DE REVENUS",
        "Adresse : 44 rue Principale, Sherbrooke (Quebec)",
        "Type de propriete : Multiplex",
        "Logements : 6",
        "Prix demande : 1 150 000 $",
        "Revenu brut actuel : 92 000 $",
        "Revenu brut potentiel : 105 000 $",
        "Taxes municipales : 9 800 $",
    ]],
)
