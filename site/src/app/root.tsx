import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import { SiteHeader } from '@/components/SiteHeader';
import type { Route } from './+types/root';
import './app.css';

export const meta: Route.MetaFunction = () => [
  { title: 'The Negroni Pony | Oaktown Labs' },
  {
    name: 'description',
    content:
      'An open-source cocktail art machine from Oaktown Labs. Beautiful, competent, and fully absurd.',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
      </head>
      <body>
        <SiteHeader />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = 'Something spilled';
  let message = 'The page could not be rendered.';

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? 'Page not found' : 'Route error';
    message =
      error.status === 404 ? 'This placeholder is not wired up yet.' : error.statusText || message;
  } else if (import.meta.env.DEV && error instanceof Error) {
    message = error.message;
  }

  return (
    <main className="content-shell py-20">
      <p className="text-sm uppercase tracking-[0.22em] text-campari">Error</p>
      <h1 className="mt-4 font-serif text-5xl">{title}</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">{message}</p>
      <NavLink
        className="mt-8 inline-flex rounded-md border border-gold/40 px-4 py-2 text-gold transition hover:bg-gold/10"
        to="/"
      >
        Return home
      </NavLink>
    </main>
  );
}
