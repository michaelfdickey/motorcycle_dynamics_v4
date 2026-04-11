/**
 * Front-end geometry calculations for motorcycle steering.
 *
 * Supports: telescopic fork, leading link, trailing link.
 *
 * All angles in degrees for user-facing, radians internally.
 * All lengths in mm.
 */

import type { TireDimensions } from './tire';

export type SuspensionType = 'telescopic' | 'leading_link' | 'trailing_link';

export interface FrontEndInputs {
	suspensionType: SuspensionType;
	rakeAngleDeg: number;       // steering axis angle from vertical (degrees)
	forkOffsetMm: number;       // fork offset (perpendicular distance from steering axis to axle)
	linkLengthMm: number;       // link arm length (leading/trailing link only)
	linkOffsetMm: number;       // perpendicular offset of link pivot from steering axis
	steeringColumnHeightMm: number; // height of steering column / triple clamp area
	forkLengthMm: number;       // length of fork tubes (axle to lower triple)
}

export interface FrontEndResults {
	trailMm: number;
	mechanicalTrailMm: number;
	wheelbaseFrontMm: number;   // horizontal distance from steering axis ground intersection to axle
	axleHeightMm: number;
	steeringAxisGroundX: number; // where steering axis meets ground (for drawing)

	// Drawing coordinates (side view, ground at y=0, +x forward, +y up)
	// All points in mm from an origin at the contact patch
	contactPatch: Point;
	axleCenter: Point;
	steeringAxisGround: Point;
	steeringAxisTop: Point;
	forkTop: Point;     // upper end of fork / lower triple
	forkBottom: Point;  // lower end of fork / axle area
	// For link types
	linkPivot?: Point;
	linkEnd?: Point;    // link end attaches to axle
}

export interface Point {
	x: number;
	y: number;
}

function degToRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

export function computeFrontEnd(inputs: FrontEndInputs, tire: TireDimensions): FrontEndResults {
	const rakeRad = degToRad(inputs.rakeAngleDeg);
	const cosRake = Math.cos(rakeRad);
	const sinRake = Math.sin(rakeRad);
	const tanRake = Math.tan(rakeRad);

	const wheelRadius = tire.outerRadiusMm;
	const rimRadius = tire.rimRadiusMm;

	// Contact patch is our origin
	const contactPatch: Point = { x: 0, y: 0 };

	// Axle center is directly above contact patch at wheel radius height
	const axleCenter: Point = { x: 0, y: wheelRadius };

	let trailMm: number;
	let mechanicalTrailMm: number;
	let steeringAxisGroundX: number;
	let forkTop: Point;
	let forkBottom: Point;
	let linkPivot: Point | undefined;
	let linkEnd: Point | undefined;

	if (inputs.suspensionType === 'telescopic') {
		// Telescopic fork:
		// Fork offset is perpendicular distance from steering axis to axle.
		// Trail = (wheelRadius * sin(rake) - forkOffset) / cos(rake)
		// But more standard:
		// The steering axis, extended to ground, hits at a point behind the contact patch.
		// steeringAxisGroundX = wheelRadius * tan(rake) - forkOffset / cos(rake)
		// Trail = steeringAxisGroundX (positive = behind contact patch = stable)

		// Mechanical trail = wheelRadius * sin(rake) - forkOffset
		mechanicalTrailMm = wheelRadius * sinRake - inputs.forkOffsetMm;
		trailMm = mechanicalTrailMm / cosRake;
		steeringAxisGroundX = trailMm; // distance behind contact patch

		// Steering axis ground point (behind contact patch in +x direction... 
		// let's define: +x = forward. Contact patch at origin.
		// Steering axis ground intersection is BEHIND the contact patch,
		// so it's at negative x (further back).
		// Actually in motorcycle convention: trail is the distance the contact patch
		// is AHEAD of the steering axis ground point.
		// So steering axis ground point is at x = -trail (behind).

		const saGround: Point = { x: -trailMm, y: 0 };

		// Steering axis goes upward at rake angle from vertical
		// Direction vector of steering axis: dx = -sin(rake), dy = cos(rake)
		// (going up and back)
		const saLength = inputs.forkLengthMm + inputs.steeringColumnHeightMm;
		const steeringAxisTop: Point = {
			x: saGround.x - sinRake * saLength,
			y: saGround.y + cosRake * saLength,
		};

		// Fork bottom (at axle): offset perpendicular to steering axis toward the front
		// Perpendicular to steering axis (forward direction): dx = cos(rake), dy = sin(rake)
		forkBottom = { ...axleCenter };

		// Fork top: from axle, go up along steering axis by forkLength
		forkTop = {
			x: axleCenter.x - sinRake * inputs.forkLengthMm,
			y: axleCenter.y + cosRake * inputs.forkLengthMm,
		};

		return {
			trailMm,
			mechanicalTrailMm,
			wheelbaseFrontMm: trailMm,
			axleHeightMm: wheelRadius,
			steeringAxisGroundX: trailMm,
			contactPatch,
			axleCenter,
			steeringAxisGround: saGround,
			steeringAxisTop,
			forkTop,
			forkBottom,
		};
	}

	// ── Link types (leading link, trailing link) ──

	// For link suspensions, the link pivot is on the fork leg,
	// and the link arm extends to the axle.
	// Leading link: link extends FORWARD from pivot to axle (axle is ahead of pivot)
	// Trailing link: link extends REARWARD from pivot to axle (axle is behind pivot)

	// The fork tube goes from the lower triple clamp down to the link pivot.
	// The steering axis offset and fork offset position the pivot relative to the steering axis.

	// Fork offset here means: perpendicular offset of the fork tube from steering axis.
	// Link offset means: perpendicular offset from link pivot to the steering axis plane.

	// Simplified model:
	// 1. Steering axis ground intersection
	// 2. Fork tube runs along steering axis (offset by forkOffset), from triple clamp down to link pivot
	// 3. Link pivot is at the bottom of the fork tube
	// 4. Link arm of linkLengthMm extends to the axle

	// For link types, trail depends on where the axle ends up.
	// We place the link pivot at the bottom of the fork, then compute axle position.

	// Fork pivot point (bottom of fork tube):
	// The fork tube center is offset from steering axis by forkOffset perpendicular.
	// Fork tube bottom is at a certain height. Let's compute:

	// Steering axis ground intersection without any offset considerations:
	// If the axle were on the steering axis at height wheelRadius,
	// the SA ground point would be at x = -wheelRadius * tan(rake)

	// Start with the fork pivot: it's along the fork tube, offset from steering axis.
	// Place it at a height such that the link arm reaches the axle at wheelRadius height.

	// Fork bottom / link pivot: positioned along the fork at forkLengthMm below the triple clamp.
	// The fork is parallel to steering axis, offset by forkOffset.

	// Let's define the steering axis ground point first as a reference, 
	// then build geometry from there.

	// Triple clamp (top of fork):
	// We'll place the SA ground at an initial guess, then compute final positions.

	// Simpler approach: compute from axle backwards.
	// The axle is at (0, wheelRadius).
	// The link arm connects axle to pivot. For leading link, pivot is BEHIND axle.
	// For trailing link, pivot is AHEAD of axle.

	const linkSign = inputs.suspensionType === 'leading_link' ? -1 : 1;
	// linkSign: -1 means pivot is behind axle (leading), +1 means pivot is ahead (trailing)

	// Link arm hangs at some angle. At static ride height, approximate:
	// link arm is roughly horizontal (slight angle).
	// More precisely: the link pivot is at a height near the axle, and the arm
	// extends forward or back. We'll assume the link arm is close to horizontal
	// with a slight droop angle. For now, assume horizontal for simplicity.

	const linkPivotPoint: Point = {
		x: axleCenter.x + linkSign * inputs.linkLengthMm,
		y: axleCenter.y,
	};
	linkPivot = linkPivotPoint;
	linkEnd = { ...axleCenter };

	// The fork tube runs from the link pivot up to the triple clamp, 
	// parallel to the steering axis.
	// Direction along steering axis (upward): (-sin(rake), cos(rake))
	forkBottom = { ...linkPivotPoint };
	forkTop = {
		x: linkPivotPoint.x - sinRake * inputs.forkLengthMm,
		y: linkPivotPoint.y + cosRake * inputs.forkLengthMm,
	};

	// The steering axis passes through the fork tube (offset by forkOffset perpendicular).
	// Perpendicular to SA toward front: (cos(rake), sin(rake))
	// So SA passes through (forkTop.x - cos(rake)*forkOffset, forkTop.y - sin(rake)*forkOffset)
	// going in direction (-sin(rake), cos(rake)).

	const saRefX = forkTop.x - cosRake * inputs.forkOffsetMm;
	const saRefY = forkTop.y - sinRake * inputs.forkOffsetMm;

	// SA ground intersection: extend from saRef downward along SA direction until y = 0.
	// Point on SA: (saRefX + t*sinRake, saRefY - t*cosRake) for parameter t going down.
	// Set y = 0: saRefY - t*cosRake = 0 => t = saRefY / cosRake
	const tGround = saRefY / cosRake;
	const saGroundX = saRefX + tGround * sinRake;
	const saGround: Point = { x: saGroundX, y: 0 };

	// Trail = distance from contact patch to SA ground point (positive when SA is behind)
	trailMm = -saGroundX; // SA ground is at negative x (behind contact patch)
	mechanicalTrailMm = trailMm * cosRake;

	// SA top: extend upward from saRef
	const saTopDist = inputs.steeringColumnHeightMm;
	const steeringAxisTop: Point = {
		x: saRefX - sinRake * saTopDist,
		y: saRefY + cosRake * saTopDist,
	};

	return {
		trailMm,
		mechanicalTrailMm,
		wheelbaseFrontMm: trailMm,
		axleHeightMm: wheelRadius,
		steeringAxisGroundX: trailMm,
		contactPatch,
		axleCenter,
		steeringAxisGround: saGround,
		steeringAxisTop,
		forkTop,
		forkBottom,
		linkPivot,
		linkEnd,
	};
}
