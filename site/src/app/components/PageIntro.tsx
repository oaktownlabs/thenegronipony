export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="border-b py-16">
      <div className="content-shell max-w-3xl">
        <p className="text-sm uppercase tracking-[0.22em] text-gold">{eyebrow}</p>
        <h1 className="mt-4 font-serif text-5xl leading-none text-foreground md:text-7xl">
          {title}
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}
