import type { LucideIcon } from "lucide-react";

export function FeaturePlaceholder({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <section className="feature-placeholder">
      <p className="eyebrow">{eyebrow}</p>
      <span className="feature-placeholder-icon"><Icon size={24} /></span>
      <h1>{title}</h1>
      <p>{description}</p>
      <span className="coming-soon-pill">Planned for the next development phase</span>
    </section>
  );
}
