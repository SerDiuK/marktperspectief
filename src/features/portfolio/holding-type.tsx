import type { holdingTypes } from "@/db/schema";

export type HoldingTypeId = (typeof holdingTypes)[number];

const types: Record<HoldingTypeId, { label: string; tone: string }> = {
    compounder: { label: "Compounder", tone: "bg-compounder/12 text-compounder ring-compounder" },
    bargain: { label: "Bargain", tone: "bg-bargain/12 text-bargain ring-bargain" },
    cigar_butt: { label: "Cigar butt", tone: "bg-cigar-butt/12 text-cigar-butt ring-cigar-butt" },
    cyclical: { label: "Cyclical", tone: "bg-cyclical/12 text-cyclical ring-cyclical" },
    asset_play: { label: "Asset play", tone: "bg-asset-play/12 text-asset-play ring-asset-play" },
    avoid: { label: "Avoid", tone: "bg-avoid/12 text-avoid ring-avoid" },
    core: { label: "Core", tone: "bg-core/12 text-core ring-core" },
};

const sizes = {
    small: "h-5.5 px-2 text-xs font-semibold ring-1",
    large: "type-subsection h-9 px-3 ring-2",
};

export function HoldingType({ type, size = "small" }: { type: HoldingTypeId; size?: keyof typeof sizes }) {
    const { label, tone } = types[type];

    return (
        <span className={`inline-flex items-center whitespace-nowrap ring-inset ${sizes[size]} ${tone}`}>{label}</span>
    );
}
