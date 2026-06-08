import type { PlaceholderCard as PlaceholderCardType } from '@/lib/site-content';

export function PlaceholderCard({ card }: { card: PlaceholderCardType }) {
  return (
    <article className="rounded-lg border bg-panel p-5 text-panel-foreground">
      <div className="mb-5 inline-flex rounded-sm border border-gold/30 px-2.5 py-1 text-xs uppercase tracking-[0.16em] text-gold">
        {card.status}
      </div>
      <h3 className="font-serif text-2xl">{card.title}</h3>
      <p className="mt-3 leading-7 text-muted-foreground">{card.description}</p>
    </article>
  );
}
