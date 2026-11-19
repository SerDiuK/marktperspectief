/** The control needs `group relative`. */
export function IconLabel({ children }: { children: React.ReactNode }) {
    return (
        <span className="pointer-events-none absolute top-full right-0 z-10 mt-1.5 bg-popover px-2 py-1 text-xs font-semibold whitespace-nowrap text-foreground opacity-0 outline outline-input transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {children}
        </span>
    );
}
