import { useId } from "react";
import { InfoIcon } from "./icons";

export function InfoTooltip({ label, children }: { label: string; children: React.ReactNode }) {
    const id = useId();

    return (
        <span className="group relative inline-flex">
            <button
                type="button"
                aria-label={label}
                aria-describedby={id}
                className="text-muted-foreground transition-colors hover:text-foreground"
            >
                <InfoIcon className="size-3.5" />
            </button>
            <span
                role="tooltip"
                id={id}
                className="invisible absolute top-full left-0 z-10 mt-2 flex w-64 flex-col gap-2 border-t-2 border-foreground bg-popover px-3.5 py-3 text-note font-normal text-foreground tabular-nums opacity-0 outline outline-input transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
            >
                {children}
            </span>
        </span>
    );
}
