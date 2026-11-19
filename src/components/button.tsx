import { cn } from "cn";

const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-ring",
    outline: "border border-input hover:bg-muted",
};

export function Button({
    variant = "outline",
    className,
    ...props
}: React.ComponentProps<"button"> & { variant?: keyof typeof variants }) {
    return (
        <button
            type="button"
            className={cn(
                "inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-60",
                variants[variant],
                className,
            )}
            {...props}
        />
    );
}
