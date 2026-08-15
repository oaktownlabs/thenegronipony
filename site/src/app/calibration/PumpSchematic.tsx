interface PumpSchematicProps {
  kind: 'kamoer' | 'gikfun';
}

export function PumpSchematic({ kind }: PumpSchematicProps) {
  if (kind === 'kamoer') {
    return (
      <svg
        aria-label="Kamoer pump outline"
        className="pump-schematic"
        role="img"
        viewBox="0 0 220 116"
      >
        <path d="M14 26h102v66H14zM116 38h28v43h-28" />
        <circle cx="66" cy="59" r="27" />
        <circle cx="66" cy="59" r="8" />
        <circle cx="66" cy="39" r="5" />
        <circle cx="49" cy="69" r="5" />
        <circle cx="83" cy="69" r="5" />
        <path d="M39 58c0-24 54-24 54 0M143 48h51M143 70h51M194 42v35" />
        <path
          className="pump-schematic__fine"
          d="M21 33h14M21 85h14M98 33h11M98 85h11M153 54h31M153 64h31"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-label="Gikfun pump outline"
      className="pump-schematic"
      role="img"
      viewBox="0 0 220 116"
    >
      <path d="M15 35h81v49H15zM96 43h31v33H96M127 52h49v16h-49" />
      <circle cx="54" cy="59" r="21" />
      <circle cx="54" cy="59" r="6" />
      <circle cx="54" cy="44" r="4" />
      <circle cx="41" cy="67" r="4" />
      <circle cx="67" cy="67" r="4" />
      <path d="M33 58c0-18 42-18 42 0M176 56h27M176 64h27" />
      <path
        className="pump-schematic__fine"
        d="M21 41h11M21 77h11M81 41h9M81 77h9M135 56h31M135 64h31"
      />
    </svg>
  );
}
