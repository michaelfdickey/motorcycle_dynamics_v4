/**
 * Parse a standard motorcycle tire designation like "120/70ZR17" or "120/70-17"
 * into width (mm), aspect ratio (%), and rim diameter (inches).
 *
 * Returns derived dimensions in mm for drawing and calculations.
 */

export interface TireParams {
	designation: string;
	widthMm: number;       // section width in mm
	aspectRatio: number;   // aspect ratio as percentage (e.g. 70)
	rimDiameterIn: number; // rim diameter in inches
}

export interface TireDimensions {
	widthMm: number;
	sectionHeightMm: number;    // width * aspectRatio / 100
	rimDiameterMm: number;
	outerDiameterMm: number;    // rim + 2 * sectionHeight
	outerRadiusMm: number;
	rimRadiusMm: number;
	loadedRadiusMm: number;     // approximate: outerRadius - small deflection
}

const TIRE_REGEX = /^(\d{2,3})\s*\/\s*(\d{2,3})\s*[-ZRBVHSW]*(\d{2})$/i;

export function parseTireDesignation(designation: string): TireParams | null {
	const match = designation.trim().match(TIRE_REGEX);
	if (!match) return null;

	return {
		designation: designation.trim(),
		widthMm: parseInt(match[1], 10),
		aspectRatio: parseInt(match[2], 10),
		rimDiameterIn: parseInt(match[3], 10),
	};
}

export function computeTireDimensions(params: TireParams): TireDimensions {
	const widthMm = params.widthMm;
	const sectionHeightMm = widthMm * (params.aspectRatio / 100);
	const rimDiameterMm = params.rimDiameterIn * 25.4;
	const outerDiameterMm = rimDiameterMm + 2 * sectionHeightMm;
	const outerRadiusMm = outerDiameterMm / 2;
	const rimRadiusMm = rimDiameterMm / 2;
	// Loaded radius: roughly outer radius minus ~10% of section height
	const loadedRadiusMm = outerRadiusMm - sectionHeightMm * 0.1;

	return {
		widthMm,
		sectionHeightMm,
		rimDiameterMm,
		outerDiameterMm,
		outerRadiusMm,
		rimRadiusMm,
		loadedRadiusMm,
	};
}
