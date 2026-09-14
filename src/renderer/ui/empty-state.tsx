import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = Readonly<{
  children: ReactNode;
  heading: string;
  icon: LucideIcon;
}>;

export function EmptyState({ children, heading, icon: Icon }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <span className="empty-state-icon">
        <Icon aria-hidden="true" strokeWidth={1.6} />
      </span>
      <h2>{heading}</h2>
      {children}
    </section>
  );
}
