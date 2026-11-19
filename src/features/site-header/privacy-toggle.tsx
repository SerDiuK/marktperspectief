"use client";

import { IconLabel } from "@/components/icon-label";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { privacyKey } from "./privacy";

function togglePrivacy() {
    if (document.documentElement.toggleAttribute("data-privacy")) {
        localStorage.setItem(privacyKey, "hidden");
    } else {
        localStorage.removeItem(privacyKey);
    }
}

export function PrivacyToggle() {
    return (
        <button
            type="button"
            onClick={togglePrivacy}
            className="group relative inline-flex size-9 items-center justify-center text-muted-foreground hover:text-foreground"
        >
            <EyeIcon className="size-4 private:hidden" />
            <EyeOffIcon className="hidden size-4 private:block" />
            <IconLabel>
                <span className="private:hidden">Hide amounts</span>
                <span className="hidden private:inline">Show amounts</span>
            </IconLabel>
        </button>
    );
}
