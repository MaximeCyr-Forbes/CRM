import { ImportWorkspace } from "@/app/lib/tools/acm/features/property-import/components/import-workspace";

export default function Home() {
  return (
    <div className="acm-tool-content">
      <main>
        <section className="hero" aria-labelledby="page-title">

          <div className="hero__content">
            <div>
              <h1 id="page-title">Analyse comparative de marché</h1>
            </div>

          </div>
        </section>

        <ImportWorkspace />
      </main>


    </div>
  );
}
