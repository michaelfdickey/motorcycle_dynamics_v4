/**
 * Vehicle design save/load utility.
 * Persists vehicle JSON files via the backend API to a local project folder.
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

function apiBase(): string {
	// In dev, Vite proxies /api to the backend; use relative path
	return '';
}

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

/** List all saved vehicle designs */
export async function listVehicles(): Promise<{ name: string }[]> {
	const res = await fetch(`${apiBase()}/api/vehicles`);
	if (!res.ok) return [];
	return res.json();
}

/** Save vehicle design to backend */
export async function saveVehicleDesign(design: VehicleDesign): Promise<boolean> {
	const res = await fetch(`${apiBase()}/api/vehicles/${encodeURIComponent(design.name)}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(design),
	});
	if (res.ok) {
		setLastFileName(design.name);
		return true;
	}
	return false;
}

/** Load vehicle design from backend by name */
export async function loadVehicleDesign(name: string): Promise<VehicleDesign | null> {
	const res = await fetch(`${apiBase()}/api/vehicles/${encodeURIComponent(name)}`);
	if (!res.ok) return null;
	const design = await res.json() as VehicleDesign;
	setLastFileName(design.name);
	return design;
}

/** Delete a vehicle design */
export async function deleteVehicleDesign(name: string): Promise<boolean> {
	const res = await fetch(`${apiBase()}/api/vehicles/${encodeURIComponent(name)}`, {
		method: 'DELETE',
	});
	return res.ok;
}
