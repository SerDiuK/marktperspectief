const MICRO = 1_000_000;

export function toMicro(shares: number) {
    return Math.round(shares * MICRO);
}

export function fromMicro(micro: number) {
    return micro / MICRO;
}

export function toCents(amount: number) {
    return Math.round(amount * 100);
}

// Non-negative integers only.
export function mulDivRound(a: number, b: number, c: number) {
    const two = BigInt(2);
    const divisor = BigInt(c);

    return Number((two * BigInt(a) * BigInt(b) + divisor) / (two * divisor));
}
