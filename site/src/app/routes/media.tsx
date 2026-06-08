import { PageIntro } from '@/components/PageIntro';
import { PlaceholderCard } from '@/components/PlaceholderCard';
import { pageContent } from '@/lib/site-content';

export default function Media() {
  return (
    <main>
      <PageIntro
        description="The launch should feel like discovering someone quietly built an absurdly complete artifact. This page will hold the proof."
        eyebrow="Media"
        title="Photos, clips, captions, and the first pour."
      />
      <section className="py-14">
        <div className="content-shell grid gap-4 md:grid-cols-3">
          {pageContent.media.map((card) => (
            <PlaceholderCard card={card} key={card.title} />
          ))}
        </div>
      </section>
    </main>
  );
}
