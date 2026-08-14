import { PageIntro } from '@/components/PageIntro';
import { PlaceholderCard } from '@/components/PlaceholderCard';
import { githubLink, openSourceArtifacts } from '@/lib/site-content';

export default function OpenSource() {
  const GithubIcon = githubLink.icon;

  return (
    <main>
      <PageIntro
        description="A future index for repository files, CAD, firmware, BOM, calibration data, and safety-sensitive project docs."
        eyebrow="Open Source"
        title="Everything useful, reviewed before merge."
      />
      <section className="py-14">
        <div className="content-shell grid gap-4 md:grid-cols-2">
          {openSourceArtifacts.map((card) => (
            <PlaceholderCard card={card} key={card.title} />
          ))}
        </div>
      </section>
      <section className="border-t py-14">
        <div className="content-shell">
          <a
            className="inline-flex items-center gap-3 rounded-md border border-gold/40 px-5 py-3 text-gold transition hover:bg-gold/10"
            href={githubLink.href}
            rel="noreferrer"
            target="_blank"
          >
            <GithubIcon aria-hidden="true" className="size-5" />
            {githubLink.label}
          </a>
        </div>
      </section>
    </main>
  );
}
