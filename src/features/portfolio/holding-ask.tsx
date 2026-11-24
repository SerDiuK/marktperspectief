"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/button";
import { ChevronDownIcon } from "@/components/icons";
import { LensMark } from "@/components/logo";
import { Ask } from "./ask";

export function HoldingAsk({
    title,
    instrumentId,
    name,
    hasThesis,
    children,
}: {
    title: React.ReactNode;
    instrumentId: string;
    name: string;
    hasThesis: boolean;
    children: React.ReactNode;
}) {
    const [asking, setAsking] = useState(false);
    const handleAsk = useCallback(() => setAsking(true), []);
    const handleBack = useCallback(() => setAsking(false), []);

    return (
        <>
            <div className="flex items-start gap-2 pr-11">
                {title}
                {asking ? (
                    <Button size="sm" onClick={handleBack}>
                        <ChevronDownIcon className="size-4 rotate-90" />
                        Back
                    </Button>
                ) : (
                    <Button size="sm" onClick={handleAsk}>
                        <LensMark className="size-4" />
                        Ask Lens
                    </Button>
                )}
            </div>
            <div className={asking ? "hidden" : "contents"}>{children}</div>
            <div className={asking ? "contents" : "hidden"}>
                <Ask instrumentId={instrumentId} name={name} hasThesis={hasThesis} />
            </div>
        </>
    );
}
