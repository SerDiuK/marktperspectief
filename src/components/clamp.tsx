"use client";

import { useCallback, useState } from "react";

export function Clamp({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [cut, setCut] = useState(false);
    const watch = useCallback(
        (text: HTMLParagraphElement | null) => {
            if (!text || open) return;

            const measure = () => setCut(text.scrollHeight > text.clientHeight);
            const observer = new ResizeObserver(measure);

            measure();
            observer.observe(text);

            return () => observer.disconnect();
        },
        [open],
    );
    const toggle = useCallback(() => setOpen((current) => !current), []);

    return (
        <>
            <p ref={watch} className={open ? "text-note" : "line-clamp-3 text-note"}>
                {children}
            </p>
            {cut && (
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={toggle}
                    className="-mt-2 self-start text-note font-semibold text-muted-foreground hover:text-foreground"
                >
                    {open ? "Less" : "More"}
                </button>
            )}
        </>
    );
}
