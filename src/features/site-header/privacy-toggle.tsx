"use client";

import { Button } from "@/components/button";
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
        <Button variant="ghost" size="icon" onClick={togglePrivacy} className="group relative">
            <EyeIcon className="size-4 private:hidden" />
            <EyeOffIcon className="hidden size-4 private:block" />
            <IconLabel>
                <span className="private:hidden">Hide amounts</span>
                <span className="hidden private:inline">Show amounts</span>
            </IconLabel>
        </Button>
    );
}
