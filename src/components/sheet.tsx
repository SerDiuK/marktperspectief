"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Button } from "./button";
import { CloseIcon } from "./icons";

function showModal(dialog: HTMLDialogElement | null) {
    if (!dialog || dialog.open) return;

    const root = document.documentElement;

    root.style.setProperty("--scrollbar-width", `${window.innerWidth - root.clientWidth}px`);
    dialog.showModal();
}

export function Sheet({ label, closeHref, children }: { label: string; closeHref: string; children: React.ReactNode }) {
    const router = useRouter();
    const handleClose = useCallback(() => {
        router.replace(closeHref, { scroll: false });
    }, [router, closeHref]);

    return (
        <dialog
            ref={showModal}
            closedby="any"
            aria-label={label}
            onClose={handleClose}
            className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-130 max-w-full overflow-y-auto overscroll-contain border-t-4 border-l border-t-primary border-l-input bg-popover px-4 pt-6.5 pb-8 text-foreground transition-transform backdrop:bg-background/70 open:flex open:flex-col open:gap-6 starting:translate-x-full motion-reduce:transition-none sm:px-8"
        >
            <form method="dialog" className="absolute top-6.5 right-4 sm:right-8">
                <Button type="submit" aria-label="Close" size="icon">
                    <CloseIcon className="size-4" />
                </Button>
            </form>
            {children}
        </dialog>
    );
}
