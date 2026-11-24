import { cn } from "cn";

const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-ring active:bg-primary/80",
    outline: "border border-input hover:bg-accent active:bg-input",
    ghost: "text-muted-foreground hover:bg-accent hover:text-foreground active:bg-input",
};

const sizes = {
    default: "min-h-10 px-4 py-2",
    sm: "min-h-9 px-3 py-1.5",
    icon: "size-9",
};

type Look = { variant?: keyof typeof variants; size?: keyof typeof sizes };

export function buttonClass({ variant = "outline", size = "default" }: Look = {}) {
    return cn(
        "inline-flex shrink-0 items-center justify-center gap-2 text-sm font-semibold transition-colors select-none disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
    );
}

export function Button({ variant, size, className, ...props }: React.ComponentProps<"button"> & Look) {
    return <button type="button" className={cn(buttonClass({ variant, size }), className)} {...props} />;
}
