import type { Surface } from "@/lib/types";

const surfaceIcon: Record<Surface["key"], string> = {
  popup: "▣",
  options: "⚙",
  devtools: "⌘",
  sidepanel: "▤",
  newtab: "＋",
};

type SurfaceTabsProps = {
  surfaces: Surface[];
  active: Surface | null;
  onSelect: (surface: Surface) => void;
};

export default function SurfaceTabs({ surfaces, active, onSelect }: SurfaceTabsProps) {
  return (
    <nav className="surface-tabs" aria-label="Extension surfaces">
      <div className="section-heading"><span>Preview surface</span><span>{surfaces.length}</span></div>
      {surfaces.map((surface) => (
        <button
          key={surface.key}
          type="button"
          className={`surface-tab ${active?.key === surface.key ? "surface-tab--active" : ""}`}
          onClick={() => onSelect(surface)}
        >
          <span className="surface-tab__icon" aria-hidden="true">{surfaceIcon[surface.key]}</span>
          <span><strong>{surface.label}</strong><small>{surface.path}</small></span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
    </nav>
  );
}
