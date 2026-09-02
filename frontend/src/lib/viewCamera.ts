/** Persist pan/zoom/POV per tab and per view-center so switching tabs or POV restores the last camera. */

export interface CamSnap {
	panX: number;
	panY: number;
	zoom: number;
	freeX: number;
	freeY: number;
	freeViewW: number;
	freeViewH: number;
}

export interface ViewCam {
	pov: string;
	snap: CamSnap;
	perPov: Record<string, CamSnap>;
}

const mem = new Map<string, ViewCam>();

function key(id: string): string {
	return 'motorcycle_viewcam_' + id;
}

export function emptySnap(): CamSnap {
	return { panX: 0, panY: 0, zoom: 1, freeX: 0, freeY: 0, freeViewW: 0, freeViewH: 0 };
}

export function getViewCam(id: string): ViewCam | null {
	if (mem.has(id)) return mem.get(id)!;
	try {
		if (typeof localStorage === 'undefined') return null;
		const raw = localStorage.getItem(key(id));
		if (!raw) return null;
		const v = JSON.parse(raw) as ViewCam;
		mem.set(id, v);
		return v;
	} catch {
		return null;
	}
}

export function setViewCam(id: string, cam: ViewCam): void {
	mem.set(id, cam);
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(key(id), JSON.stringify(cam));
		}
	} catch {
		/* ignore quota */
	}
}

export interface ViewUi {
	viewSide?: 'left' | 'right';
	unitSystem?: 'metric' | 'us';
	activeTab?: number;
}

const uiMem = new Map<string, ViewUi>();

function uiKey(id: string): string {
	return 'motorcycle_viewui_' + id;
}

export function getViewUi(id: string): ViewUi | null {
	if (uiMem.has(id)) return uiMem.get(id)!;
	try {
		if (typeof localStorage === 'undefined') return null;
		const raw = localStorage.getItem(uiKey(id));
		if (!raw) return null;
		const v = JSON.parse(raw) as ViewUi;
		uiMem.set(id, v);
		return v;
	} catch {
		return null;
	}
}

export function setViewUi(id: string, ui: ViewUi): void {
	uiMem.set(id, ui);
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(uiKey(id), JSON.stringify(ui));
		}
	} catch {
		/* ignore quota */
	}
}
