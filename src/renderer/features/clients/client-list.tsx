import { Search } from "lucide-react";
import { useState } from "react";

import type { Client, ClientId } from "../../../domain/clients/client.ts";

type ClientListProps = Readonly<{
  clients: readonly Client[];
  onSelect: (clientId: ClientId) => void;
  selectedClientId: ClientId | null;
}>;

export function ClientList({ clients, onSelect, selectedClientId }: ClientListProps) {
  const [query, setQuery] = useState("");
  const matchingClients = query.trim()
    ? clients.filter(({ legalName }) =>
        legalName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      )
    : clients;

  return (
    <div className="client-list-panel">
      <label className="client-search">
        <span>Search clients</span>
        <div>
          <Search aria-hidden="true" />
          <input
            onChange={(event) => setQuery(event.currentTarget.value)}
            type="search"
            value={query}
          />
        </div>
      </label>
      <div className="client-list" aria-label="Saved clients">
        {matchingClients.map((client) => (
          <button
            aria-current={client.id === selectedClientId ? "true" : undefined}
            className="client-row"
            key={client.id}
            onClick={() => onSelect(client.id)}
            type="button"
          >
            <span className="client-avatar" aria-hidden="true">
              {getInitials(client.legalName)}
            </span>
            <span>
              <strong>{client.legalName}</strong>
              <small>
                {client.currency.code} ·{" "}
                {client.vatTreatment.kind === "uk-taxable" ? "UK taxable" : "Outside UK VAT"}
              </small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
