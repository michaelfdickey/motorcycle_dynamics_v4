/**
 * Vehicle design save/load utility.
 * Saves all vehicle parameters as a JSON file with sections per tab.
 */

export interface VehicleDesign {
	name: string;
	version: number;
	savedAt: string;
	brakes?: {
		frontBrake: Record<string, unknown>;
		rearBrake: Record<string, unknown>;
		vehicle: Record<string, unknown>;
	};
	frontEnd?: Record<string, unknown>;
	rearEnd?: Record<string, unknown>;
	suspension?: Record<string, unknown>;
	frame?: Record<string, unknown>;
	// Future tabs added here
}

const STORAGE_KEY = 'motorcycle_vehicle_name';

/** Get last used filename from localStorage */
export function getLastFileName(): string {
	if (typeof localStorage !== 'undefined') {
		return localStorage.getItem(STORAGE_KEY) || 'my_bike';
	}
	return 'my_bike';
}

/** Remember last used filename */
export function setLastFileName(name: string): void {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, name);
	}
}

/** Save vehicle design as a downloaded JSON file */
export function saveVehicleDesign(design: VehicleDesign): void {
	const json = JSON.stringify(design, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${design.name}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	setLastFileName(design.name);
}

/** Load vehicle design from a user-selected JSON file. Returns null if cancelled. */
export function loadVehicleDesign(): Promise<VehicleDesign | null> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) { resolve(null); return; }
			try {
				const text = await file.text();
				const design = JSON.parse(text) as VehicleDesign;
				if (!design.name || !design.version) {
					throw new Error('Invalid vehicle design file');
				}
				setLastFileName(design.name);
				resolve(design);
			} catch {
				alert('Failed to load vehicle file. Check format.');
				resolve(null);
			}
		};
		input.oncancel = () => resolve(null);
		input.click();
	});
}
