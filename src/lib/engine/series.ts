export type Point = { date: string; value: number };

// The value of the last point on or before date, from points sorted by date.
export function asOf(points: Point[], date: string) {
    let low = 0;
    let high = points.length;

    while (low < high) {
        const middle = (low + high) >> 1;

        if (points[middle].date <= date) low = middle + 1;
        else high = middle;
    }

    return low === 0 ? undefined : points[low - 1].value;
}
