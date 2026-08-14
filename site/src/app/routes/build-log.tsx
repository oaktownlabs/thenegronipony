import { PageIntro } from '@/components/PageIntro';
import { PlaceholderCard } from '@/components/PlaceholderCard';
import { milestonePlaceholders, pageContent } from '@/lib/site-content';

export default function BuildLog() {
  return (
    <main>
      <PageIntro
        description="A structured home for milestone updates, decision records, build notes, failures, and review links."
        eyebrow="Build Log"
        title="The serious paper trail for the unserious horse."
      />
      <section className="py-14">
        <div className="content-shell grid gap-4 md:grid-cols-3">
          {pageContent.buildLog.map((card) => (
            <PlaceholderCard card={card} key={card.title} />
          ))}
        </div>
      </section>
      <section className="border-t py-14">
        <div className="content-shell">
          <h2 className="font-serif text-4xl">Milestones</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {milestonePlaceholders.map((card) => (
              <PlaceholderCard card={card} key={card.title} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
