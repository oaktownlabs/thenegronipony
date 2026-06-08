import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { NavLink } from 'react-router';
import { PlaceholderCard } from '@/components/PlaceholderCard';
import {
  milestonePlaceholders,
  reviewChecklist,
  safetyNotes,
  siteSections,
} from '@/lib/site-content';

export default function Home() {
  return (
    <main>
      <section className="border-b">
        <div className="content-shell grid min-h-[calc(100vh-64px)] items-center gap-10 py-16 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.24em] text-gold">Oaktown Labs presents</p>
            <h1 className="mt-5 font-serif text-6xl leading-none md:text-8xl">The Negroni Pony</h1>
            <p className="mt-6 max-w-2xl text-xl leading-9 text-muted-foreground">
              An open-source cocktail art machine: a metallic gold horse sculpture that dispenses
              drinks through its nostril with professional documentation and deeply unserious
              intent.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <NavLink
                className="inline-flex items-center gap-2 rounded-md bg-gold px-5 py-3 font-medium text-background transition hover:bg-gold/90"
                to="/build-log"
              >
                Build log
                <ArrowRight aria-hidden="true" className="size-4" />
              </NavLink>
              <NavLink
                className="inline-flex items-center gap-2 rounded-md border border-lake/50 px-5 py-3 font-medium text-lake transition hover:bg-lake/10"
                to="/open-source"
              >
                Open-source files
                <ArrowRight aria-hidden="true" className="size-4" />
              </NavLink>
            </div>
          </div>

          <div className="rounded-lg border bg-panel p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-md border border-campari/40 bg-campari/10 text-campari">
                <ClipboardCheck aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  Current State
                </p>
                <h2 className="font-serif text-3xl">Milestone 1 scaffold</h2>
              </div>
            </div>
            <ul className="mt-6 space-y-3">
              {reviewChecklist.map((item) => (
                <li className="flex gap-3 text-muted-foreground" key={item}>
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-lake" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="content-shell">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.22em] text-gold">Launch Site Shell</p>
            <h2 className="mt-4 font-serif text-4xl md:text-5xl">Ready for the future goods</h2>
            <p className="mt-4 leading-8 text-muted-foreground">
              These sections are placeholders for later milestones: media, calibration data, CAD,
              firmware, BOM, decision history, and the inevitable first-pour video.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {siteSections.map((section) => {
              const Icon = section.icon;
              return (
                <NavLink
                  className="group rounded-lg border bg-panel p-5 transition hover:-translate-y-0.5 hover:border-gold/50"
                  key={section.title}
                  to={section.href}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs uppercase tracking-[0.18em] text-gold">
                      {section.eyebrow}
                    </span>
                    <Icon
                      aria-hidden="true"
                      className="size-5 text-muted-foreground transition group-hover:text-gold"
                    />
                  </div>
                  <h3 className="mt-5 font-serif text-2xl">{section.title}</h3>
                  <p className="mt-3 leading-7 text-muted-foreground">{section.description}</p>
                  <p className="mt-5 text-sm text-lake">{section.status}</p>
                </NavLink>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/40 py-16">
        <div className="content-shell grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-gold">Safety And Unknowns</p>
            <h2 className="mt-4 font-serif text-4xl">No invented specs</h2>
            <p className="mt-4 leading-8 text-muted-foreground">
              The site is allowed to be funny. It is not allowed to make up food-path, alcohol,
              power, material, drilling, or pump claims.
            </p>
          </div>
          <ul className="grid gap-4">
            {safetyNotes.map((note) => (
              <li className="rounded-lg border bg-panel p-5 text-muted-foreground" key={note}>
                {note}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16">
        <div className="content-shell">
          <p className="text-sm uppercase tracking-[0.22em] text-gold">Milestone Roadmap</p>
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
