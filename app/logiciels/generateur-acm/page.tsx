import { ImportWorkspace } from "@/app/lib/tools/acm/features/property-import/components/import-workspace";

export default function Home() {
  return (
    <div className="acm-tool-content">
      <main>
        <section className="hero" aria-labelledby="page-title">
          <div className="hero__eyebrow">
            <span className="hero__eyebrow-line" />
            Espace courtier
          </div>
          <div className="hero__content">
            <div>
              <h1 id="page-title">Analyse comparative de marché</h1>
            </div>
            <p>
              Rassemblez vos fiches Centris et feuillets JLR dans un espace structuré, puis
              préparez une analyse claire et cohérente pour vos clients.
            </p>
          </div>
        </section>

        <ImportWorkspace />
      </main>


    </div>
  );
}
