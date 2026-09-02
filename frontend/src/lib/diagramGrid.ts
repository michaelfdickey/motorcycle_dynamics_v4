export type UnitSystem = 'metric' | 'us';

/** 10 cm metric, 6 inches US. */
export function gridStepMm(units: UnitSystem): number {
	return units === 'us' ? 25.4 * 6 : 100;
}

export function gridRange(min: number, max: number, step: number): number[] {
	const start = Math.floor(min / step) * step;
	const out: number[] = [];
	const end = max + step * 0.001;
	for (let v = start; v <= end; v += step) out.push(v);
	return out;
}

export function gridLabel(units: UnitSystem): string {
	return units === 'us' ? '6"' : '10 cm';
}
