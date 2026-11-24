import { cn } from "cn";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
    return (
        <div className="overflow-x-auto">
            <table className={cn("w-full text-sm tabular-nums", className)} {...props} />
        </div>
    );
}

export function TableHeader({ className, children }: { className?: string; children: React.ReactNode }) {
    return (
        <thead className={cn("text-left text-xs", className)}>
            <tr className="border-b-2 border-foreground">{children}</tr>
        </thead>
    );
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
    return <th className={cn("h-10 font-bold not-first:pl-4", className)} {...props} />;
}

const variants = {
    plain: "",
    link: "relative transition-colors hover:bg-accent active:bg-input",
};

export function TableRow({
    variant = "plain",
    className,
    ...props
}: React.ComponentProps<"tr"> & { variant?: keyof typeof variants }) {
    return <tr className={cn("border-b", variants[variant], className)} {...props} />;
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
    return <td className={cn("py-3 not-first:pl-4", className)} {...props} />;
}
