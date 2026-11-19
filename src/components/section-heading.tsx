export function SectionHeading({
    as: Heading = "h2",
    label,
    children,
}: {
    as?: "h1" | "h2";
    label?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2.5 border-t-2 border-foreground pt-3.5">
            <Heading className="type-section">{children}</Heading>
            {label && <p className="type-label">{label}</p>}
        </div>
    );
}
