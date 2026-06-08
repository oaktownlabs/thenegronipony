import { FlaskConical, Github } from 'lucide-react';
import { NavLink } from 'react-router';
import { githubLink, navItems } from '@/lib/site-content';
import { cn } from '@/lib/utils';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/88 backdrop-blur">
      <div className="content-shell flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
        <NavLink aria-label="The Negroni Pony home" className="flex items-center gap-3" to="/">
          <span className="grid size-10 place-items-center rounded-md border border-gold/50 bg-gold/14 text-gold">
            <FlaskConical aria-hidden="true" className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block font-serif text-xl">The Negroni Pony</span>
            <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Oaktown Labs
            </span>
          </span>
        </NavLink>

        <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground',
                  isActive && 'bg-muted text-foreground',
                )
              }
              key={item.href}
              to={item.href}
            >
              {item.label}
            </NavLink>
          ))}
          <a
            aria-label="Open source repository"
            className="grid size-9 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            href={githubLink.href}
            rel="noreferrer"
            target="_blank"
            title={githubLink.label}
          >
            <Github aria-hidden="true" className="size-4" />
          </a>
        </nav>
      </div>
    </header>
  );
}
