import { cn } from "cn";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
    return (
        <input
            className={cn(
                "h-10 min-w-0 border border-input bg-transparent px-3 text-sm transition-colors placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-ring focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50",
                className,
            )}
            {...props}
        />
    );
}
