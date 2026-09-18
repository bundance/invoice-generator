type PageHeaderProps = Readonly<{
  eyebrow: string;
  heading: string;
  summary: string;
}>;

export function PageHeader({ eyebrow, heading, summary }: PageHeaderProps) {
  return (
    <header className="page-header">
      <p className="eyebrow">{eyebrow}</p>
      <div className="page-header__copy">
        <h1>{heading}</h1>
        <p>{summary}</p>
      </div>
    </header>
  );
}
