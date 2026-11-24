"use client";

import { useCallback } from "react";

export function Segments<T extends string>({
    label,
    options,
    value,
    onPick,
}: {
    label: string;
    options: [T, string][];
    value: T;
    onPick: (option: T) => void;
}) {
    const pick = useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => onPick(event.currentTarget.value as T),
        [onPick],
    );

    return (
        <div role="group" aria-label={label} className="flex flex-wrap">
            {options.map(([option, text]) => (
                <button
                    key={option}
                    type="button"
                    value={option}
                    aria-pressed={option === value}
                    onClick={pick}
                    className="-ml-px h-8 min-w-11 px-2.5 text-note font-semibold font-stretch-85% text-muted-foreground ring-1 ring-input ring-inset first:ml-0 transition-colors hover:bg-accent hover:text-foreground active:bg-input aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:ring-primary"
                >
                    {text}
                </button>
            ))}
        </div>
    );
}
