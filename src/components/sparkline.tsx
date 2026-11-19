// A line through the values in a 100 × 28 box, highest at the top.
export function sparklinePath(values: number[]) {
    if (values.length < 2) return "";

    const low = Math.min(...values);
    const range = Math.max(...values) - low || 1;

    return values
        .map((value, index) => {
            const x = (index / (values.length - 1)) * 100;
            const y = 2 + (1 - (value - low) / range) * 24;

            return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join("");
}

export function Sparkline({ path, label }: { path: string; label: string }) {
    return (
        <svg
            role="img"
            aria-label={label}
            viewBox="0 0 100 28"
            preserveAspectRatio="none"
            className="h-6 w-16 overflow-visible"
        >
            <path
                d={path}
                fill="none"
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-foreground/70"
            />
        </svg>
    );
}
