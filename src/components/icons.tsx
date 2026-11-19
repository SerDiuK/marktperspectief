import { cn } from "cn";

function Icon({ className, children }: { className?: string; children: React.ReactNode }) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("fill-none stroke-current stroke-2", className)}>
            {children}
        </svg>
    );
}

export function ChevronDownIcon({ className }: { className?: string }) {
    return (
        <Icon className={className}>
            <path d="m6 9 6 6 6-6" />
        </Icon>
    );
}

export function CloseIcon({ className }: { className?: string }) {
    return (
        <Icon className={className}>
            <path d="M18 6 6 18M6 6l12 12" />
        </Icon>
    );
}

export function InfoIcon({ className }: { className?: string }) {
    return (
        <Icon className={className}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-5M12 8h.01" />
        </Icon>
    );
}

export function EyeIcon({ className }: { className?: string }) {
    return (
        <Icon className={className}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
        </Icon>
    );
}

export function EyeOffIcon({ className }: { className?: string }) {
    return (
        <Icon className={className}>
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.3 17.3 0 0 1-3.1 4.1" />
            <path d="M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </Icon>
    );
}

export function UploadIcon({ className }: { className?: string }) {
    return (
        <Icon className={className}>
            <path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
        </Icon>
    );
}
