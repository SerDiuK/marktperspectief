import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { applyStoredPrivacy } from "@/features/site-header/privacy";

const archivo = Archivo({
    variable: "--font-archivo",
    subsets: ["latin"],
    axes: ["wdth"],
});

export const metadata: Metadata = {
    title: "Marktperspectief",
    description: "Personal finance dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang="en" className={`${archivo.variable} h-full`} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: applyStoredPrivacy }} />
            </head>
            <body className="min-h-full flex flex-col">{children}</body>
        </html>
    );
}
