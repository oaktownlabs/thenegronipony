import { PageIntro } from '@/components/PageIntro';
import { PlaceholderCard } from '@/components/PlaceholderCard';
import { pageContent, safetyNotes } from '@/lib/site-content';

export default function Calibration() {
  return (
    <main>
      <PageIntro
        description="Future home for pump calibration plans, CSV data, charted repeatability, recipe volumes, and fluid-path notes."
        eyebrow="Calibration"
        title="Lab-grade notes for a cocktail nose."
      />
      <section className="py-14">
        <div className="content-shell grid gap-4 md:grid-cols-3">
          {pageContent.calibration.map((card) => (
            <PlaceholderCard card={card} key={card.title} />
          ))}
        </div>
      </section>
      <section className="border-t py-14">
        <div className="content-shell max-w-4xl">
          <p className="text-sm uppercase tracking-[0.22em] text-gold">Guardrails</p>
          <h2 className="mt-4 font-serif text-4xl">Calibration waits for measured facts</h2>
          <ul className="mt-8 grid gap-4">
            {safetyNotes.map((note) => (
              <li className="rounded-lg border bg-panel p-5 text-muted-foreground" key={note}>
                {note}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
