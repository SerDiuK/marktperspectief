import Link from "next/link";
import { IconLabel } from "@/components/icon-label";
import { UploadIcon } from "@/components/icons";
import { Logo, LogoMark } from "@/components/logo";
import { PrivacyToggle } from "./privacy-toggle";

export function SiteHeader({ current }: { current: "/" | "/import" }) {
    return (
        <header className="mx-auto w-full max-w-300 px-4 pt-6 md:px-10">
            <nav className="flex items-center gap-x-2 pb-4">
                <Link href="/" aria-current={current === "/" ? "page" : undefined} className="mr-auto">
                    <LogoMark className="size-8 md:hidden" />
                    <Logo className="hidden h-8 w-auto md:block" />
                </Link>
                <Link
                    href="/import"
                    aria-current={current === "/import" ? "page" : undefined}
                    className="group relative inline-flex size-9 items-center justify-center text-muted-foreground hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
                >
                    <UploadIcon className="size-4" />
                    <IconLabel>Import</IconLabel>
                </Link>
                <PrivacyToggle />
            </nav>
        </header>
    );
}
