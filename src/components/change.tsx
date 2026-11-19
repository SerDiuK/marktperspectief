export function Change({ value, children }: { value: number; children: React.ReactNode }) {
    const tone =
        value > 0 ? "arrow-up text-positive" : value < 0 ? "arrow-down text-negative" : "text-muted-foreground";

    return <span className={tone}>{children}</span>;
}
