import { FilePlus2, Files, Settings2, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { WorkspaceDestination } from "./workspace-destination.ts";

const destinations = [
  { id: "create", label: "Create invoice", icon: FilePlus2 },
  { id: "invoices", label: "Invoices", icon: Files },
  { id: "clients", label: "Clients", icon: Users },
  { id: "settings", label: "Settings", icon: Settings2 },
] satisfies ReadonlyArray<{
  id: WorkspaceDestination;
  label: string;
  icon: LucideIcon;
}>;

type TopBarProps = Readonly<{
  destination: WorkspaceDestination;
  onDestinationChange: (destination: WorkspaceDestination) => void;
}>;

export function TopBar({ destination, onDestinationChange }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="wordmark" aria-label="Codernetic Invoice Generator">
        <span>CODER</span>
        <strong>NETIC</strong>
        <small>Invoices</small>
      </div>

      <nav aria-label="Workspace destinations">
        {destinations.map(({ id, label, icon: Icon }) => (
          <button
            aria-current={destination === id ? "page" : undefined}
            className="destination"
            key={id}
            onClick={() => onDestinationChange(id)}
            type="button"
          >
            <Icon aria-hidden="true" strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <p className="local-status">
        <span aria-hidden="true" />
        Stored on this Mac
      </p>
    </header>
  );
}
