<script lang="ts">
	import { onDestroy } from 'svelte';
	import { listVehicles, saveVehicleDesign, loadVehicleDesign, getLastFileName, setLastFileName, type VehicleDesign } from '$lib/vehicleStore';
	import { computeFrontEnd, type FrontEndResults, type FrontEndInputs } from '$lib/frontEndGeometry';
	import { parseTireDesignation, computeTireDimensions, type TireDimensions } from '$lib/tire';
	import { saveRefImageBlob, loadRefImageBlob, clearRefImageBlob } from '$lib/refImageCache';

	// ── Types ──
	type Tool = 'select' | 'node' | 'member' | 'constraint' | 'dimension' | 'refline' | 'edit' | 'anchor';
	type NodeType = 'generic' | 'steering_head' | 'rear_axle' | 'rear_module' | 'engine' | 'seat' | 'rider' | 'anchor' | 'front_anchor' | 'rear_anchor';
	type ConstraintType = 'horizontal' | 'vertical' | 'distance' | 'angle' | 'fixed';
	type LineStyle = 'dashed-sm' | 'dashed-lg' | 'solid';
	type ViewSide = 'right' | 'left';

	interface LayoutNode {
		id: string;
		x: number;
		y: number;
		type: NodeType;
		label: string;
	}
	interface FrameMember {
		id: string;
		startId: string;
		endId: string;
		label: string;
		diameter: number;
		thickness: number;
	}
	interface Constraint {
		id: string;
		type: ConstraintType;
		nodeIds: string[];
		value: number;
	}
	interface Dimension {
		id: string;
		startId: string;
		endId: string;
		offset: number;
	}
	interface RefLine {
		id: string;
		x1: number; y1: number;
		x2: number; y2: number;
		label: string;
		color: string;
		lineStyle: LineStyle;
		lineWidth: number;
	}
	type AnyElement =
		| { kind: 'node'; data: LayoutNode }
		| { kind: 'member'; data: FrameMember }
		| { kind: 'constraint'; data: Constraint }
		| { kind: 'dimension'; data: Dimension }
		| { kind: 'refline'; data: RefLine };

	// ── State ──
	let activeTool = $state<Tool>('select');
	let viewSide = $state<ViewSide>('right');
	let nodes = $state<LayoutNode[]>([]);
	let members = $state<FrameMember[]>([]);
	let constraints = $state<Constraint[]>([]);
	let dimensions = $state<Dimension[]>([]);
	let refLines = $state<RefLine[]>([]);

	let selected = $state<AnyElement | null>(null);
	let hoveredNodeId = $state<string | null>(null);

	// Member drawing state
	let memberStartId = $state<string | null>(null);

	// Dimension drawing state
	let dimStartId = $state<string | null>(null);

	// Refline drawing state
	let reflineStart = $state<{ x: number; y: number } | null>(null);
	let reflinePreviewStyle = $state<LineStyle>('dashed-sm');

	// Edit popup state
	let editPopupVisible = $state(false);
	let editPopupX = $state(0);
	let editPopupY = $state(0);

	// View state
	let panX = $state(0);
	let panY = $state(200);
	let zoom = $state(2);
	let showGrid = $state(true);
	let showSnap = $state(true);
	let showOrigin = $state(true);
	let showGround = $state(true);
	let showRefLines = $state(true);
	let showScale = $state(true);
	let showFrontEnd = $state(true);
	let showRearEnd = $state(true);

	// UI dropdowns
	let showClearMenu = $state(false);
	let showSnapMenu = $state(false);
	let showDisplayMenu = $state(false);
	let showAnchorMenu = $state(false);
	let showPhotoMenu = $state(false);
	let anchorSubType = $state<'front_anchor' | 'rear_anchor'>('front_anchor');

	// Unit system
	type UnitSystem = 'metric' | 'us';
	let unitSystem = $state<UnitSystem>('metric');
	const EIGHTH_INCH_MM = 25.4 / 8;

	// Snap sizes per unit system
	const SNAP_OPTIONS_US = [
		{ value: 25.4 / 16, label: '1/16"' },
		{ value: 25.4 / 8, label: '1/8"' },
		{ value: 25.4 / 4, label: '1/4"' },
		{ value: 25.4 / 2, label: '1/2"' },
		{ value: 25.4, label: '1"' },
	];
	const SNAP_OPTIONS_METRIC = [
		{ value: 1, label: '1 mm' },
		{ value: 5, label: '5 mm' },
		{ value: 10, label: '10 mm' },
		{ value: 25, label: '25 mm' },
		{ value: 50, label: '50 mm' },
	];
	let snapSizeUS = $state(25.4 / 8);
	let snapSizeMetric = $state(25);
	const snapSize = $derived(unitSystem === 'metric' ? snapSizeMetric : snapSizeUS);

	// Save/Load state
	let vehicleName = $state(getLastFileName());
	let vehicleList = $state<{ name: string }[]>([]);
	let saveStatus = $state('');

	// ── Formatting helpers ──
	function fmtLen(mm: number): string {
		if (unitSystem === 'us') {
			const inches = mm / 25.4;
			const whole = Math.floor(inches);
			const frac = inches - whole;
			const eighths = Math.round(frac * 8);
			if (eighths === 0) return `${whole}"`;
			if (eighths === 8) return `${whole + 1}"`;
			return `${whole} ${eighths}/8"`;
		}
		return `${mm.toFixed(1)} mm`;
	}
	function fmtCoord(mm: number): string {
		if (unitSystem === 'us') return `${(mm / 25.4).toFixed(3)}"`;
		return `${mm.toFixed(0)}`;
	}
	function fmtSnapLabel(): string {
		if (unitSystem === 'us') {
			const opts = SNAP_OPTIONS_US;
			const match = opts.find(o => Math.abs(o.value - snapSizeUS) < 0.01);
			return match ? match.label : `${(snapSizeUS / 25.4).toFixed(3)}"`;
		}
		const opts = SNAP_OPTIONS_METRIC;
		const match = opts.find(o => Math.abs(o.value - snapSizeMetric) < 0.01);
		return match ? match.label : `${snapSizeMetric}mm`;
	}
	function fmtUnit(): string {
		return unitSystem === 'us' ? 'in' : 'mm';
	}
	function fmtDimLabel(mm: number): string {
		if (unitSystem === 'us') return `${(mm / 25.4).toFixed(3)}"`;
		return `${mm.toFixed(1)} mm`;
	}

	// Random color for reference lines
	function randomColor(): string {
		const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];
		return colors[Math.floor(Math.random() * colors.length)];
	}

	// Line style dash arrays
	function getLineDash(style: LineStyle): string {
		switch (style) {
			case 'dashed-sm': return '4,3';
			case 'dashed-lg': return '10,5';
			case 'solid': return '';
		}
	}
	const lineStyles: LineStyle[] = ['dashed-sm', 'dashed-lg', 'solid'];
	const lineStyleLabels: Record<LineStyle, string> = { 'dashed-sm': 'Small Dash', 'dashed-lg': 'Large Dash', 'solid': 'Solid' };

	// Layers
	let layers = $state({
		wheels: true,
		frontEnd: true,
		rearEnd: true,
		frame: true,
		anchors: true,
		steering: true,
		rearModule: true,
		rider: false,
		constraints: true,
		dimensions: true,
		reflines: true,
	});
	const layerLabels: Record<string, string> = {
		wheels: 'Wheels',
		frontEnd: 'Front End',
		rearEnd: 'Rear End',
		frame: 'Frame Geometry',
		anchors: 'Anchor Points',
		steering: 'Steering Geometry',
		rearModule: 'Rear Module',
		rider: 'Rider Overlay',
		constraints: 'Constraints',
		dimensions: 'Dimensions',
		reflines: 'Reference Lines',
	};

	// Envelope fallbacks are the Phase 1 mule, not a sport-bike (1500 mm / 27° / 312 mm).
	const MULE_WHEELBASE_MM = 2794;
	const MULE_SEAT_HEIGHT_MM = 406.4;
	const MULE_RAKE_DEG = 45;
	const MULE_FRONT_RADIUS_MM = 320;
	const MULE_REAR_RADIUS_MM = 406.4;
	const REF_IMAGE_FIT = 1.4;

	// Global vehicle params — overwritten from the loaded vehicle when present
	let wheelbaseMm = $state(MULE_WHEELBASE_MM);
	let seatHeightMm = $state(MULE_SEAT_HEIGHT_MM);
	let rakeAngleDeg = $state(MULE_RAKE_DEG);
	let frontWheelRadiusMm = $state(MULE_FRONT_RADIUS_MM);
	let rearWheelRadiusMm = $state(MULE_REAR_RADIUS_MM);

	// Tracing photo (bitmap is local-only; transform may persist in frame JSON)
	let refImageUrl = $state<string | null>(null);
	let refImageFileName = $state('');
	let refImageVisible = $state(true);
	let refImageOpacity = $state(0.65);
	let refImageOriginX = $state(0);
	let refImageOriginY = $state(0);
	let refImageWidthMm = $state(MULE_WHEELBASE_MM * REF_IMAGE_FIT);
	let refImageAspect = $state(9 / 16);
	let refImageAdjust = $state(false);
	let refImageInput = $state<HTMLInputElement | null>(null);
	let refImageDragOver = $state(false);
	let draggingRefImage = $state(false);
	let dragRefStartScreen = $state<[number, number]>([0, 0]);
	let dragRefStartOrigin = $state<[number, number]>([0, 0]);
	const refImageScalePct = $derived(Math.round(refImageWidthMm / Math.max(wheelbaseMm, 1) / REF_IMAGE_FIT * 100));

	function num(v: unknown): number | undefined {
		return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
	}

	function isLegacySportBikeEnvelope(wb: number, rake: number, frontR: number): boolean {
		return wb === 1500 && rake === 27 && frontR === 312;
	}

	function applyVehicleEnvelope(design: VehicleDesign) {
		const f = (design.frame ?? {}) as Record<string, unknown>;
		const v = (design.brakes?.vehicle ?? {}) as Record<string, unknown>;
		const fe = (design.frontEnd ?? {}) as Record<string, unknown>;
		const frameWb = num(f.wheelbaseMm);
		const frameRake = num(f.rakeAngleDeg);
		const frameFront = num(f.frontWheelRadiusMm);
		const skipLegacyFrame = frameWb != null && frameRake != null && frameFront != null
			&& isLegacySportBikeEnvelope(frameWb, frameRake, frameFront);

		wheelbaseMm = (!skipLegacyFrame ? frameWb : undefined) ?? num(v.wheelbaseMm) ?? MULE_WHEELBASE_MM;
		seatHeightMm = num(f.seatHeightMm) ?? MULE_SEAT_HEIGHT_MM;
		rakeAngleDeg = (!skipLegacyFrame ? frameRake : undefined) ?? num(fe.rakeAngleDeg) ?? MULE_RAKE_DEG;
		frontWheelRadiusMm = (!skipLegacyFrame ? frameFront : undefined) ?? num(v.frontTireRadiusMm) ?? MULE_FRONT_RADIUS_MM;
		rearWheelRadiusMm = (!skipLegacyFrame ? num(f.rearWheelRadiusMm) : undefined) ?? num(v.rearTireRadiusMm) ?? MULE_REAR_RADIUS_MM;
	}

	function refImageTransform() {
		return {
			visible: refImageVisible,
			opacity: refImageOpacity,
			originX: refImageOriginX,
			originY: refImageOriginY,
			widthMm: refImageWidthMm,
			aspect: refImageAspect,
			fileName: refImageFileName,
		};
	}

	function applyRefImageTransform(raw: unknown) {
		if (!raw || typeof raw !== 'object') return;
		const r = raw as Record<string, unknown>;
		if (typeof r.visible === 'boolean') refImageVisible = r.visible;
		if (typeof r.opacity === 'number') refImageOpacity = Math.min(1, Math.max(0.05, r.opacity));
		if (typeof r.originX === 'number') refImageOriginX = r.originX;
		if (typeof r.originY === 'number') refImageOriginY = r.originY;
		if (typeof r.widthMm === 'number' && r.widthMm > 0) refImageWidthMm = r.widthMm;
		if (typeof r.aspect === 'number' && r.aspect > 0) refImageAspect = r.aspect;
		if (typeof r.fileName === 'string') refImageFileName = r.fileName;
	}

	function fitRefImageToWheelbase() {
		refImageWidthMm = Math.max(100, wheelbaseMm * REF_IMAGE_FIT);
		const heightMm = refImageWidthMm * refImageAspect;
		refImageOriginX = -(refImageWidthMm - wheelbaseMm) / 2;
		refImageOriginY = 0;
		if (heightMm < frontWheelRadiusMm * 2) {
			refImageOriginY = -(heightMm * 0.15);
		}
	}

	function scaleRefImage(factor: number, centerX?: number, centerY?: number) {
		const heightMm = refImageWidthMm * refImageAspect;
		const cx = centerX ?? (refImageOriginX + refImageWidthMm / 2);
		const cy = centerY ?? (refImageOriginY + heightMm / 2);
		refImageWidthMm = Math.max(200, Math.min(30000, refImageWidthMm * factor));
		const newH = refImageWidthMm * refImageAspect;
		refImageOriginX = cx - refImageWidthMm / 2;
		refImageOriginY = cy - newH / 2;
	}

	function revokeRefImageUrl() {
		if (refImageUrl) {
			URL.revokeObjectURL(refImageUrl);
			refImageUrl = null;
		}
	}

	async function applyRefImageFile(file: File) {
		revokeRefImageUrl();
		const url = URL.createObjectURL(file);
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('image'));
			img.src = url;
		});
		refImageUrl = url;
		refImageFileName = file.name;
		refImageAspect = img.naturalHeight > 0 && img.naturalWidth > 0
			? img.naturalHeight / img.naturalWidth
			: 9 / 16;
		refImageVisible = true;
		refImageAdjust = true;
		if (refImageOpacity < 0.35) refImageOpacity = 0.65;
		fitRefImageToWheelbase();
		pendingFitView = true;
		if (canvasW > 50 && canvasH > 50) {
			resetView();
			pendingFitView = false;
		}
		await saveRefImageBlob(file.name, file);
	}

	async function onRefImageChosen(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			await applyRefImageFile(file);
		} catch {
			revokeRefImageUrl();
		}
		(e.target as HTMLInputElement).value = '';
		showPhotoMenu = false;
	}

	function setRefImageScalePct(pct: number) {
		const target = Math.max(200, wheelbaseMm * REF_IMAGE_FIT * (pct / 100));
		scaleRefImage(target / Math.max(refImageWidthMm, 1));
	}

	async function importImageFile(file: File | null | undefined) {
		if (!file || !file.type.startsWith('image/')) return;
		try {
			await applyRefImageFile(file);
		} catch {
			revokeRefImageUrl();
		}
	}

	function onCanvasDragOver(e: DragEvent) {
		if (e.dataTransfer?.types?.includes('Files')) {
			e.preventDefault();
			refImageDragOver = true;
		}
	}
	function onCanvasDragLeave() {
		refImageDragOver = false;
	}
	function onCanvasDrop(e: DragEvent) {
		e.preventDefault();
		refImageDragOver = false;
		const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
		void importImageFile(file);
	}

	function onPaste(e: ClipboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
		if (!item) return;
		e.preventDefault();
		void importImageFile(item.getAsFile());
	}

	async function clearRefImage() {
		revokeRefImageUrl();
		refImageFileName = '';
		refImageAdjust = false;
		await clearRefImageBlob();
		showPhotoMenu = false;
	}

	async function restoreRefImage() {
		const cached = await loadRefImageBlob();
		if (!cached) return;
		revokeRefImageUrl();
		const url = URL.createObjectURL(cached.blob);
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('image'));
			img.src = url;
		});
		refImageUrl = url;
		if (!refImageFileName) refImageFileName = cached.fileName;
		if (img.naturalWidth > 0 && img.naturalHeight > 0) {
			refImageAspect = img.naturalHeight / img.naturalWidth;
		}
	}

	onDestroy(() => revokeRefImageUrl());

	// Undo
	type Snapshot = {
		nodes: LayoutNode[];
		members: FrameMember[];
		constraints: Constraint[];
		dimensions: Dimension[];
		refLines: RefLine[];
	};
	let undoStack = $state<Snapshot[]>([]);
	let redoStack = $state<Snapshot[]>([]);

	function snapshot(): Snapshot {
		return {
			nodes: $state.snapshot(nodes) as LayoutNode[],
			members: $state.snapshot(members) as FrameMember[],
			constraints: $state.snapshot(constraints) as Constraint[],
			dimensions: $state.snapshot(dimensions) as Dimension[],
			refLines: $state.snapshot(refLines) as RefLine[],
		};
	}
	function pushUndo() {
		undoStack = [...undoStack, snapshot()];
		redoStack = [];
	}
	function undo() {
		if (undoStack.length === 0) return;
		redoStack = [...redoStack, snapshot()];
		const prev = undoStack[undoStack.length - 1];
		undoStack = undoStack.slice(0, -1);
		nodes = prev.nodes;
		members = prev.members;
		constraints = prev.constraints;
		dimensions = prev.dimensions;
		refLines = prev.refLines;
		selected = null;
	}
	function redo() {
		if (redoStack.length === 0) return;
		undoStack = [...undoStack, snapshot()];
		const next = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, -1);
		nodes = next.nodes;
		members = next.members;
		constraints = next.constraints;
		dimensions = next.dimensions;
		refLines = next.refLines;
		selected = null;
	}

	// ── Canvas refs ──
	let svgEl = $state<SVGSVGElement | null>(null);
	let canvasW = $state(1200);
	let canvasH = $state(800);

	// ── Coordinate transforms ──
	function worldToScreen(wx: number, wy: number): [number, number] {
		const effectiveX = viewSide === 'right' ? wx : -wx;
		const sx = (effectiveX - panX) * zoom + canvasW / 2;
		const sy = -(wy - panY) * zoom + canvasH / 2;
		return [sx, sy];
	}
	function screenToWorld(sx: number, sy: number): [number, number] {
		const effectiveX = (sx - canvasW / 2) / zoom + panX;
		const wx = viewSide === 'right' ? effectiveX : -effectiveX;
		const wy = -((sy - canvasH / 2) / zoom) + panY;
		return [wx, wy];
	}
	function snapWorld(v: number): number {
		if (!showSnap) return v;
		return Math.round(v / snapSize) * snapSize;
	}

	// ── Grid derived values ──
	// US grid levels: 1/8", 1/4", 1", 1' (in mm)
	const INCH_MM = 25.4;
	const GRID_LEVELS_US = [
		{ step: INCH_MM / 8, label: '1/8"' },   // 3.175mm
		{ step: INCH_MM / 4, label: '1/4"' },   // 6.35mm
		{ step: INCH_MM, label: '1"' },          // 25.4mm
		{ step: INCH_MM * 12, label: "1'" },     // 304.8mm
	];
	// Metric grid levels: 5mm, 10mm, 50mm, 100mm
	const GRID_LEVELS_METRIC = [
		{ step: 5, label: '5mm' },
		{ step: 10, label: '10mm' },
		{ step: 50, label: '50mm' },
		{ step: 100, label: '100mm' },
	];

	// Pick which grid levels to draw based on zoom (min ~8px between lines)
	const gridLevels = $derived((() => {
		const levels = unitSystem === 'us' ? GRID_LEVELS_US : GRID_LEVELS_METRIC;
		const result: { step: number; isMajor: boolean }[] = [];
		for (let i = 0; i < levels.length; i++) {
			const pxPerStep = levels[i].step * zoom;
			if (pxPerStep >= 8) {
				// Finest visible level = minor grid
				result.push({ step: levels[i].step, isMajor: false });
				// Next level up = major grid
				if (i + 1 < levels.length) {
					result.push({ step: levels[i + 1].step, isMajor: true });
				}
				break;
			}
		}
		// If nothing found (very zoomed out), use coarsest level
		if (result.length === 0) {
			result.push({ step: levels[levels.length - 1].step, isMajor: true });
		}
		return result;
	})());

	// ── viewBox bounds in world coords ──
	const viewLeft = $derived(panX - canvasW / (2 * zoom));
	const viewRight = $derived(panX + canvasW / (2 * zoom));
	const viewBottom = $derived(panY - canvasH / (2 * zoom));
	const viewTop = $derived(panY + canvasH / (2 * zoom));

	// ── ID gen ──
	let nextId = $state(1);
	function genId(prefix: string): string {
		return `${prefix}_${nextId++}`;
	}

	// ── Node helpers ──
	function nodeById(id: string): LayoutNode | undefined {
		return nodes.find((n) => n.id === id);
	}
	function findNodeNear(wx: number, wy: number, radiusMm: number = 15 / zoom): LayoutNode | null {
		let best: LayoutNode | null = null;
		let bestDist = radiusMm;
		for (const n of nodes) {
			const d = Math.hypot(n.x - wx, n.y - wy);
			if (d < bestDist) {
				bestDist = d;
				best = n;
			}
		}
		return best;
	}

	// ── Pointer helpers ──
	let isPanning = $state(false);
	let panStartScreen = $state<[number, number]>([0, 0]);
	let panStartWorld = $state<[number, number]>([0, 0]);
	let dragNode = $state<LayoutNode | null>(null);
	let dragStartWorld = $state<[number, number]>([0, 0]);

	let mouseWorldX = $state(0);
	let mouseWorldY = $state(0);

	function getSvgXY(e: MouseEvent): [number, number] {
		if (!svgEl) return [0, 0];
		const rect = svgEl.getBoundingClientRect();
		return [e.clientX - rect.left, e.clientY - rect.top];
	}

	// ── Pointer events ──
	function onPointerDown(e: MouseEvent) {
		if (!svgEl) return;
		const [sx, sy] = getSvgXY(e);
		const [wx, wy] = screenToWorld(sx, sy);

		// Close any open toolbar dropdowns
		showSnapMenu = false;
		showDisplayMenu = false;
		showClearMenu = false;
		showAnchorMenu = false;
		showPhotoMenu = false;

		if (editPopupVisible && activeTool !== 'edit') {
			editPopupVisible = false;
		}

		if (e.button === 1) {
			isPanning = true;
			panStartScreen = [sx, sy];
			panStartWorld = [panX, panY];
			e.preventDefault();
			return;
		}

		if (e.button !== 0) return;

		if (refImageAdjust && refImageUrl && refImageVisible) {
			draggingRefImage = true;
			dragRefStartScreen = [sx, sy];
			dragRefStartOrigin = [refImageOriginX, refImageOriginY];
			return;
		}

		if (activeTool === 'select') {
			const hit = findNodeNear(wx, wy);
			if (hit) {
				selected = { kind: 'node', data: hit };
				dragNode = hit;
				dragStartWorld = [hit.x, hit.y];
				pushUndo();
			} else {
				const memberHit = findMemberNear(wx, wy);
				if (memberHit) {
					selected = { kind: 'member', data: memberHit };
				} else {
					const refHit = findRefLineNear(wx, wy);
					if (refHit) {
						selected = { kind: 'refline', data: refHit };
					} else {
						selected = null;
						isPanning = true;
						panStartScreen = [sx, sy];
						panStartWorld = [panX, panY];
					}
				}
			}
		} else if (activeTool === 'edit') {
			const hit = findNodeNear(wx, wy);
			if (hit) {
				selected = { kind: 'node', data: hit };
				showEditPopup(sx, sy);
			} else {
				const memberHit = findMemberNear(wx, wy);
				if (memberHit) {
					selected = { kind: 'member', data: memberHit };
					showEditPopup(sx, sy);
				} else {
					const refHit = findRefLineNear(wx, wy);
					if (refHit) {
						selected = { kind: 'refline', data: refHit };
						showEditPopup(sx, sy);
					} else {
						selected = null;
						editPopupVisible = false;
					}
				}
			}
		} else if (activeTool === 'node') {
			pushUndo();
			const nx = snapWorld(wx);
			const ny = snapWorld(wy);
			const newNode: LayoutNode = {
				id: genId('n'),
				x: nx,
				y: ny,
				type: 'generic',
				label: '',
			};
			nodes = [...nodes, newNode];
			selected = { kind: 'node', data: newNode };
		} else if (activeTool === 'member') {
			const hit = findNodeNear(wx, wy);
			if (!hit) return;
			if (!memberStartId) {
				memberStartId = hit.id;
			} else {
				if (hit.id !== memberStartId) {
					pushUndo();
					const newMember: FrameMember = {
						id: genId('m'),
						startId: memberStartId,
						endId: hit.id,
						label: '',
						diameter: 25.4,
						thickness: 1.6,
					};
					members = [...members, newMember];
					selected = { kind: 'member', data: newMember };
				}
				memberStartId = null;
			}
		} else if (activeTool === 'dimension') {
			const hit = findNodeNear(wx, wy);
			if (!hit) return;
			if (!dimStartId) {
				dimStartId = hit.id;
			} else {
				if (hit.id !== dimStartId) {
					pushUndo();
					const newDim: Dimension = {
						id: genId('d'),
						startId: dimStartId,
						endId: hit.id,
						offset: 40,
					};
					dimensions = [...dimensions, newDim];
					selected = { kind: 'dimension', data: newDim };
				}
				dimStartId = null;
			}
		} else if (activeTool === 'constraint') {
			const hit = findNodeNear(wx, wy);
			if (hit) {
				pushUndo();
				const newC: Constraint = {
					id: genId('c'),
					type: 'fixed',
					nodeIds: [hit.id],
					value: 0,
				};
				constraints = [...constraints, newC];
				selected = { kind: 'constraint', data: newC };
			}
		} else if (activeTool === 'refline') {
			const snx = snapWorld(wx);
			const sny = snapWorld(wy);
			if (!reflineStart) {
				reflineStart = { x: snx, y: sny };
			} else {
				pushUndo();
				const newRL: RefLine = {
					id: genId('r'),
					x1: reflineStart.x, y1: reflineStart.y,
					x2: snx, y2: sny,
					label: '',
					color: randomColor(),
					lineStyle: reflinePreviewStyle,
					lineWidth: 1.5,
				};
				refLines = [...refLines, newRL];
				selected = { kind: 'refline', data: newRL };
				reflineStart = null;
			}
		} else if (activeTool === 'anchor') {
			pushUndo();
			const nx = snapWorld(wx);
			const ny = snapWorld(wy);
			// Only allow one of each anchor type
			const existing = nodes.find(n => n.type === anchorSubType);
			if (existing) {
				// Move existing anchor
				existing.x = nx;
				existing.y = ny;
				nodes = nodes;
				selected = { kind: 'node', data: existing };
			} else {
				const newNode: LayoutNode = {
					id: genId('a'),
					x: nx,
					y: ny,
					type: anchorSubType,
					label: anchorSubType === 'front_anchor' ? 'Front End' : 'Rear End',
				};
				nodes = [...nodes, newNode];
				selected = { kind: 'node', data: newNode };
			}
		}
	}

	function showEditPopup(sx: number, sy: number) {
		editPopupX = sx;
		editPopupY = sy;
		editPopupVisible = true;
	}

	function onPointerMove(e: MouseEvent) {
		if (!svgEl) return;
		const [sx, sy] = getSvgXY(e);
		const [wx, wy] = screenToWorld(sx, sy);
		mouseWorldX = snapWorld(wx);
		mouseWorldY = snapWorld(wy);

		if (draggingRefImage) {
			const dx = (sx - dragRefStartScreen[0]) / zoom;
			const dy = (sy - dragRefStartScreen[1]) / zoom;
			refImageOriginX = dragRefStartOrigin[0] + (viewSide === 'right' ? dx : -dx);
			refImageOriginY = dragRefStartOrigin[1] - dy;
			return;
		}
		if (isPanning) {
			const dx = (sx - panStartScreen[0]) / zoom;
			const dy = (sy - panStartScreen[1]) / zoom;
			panX = panStartWorld[0] - dx;
			panY = panStartWorld[1] + dy;
			return;
		}
		if (dragNode) {
			dragNode.x = snapWorld(wx);
			dragNode.y = snapWorld(wy);
			nodes = nodes;
			return;
		}
	}

	function onPointerUp(_e: MouseEvent) {
		isPanning = false;
		draggingRefImage = false;
		if (dragNode) {
			dragNode = null;
		}
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();

		// If drawing refline, cycle line style with wheel
		if (activeTool === 'refline' && reflineStart) {
			const idx = lineStyles.indexOf(reflinePreviewStyle);
			if (e.deltaY > 0) {
				reflinePreviewStyle = lineStyles[(idx + 1) % lineStyles.length];
			} else {
				reflinePreviewStyle = lineStyles[(idx - 1 + lineStyles.length) % lineStyles.length];
			}
			return;
		}

		if (refImageUrl && refImageVisible && (refImageAdjust || e.shiftKey)) {
			const factor = e.deltaY > 0 ? 0.95 : 1.05;
			const [imgSx, imgSy] = getSvgXY(e);
			const [wx, wy] = screenToWorld(imgSx, imgSy);
			scaleRefImage(factor, wx, wy);
			return;
		}

		const factor = e.deltaY > 0 ? 0.9 : 1.1;
		const newZoom = Math.max(0.02, Math.min(20, zoom * factor));

		const [sx, sy] = getSvgXY(e);
		const [wx, wy] = screenToWorld(sx, sy);
		zoom = newZoom;
		panX = (viewSide === 'right' ? wx : -wx) - (sx - canvasW / 2) / newZoom;
		panY = wy + (sy - canvasH / 2) / newZoom;
	}

	// ── Member hit test ──
	function findMemberNear(wx: number, wy: number): FrameMember | null {
		const thresh = 10 / zoom;
		for (const m of members) {
			const a = nodeById(m.startId);
			const b = nodeById(m.endId);
			if (!a || !b) continue;
			const dx = b.x - a.x, dy = b.y - a.y;
			const len2 = dx * dx + dy * dy;
			if (len2 < 1) continue;
			let t = ((wx - a.x) * dx + (wy - a.y) * dy) / len2;
			t = Math.max(0, Math.min(1, t));
			const px = a.x + t * dx, py = a.y + t * dy;
			if (Math.hypot(wx - px, wy - py) < thresh) return m;
		}
		return null;
	}

	// ── RefLine hit test ──
	function findRefLineNear(wx: number, wy: number): RefLine | null {
		const thresh = 10 / zoom;
		for (const rl of refLines) {
			const dx = rl.x2 - rl.x1, dy = rl.y2 - rl.y1;
			const len2 = dx * dx + dy * dy;
			if (len2 < 1) continue;
			let t = ((wx - rl.x1) * dx + (wy - rl.y1) * dy) / len2;
			t = Math.max(0, Math.min(1, t));
			const px = rl.x1 + t * dx, py = rl.y1 + t * dy;
			if (Math.hypot(wx - px, wy - py) < thresh) return rl;
		}
		return null;
	}

	// ── Delete selected ──
	function deleteSelected() {
		if (!selected) return;
		pushUndo();
		if (selected.kind === 'node') {
			const id = selected.data.id;
			nodes = nodes.filter((n) => n.id !== id);
			members = members.filter((m) => m.startId !== id && m.endId !== id);
			dimensions = dimensions.filter((d) => d.startId !== id && d.endId !== id);
			constraints = constraints.filter((c) => !c.nodeIds.includes(id));
		} else if (selected.kind === 'member') {
			members = members.filter((m) => m.id !== selected!.data.id);
		} else if (selected.kind === 'constraint') {
			constraints = constraints.filter((c) => c.id !== (selected!.data as Constraint).id);
		} else if (selected.kind === 'dimension') {
			dimensions = dimensions.filter((d) => d.id !== (selected!.data as Dimension).id);
		} else if (selected.kind === 'refline') {
			refLines = refLines.filter((r) => r.id !== (selected!.data as RefLine).id);
		}
		selected = null;
		editPopupVisible = false;
	}

	// ── Clear functions ──
	function clearAll() {
		pushUndo();
		nodes = []; members = []; constraints = []; dimensions = []; refLines = [];
		selected = null; editPopupVisible = false; showClearMenu = false;
	}
	function clearNodes() {
		pushUndo();
		nodes = [];
		members = []; dimensions = []; constraints = []; // dependent on nodes
		selected = null; editPopupVisible = false; showClearMenu = false;
	}
	function clearMembers() {
		pushUndo(); members = []; selected = null; editPopupVisible = false; showClearMenu = false;
	}
	function clearConstraints() {
		pushUndo(); constraints = []; selected = null; editPopupVisible = false; showClearMenu = false;
	}
	function clearDimensions() {
		pushUndo(); dimensions = []; selected = null; editPopupVisible = false; showClearMenu = false;
	}
	function clearRefLines() {
		pushUndo(); refLines = []; selected = null; editPopupVisible = false; showClearMenu = false;
	}

	// ── Key handling ──
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selected && !(e.target instanceof HTMLInputElement)) {
				deleteSelected();
				e.preventDefault();
			}
		}
		if (e.key === 'Escape') {
			selected = null;
			memberStartId = null;
			dimStartId = null;
			reflineStart = null;
			editPopupVisible = false;
			refImageAdjust = false;
		}
		if (e.metaKey || e.ctrlKey) {
			if (e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
			if (e.key === 'y') { e.preventDefault(); redo(); }
		}
		if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
			if (e.key === 'v' || e.key === '1') { activeTool = 'select'; refImageAdjust = false; }
			if (e.key === 'n' || e.key === '2') { activeTool = 'node'; refImageAdjust = false; }
			if (e.key === 'm' || e.key === '3') { activeTool = 'member'; refImageAdjust = false; }
			if (e.key === 'c' || e.key === '4') { activeTool = 'constraint'; refImageAdjust = false; }
			if (e.key === 'd' || e.key === '5') { activeTool = 'dimension'; refImageAdjust = false; }
			if (e.key === 'r' || e.key === '6') { activeTool = 'refline'; refImageAdjust = false; }
			if (e.key === 'e' || e.key === '7') { activeTool = 'edit'; refImageAdjust = false; }
			if (e.key === 'a' || e.key === '8') { activeTool = 'anchor'; refImageAdjust = false; }
			if (e.key === 'g') showGrid = !showGrid;
			if (e.key === 's' && !e.metaKey && !e.ctrlKey) showSnap = !showSnap;
		}
	}

	// ── localStorage persistence ──
	const STORAGE_KEY = 'mototelos_frame_geometry_layout';

	function saveState() {
		const data = {
			nodes, members, constraints, dimensions, refLines,
			panX, panY, zoom, wheelbaseMm, seatHeightMm, rakeAngleDeg,
			frontWheelRadiusMm, rearWheelRadiusMm, nextId, layers, unitSystem, viewSide,
			snapSizeUS, snapSizeMetric, showGrid, showSnap, showOrigin, showGround, showRefLines, showScale,
			showFrontEnd, showRearEnd,
			refImage: refImageTransform(),
		};
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
	}
	function loadState(): boolean {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return false;
			const data = JSON.parse(raw);
			nodes = data.nodes ?? [];
			members = data.members ?? [];
			constraints = data.constraints ?? [];
			dimensions = data.dimensions ?? [];
			refLines = data.refLines ?? [];
			panX = data.panX ?? 0;
			panY = data.panY ?? 200;
			zoom = data.zoom ?? 2;
			wheelbaseMm = data.wheelbaseMm ?? MULE_WHEELBASE_MM;
			seatHeightMm = data.seatHeightMm ?? MULE_SEAT_HEIGHT_MM;
			rakeAngleDeg = data.rakeAngleDeg ?? MULE_RAKE_DEG;
			frontWheelRadiusMm = data.frontWheelRadiusMm ?? MULE_FRONT_RADIUS_MM;
			rearWheelRadiusMm = data.rearWheelRadiusMm ?? MULE_REAR_RADIUS_MM;
			nextId = data.nextId ?? 1;
			unitSystem = data.unitSystem ?? 'metric';
			viewSide = data.viewSide ?? 'right';
			if (data.snapSizeUS != null) snapSizeUS = data.snapSizeUS;
			if (data.snapSizeMetric != null) snapSizeMetric = data.snapSizeMetric;
			if (data.showGrid != null) showGrid = data.showGrid;
			if (data.showSnap != null) showSnap = data.showSnap;
			if (data.showOrigin != null) showOrigin = data.showOrigin;
			if (data.showGround != null) showGround = data.showGround;
			if (data.showRefLines != null) showRefLines = data.showRefLines;
			if (data.showScale != null) showScale = data.showScale;
			if (data.showFrontEnd != null) showFrontEnd = data.showFrontEnd;
			if (data.showRearEnd != null) showRearEnd = data.showRearEnd;
			if (data.layers) {
				for (const k of Object.keys(layers)) {
					if (k in data.layers) (layers as any)[k] = data.layers[k];
				}
			}
			applyRefImageTransform(data.refImage);
			return true;
		} catch {
			return false;
		}
	}

	let didHydrate = false;
	let pendingFitView = $state(false);
	$effect(() => {
		if (didHydrate) return;
		didHydrate = true;
		const hadLocal = loadState();
		void (async () => {
			await restoreRefImage();
			const name = getLastFileName();
			const design = name ? await loadVehicleDesign(name) : null;
			const usedLegacy = isLegacySportBikeEnvelope(wheelbaseMm, rakeAngleDeg, frontWheelRadiusMm);
			if (design) {
				if (!hadLocal) {
					if (design.frame) {
						const f = design.frame as Record<string, unknown>;
						nodes = (f.nodes as LayoutNode[]) ?? [];
						members = (f.members as FrameMember[]) ?? [];
						constraints = (f.constraints as Constraint[]) ?? [];
						dimensions = (f.dimensions as Dimension[]) ?? [];
						refLines = (f.refLines as RefLine[]) ?? [];
						nextId = num(f.nextId) ?? 1;
						unitSystem = (f.unitSystem as UnitSystem) ?? 'metric';
						viewSide = (f.viewSide as ViewSide) ?? 'right';
						if (f.layers && typeof f.layers === 'object') {
							for (const k of Object.keys(layers)) {
								if (k in (f.layers as Record<string, unknown>)) {
									(layers as any)[k] = (f.layers as any)[k];
								}
							}
						}
						applyRefImageTransform(f.refImage);
					}
					applyVehicleEnvelope(design);
					vehicleName = name;
					pendingFitView = true;
				} else {
					applyVehicleEnvelope(design);
					if (usedLegacy) pendingFitView = true;
				}
			}
			await loadFrontEndData();
		})();
	});
	$effect(() => {
		const _ = [nodes, members, constraints, dimensions, refLines, panX, panY, zoom,
			wheelbaseMm, seatHeightMm, rakeAngleDeg, frontWheelRadiusMm, rearWheelRadiusMm, layers, unitSystem, viewSide,
			snapSizeUS, snapSizeMetric, showGrid, showSnap, showOrigin, showGround, showRefLines, showScale,
			showFrontEnd, showRearEnd,
			refImageVisible, refImageOpacity, refImageOriginX, refImageOriginY, refImageWidthMm, refImageAspect, refImageFileName];
		saveState();
	});

	// ── Vehicle file save/load ──
	async function refreshVehicleList() {
		vehicleList = await listVehicles();
	}

	async function saveToFile() {
		if (!vehicleName.trim()) return;
		const existing = await loadVehicleDesign(vehicleName);
		const design: VehicleDesign = {
			...(existing || {}),
			name: vehicleName,
			version: (existing?.version || 0) + 1,
			savedAt: new Date().toISOString(),
			frame: {
				nodes, members, constraints, dimensions, refLines,
				wheelbaseMm, seatHeightMm, rakeAngleDeg,
				frontWheelRadiusMm, rearWheelRadiusMm, nextId, layers, unitSystem, viewSide,
				refImage: refImageTransform(),
			},
		};
		const ok = await saveVehicleDesign(design);
		saveStatus = ok ? 'Saved' : 'Error';
		setTimeout(() => saveStatus = '', 2000);
		await refreshVehicleList();
	}

	async function loadFromFile(name: string) {
		const design = await loadVehicleDesign(name);
		if (!design) { saveStatus = 'Not found'; setTimeout(() => saveStatus = '', 2000); return; }
		const f = (design.frame ?? {}) as Record<string, unknown>;
		if (design.frame) {
			nodes = (f.nodes as LayoutNode[]) ?? [];
			members = (f.members as FrameMember[]) ?? [];
			constraints = (f.constraints as Constraint[]) ?? [];
			dimensions = (f.dimensions as Dimension[]) ?? [];
			refLines = (f.refLines as RefLine[]) ?? [];
			nextId = num(f.nextId) ?? 1;
			unitSystem = (f.unitSystem as UnitSystem) ?? 'metric';
			viewSide = (f.viewSide as ViewSide) ?? 'right';
			if (f.layers && typeof f.layers === 'object') {
				for (const k of Object.keys(layers)) {
					if (k in (f.layers as Record<string, unknown>)) {
						(layers as any)[k] = (f.layers as any)[k];
					}
				}
			}
			applyRefImageTransform(f.refImage);
		}
		applyVehicleEnvelope(design);
		vehicleName = name;
		setLastFileName(name);
		saveStatus = 'Loaded';
		setTimeout(() => saveStatus = '', 2000);
		selected = null;
		await loadFrontEndData();
	}

	function resetView() {
		panX = wheelbaseMm / 2;
		panY = 400;
		zoom = canvasW > 0 ? canvasW / (wheelbaseMm * 1.4) : 2;
	}

	$effect(() => { refreshVehicleList(); });

	// ── Front End geometry from saved vehicle design ──
	let frontEndData = $state<any>(null);
	let frontEndResults = $state<FrontEndResults | null>(null);
	let frontEndTire = $state<TireDimensions | null>(null);

	// Load front end data whenever vehicle name changes or on mount
	async function loadFrontEndData() {
		if (!vehicleName.trim()) { frontEndData = null; frontEndResults = null; frontEndTire = null; return; }
		try {
			const design = await loadVehicleDesign(vehicleName);
			if (design?.frontEnd) {
				frontEndData = design.frontEnd;
				const fe = design.frontEnd as any;
				const tireStr = fe.tireDesignation || '120/70ZR17';
				const parsed = parseTireDesignation(tireStr);
				const tire = computeTireDimensions(parsed);
				frontEndTire = tire;
				const inputs: FrontEndInputs = {
					suspensionType: fe.suspensionType || 'telescopic',
					rakeAngleDeg: fe.rakeAngleDeg ?? rakeAngleDeg,
					forkOffsetMm: fe.forkOffsetMm ?? 40,
					linkLengthMm: fe.linkLengthMm ?? 200,
					linkOffsetMm: fe.linkOffsetMm ?? 0,
					steeringColumnHeightMm: fe.steeringColumnHeightMm ?? 200,
					forkLengthMm: fe.forkLengthMm ?? 600,
				};
				frontEndResults = computeFrontEnd(inputs, tire);
			} else {
				frontEndData = null; frontEndResults = null; frontEndTire = null;
			}
		} catch { frontEndData = null; frontEndResults = null; frontEndTire = null; }
	}

	// Helper: get anchor node by type
	function getAnchorNode(type: 'front_anchor' | 'rear_anchor'): LayoutNode | undefined {
		return nodes.find(n => n.type === type);
	}

	// ── Derived geometry for wheel/steering references ──
	const rearContactX = $derived(0);
	const frontContactX = $derived(wheelbaseMm);
	const frontAxleY = $derived(frontWheelRadiusMm);
	const rearAxleY = $derived(rearWheelRadiusMm);
	const rakeRad = $derived(rakeAngleDeg * Math.PI / 180);

	// Node type display config
	const nodeTypeColors: Record<NodeType, string> = {
		generic: '#94a3b8',
		steering_head: '#f97316',
		rear_axle: '#22d3ee',
		rear_module: '#a78bfa',
		engine: '#ef4444',
		seat: '#fbbf24',
		rider: '#34d399',
		anchor: '#f472b6',
		front_anchor: '#f97316',
		rear_anchor: '#22d3ee',
	};
	const nodeTypeLabels: Record<NodeType, string> = {
		generic: 'Generic',
		steering_head: 'Steering Head',
		rear_axle: 'Rear Axle',
		rear_module: 'Rear Module',
		engine: 'Engine',
		seat: 'Seat',
		rider: 'Rider',
		anchor: 'Anchor',
		front_anchor: 'Front End Anchor',
		rear_anchor: 'Rear End Anchor',
	};

	// Tool config
	const tools: { id: Tool; label: string; icon: string; shortcut: string }[] = [
		{ id: 'select', label: 'Select / Move', icon: '\u21F2', shortcut: 'V' },
		{ id: 'edit', label: 'Edit', icon: '\u270E', shortcut: 'E' },
		{ id: 'node', label: 'Node', icon: '\u25C9', shortcut: 'N' },
		{ id: 'member', label: 'Frame Member', icon: '\u2571', shortcut: 'M' },
		{ id: 'constraint', label: 'Constraint', icon: '\u25BD', shortcut: 'C' },
		{ id: 'dimension', label: 'Dimension', icon: '\u2194', shortcut: 'D' },
		{ id: 'refline', label: 'Reference Line', icon: '\u2504', shortcut: 'R' },
		{ id: 'anchor', label: 'Anchor', icon: '\u2693', shortcut: 'A' },
	];

	// ResizeObserver for canvas
	let containerEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				canvasW = entry.contentRect.width;
				canvasH = entry.contentRect.height;
			}
			if (pendingFitView && canvasW > 50 && canvasH > 50) {
				resetView();
				pendingFitView = false;
			}
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});
	$effect(() => {
		if (pendingFitView && canvasW > 50 && canvasH > 50) {
			resetView();
			pendingFitView = false;
		}
	});
</script>

<svelte:window onkeydown={onKeyDown} onpaste={onPaste} />

<div class="flex flex-col w-full h-[min(96vh,1040px)] min-h-[640px] rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
	<!-- Top Toolbar -->
	<div class="flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-3 py-1.5 text-xs shrink-0 flex-wrap">
		<select class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
			bind:value={viewSide}>
			<option value="right">Right Side</option>
			<option value="left">Left Side</option>
		</select>
		<div class="w-px h-4 bg-gray-700"></div>
		<button class="px-2 py-1 rounded hover:bg-gray-800 text-gray-400 disabled:opacity-30" onclick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)">↩ Undo</button>
		<button class="px-2 py-1 rounded hover:bg-gray-800 text-gray-400 disabled:opacity-30" onclick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)">↪ Redo</button>
		<div class="w-px h-4 bg-gray-700"></div>
		<button class="px-2 py-1 rounded hover:bg-gray-800 text-gray-400" onclick={resetView} title="Reset View">⊞ Reset</button>

		<!-- Snap dropdown -->
		<div class="relative">
			<button class="px-2 py-1 rounded hover:bg-gray-800 {showSnap ? 'text-orange-400' : 'text-gray-500'}"
				onclick={() => { showSnapMenu = !showSnapMenu; showClearMenu = false; showDisplayMenu = false; showPhotoMenu = false; }}
				title="Snap Settings (S)">⊹ Snap {fmtSnapLabel()}</button>
			{#if showSnapMenu}
				<div class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 z-50 min-w-[120px]">
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 {showSnap ? 'text-orange-400' : 'text-gray-400'}"
						onclick={() => { showSnap = !showSnap; }}>
						{showSnap ? '✓' : '  '} Enabled
					</button>
					<div class="border-t border-gray-700 my-1"></div>
					{#each (unitSystem === 'us' ? SNAP_OPTIONS_US : SNAP_OPTIONS_METRIC) as opt}
						<button class="w-full text-left px-3 py-1 hover:bg-gray-700 {Math.abs(snapSize - opt.value) < 0.01 ? 'text-orange-400' : 'text-gray-300'}"
							onclick={() => { if (unitSystem === 'us') snapSizeUS = opt.value; else snapSizeMetric = opt.value; showSnapMenu = false; }}>
							{Math.abs(snapSize - opt.value) < 0.01 ? '●' : '○'} {opt.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Display / Visibility dropdown -->
		<div class="relative">
			<button class="px-2 py-1 rounded hover:bg-gray-800 text-gray-400"
				onclick={() => { showDisplayMenu = !showDisplayMenu; showSnapMenu = false; showClearMenu = false; showPhotoMenu = false; }}
				title="Display Options">👁 Display</button>
			{#if showDisplayMenu}
				<div class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 z-50 min-w-[160px] max-h-[min(70vh,420px)] overflow-y-auto">
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 {showGrid ? 'text-orange-400' : 'text-gray-400'}"
						onclick={() => showGrid = !showGrid}>
						{showGrid ? '✓' : '  '} Grid
					</button>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 {showOrigin ? 'text-orange-400' : 'text-gray-400'}"
						onclick={() => showOrigin = !showOrigin}>
						{showOrigin ? '✓' : '  '} Origin
					</button>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 {showGround ? 'text-orange-400' : 'text-gray-400'}"
						onclick={() => showGround = !showGround}>
						{showGround ? '✓' : '  '} Ground
					</button>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 {showRefLines ? 'text-orange-400' : 'text-gray-400'}"
						onclick={() => showRefLines = !showRefLines}>
						{showRefLines ? '✓' : '  '} Ref Lines
					</button>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 {showScale ? 'text-orange-400' : 'text-gray-400'}"
						onclick={() => showScale = !showScale}>
						{showScale ? '✓' : '  '} Scale
					</button>
					<div class="border-t border-gray-700 my-1"></div>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 {showFrontEnd ? 'text-orange-400' : 'text-gray-400'}"
						onclick={() => showFrontEnd = !showFrontEnd}>
						{showFrontEnd ? '✓' : '  '} Front End
					</button>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 {showRearEnd ? 'text-cyan-400' : 'text-gray-400'}"
						onclick={() => showRearEnd = !showRearEnd}>
						{showRearEnd ? '✓' : '  '} Rear End
					</button>
					<div class="border-t border-gray-700 my-1"></div>
					<div class="px-3 py-1 text-[9px] text-gray-600 uppercase tracking-widest">Layers</div>
					{#each Object.entries(layers) as [key, visible]}
						<button class="w-full text-left px-3 py-1 hover:bg-gray-700 {visible ? 'text-orange-400' : 'text-gray-400'}"
							onclick={() => (layers as any)[key] = !visible}>
							{visible ? '✓' : '  '} {layerLabels[key]}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<input type="file" accept="image/*" class="hidden" bind:this={refImageInput} onchange={onRefImageChosen} />
		<button class="px-2 py-1 rounded hover:bg-gray-800 {refImageUrl && refImageVisible ? 'text-orange-400' : 'text-gray-300'}"
			onclick={() => { showPhotoMenu = false; showSnapMenu = false; showClearMenu = false; showDisplayMenu = false; refImageInput?.click(); }}
			title="Import a shop photo or screencap as a tracing background">Import screencap</button>

		<!-- Clear dropdown -->
		<div class="relative">
			<button class="px-2 py-1 rounded hover:bg-gray-800 text-red-400/70 hover:text-red-400"
				onclick={() => { showClearMenu = !showClearMenu; showSnapMenu = false; showDisplayMenu = false; showPhotoMenu = false; }}
				title="Clear Entities">🗑 Clear</button>
			{#if showClearMenu}
				<div class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 z-50 min-w-[140px]">
					<button class="w-full text-left px-3 py-1 hover:bg-red-900/40 text-red-400 font-semibold"
						onclick={clearAll}>Clear All</button>
					<div class="border-t border-gray-700 my-1"></div>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 text-gray-300"
						onclick={clearNodes}>Nodes ({nodes.length})</button>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 text-gray-300"
						onclick={clearMembers}>Members ({members.length})</button>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 text-gray-300"
						onclick={clearConstraints}>Constraints ({constraints.length})</button>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 text-gray-300"
						onclick={clearDimensions}>Dimensions ({dimensions.length})</button>
					<button class="w-full text-left px-3 py-1 hover:bg-gray-700 text-gray-300"
						onclick={clearRefLines}>Ref Lines ({refLines.length})</button>
				</div>
			{/if}
		</div>

		<div class="w-px h-4 bg-gray-700"></div>
		<button class="px-2 py-1 rounded hover:bg-gray-800 {unitSystem === 'metric' ? 'text-orange-400' : 'text-gray-500'}" onclick={() => unitSystem = 'metric'} title="Metric (mm)">mm</button>
		<button class="px-2 py-1 rounded hover:bg-gray-800 {unitSystem === 'us' ? 'text-orange-400' : 'text-gray-500'}" onclick={() => unitSystem = 'us'} title="US (inches)">in</button>
		<div class="w-px h-4 bg-gray-700"></div>
		<span class="text-gray-600">Zoom: {(zoom * 100).toFixed(0)}%</span>
		<span class="text-gray-600 ml-2">({fmtCoord(mouseWorldX)}, {fmtCoord(mouseWorldY)})</span>
		<div class="flex-1"></div>
		<!-- Save/Load -->
		<div class="flex items-center gap-1">
			<input type="text" class="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-200 text-xs"
				bind:value={vehicleName} placeholder="filename" />
			<button class="px-2 py-1 rounded bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 text-xs" onclick={saveToFile}>Save</button>
			<select class="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-gray-200 text-xs w-20"
				onchange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) loadFromFile(v); }}
				onfocus={() => refreshVehicleList()}>
				<option value="">Load...</option>
				{#each vehicleList as v}
					<option value={v.name}>{v.name}</option>
				{/each}
			</select>
			{#if saveStatus}
				<span class="text-green-400 text-xs">{saveStatus}</span>
			{/if}
		</div>
		{#if selected}
			<button class="px-2 py-1 rounded hover:bg-red-900/40 text-red-400" onclick={deleteSelected} title="Delete (Del)">✕ Delete</button>
		{/if}
	</div>

	{#if refImageUrl || refImageFileName}
		<div class="flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-3 py-1 text-xs shrink-0 flex-wrap">
			<span class="text-orange-400/90 truncate max-w-[160px]" title={refImageFileName}>{refImageFileName || 'Screencap'}</span>
			<label class="flex items-center gap-1 text-gray-400">
				Scale
				<input type="range" min="25" max="400" step="1" class="w-28 accent-orange-500"
					value={refImageScalePct} disabled={!refImageUrl}
					oninput={(e) => setRefImageScalePct(Number((e.target as HTMLInputElement).value))} />
				<span class="font-mono text-gray-300 w-9">{refImageScalePct}%</span>
			</label>
			<label class="flex items-center gap-1 text-gray-400">
				Fade
				<input type="range" min="0.05" max="1" step="0.05" class="w-20 accent-orange-500"
					bind:value={refImageOpacity} disabled={!refImageUrl} />
			</label>
			<button class="px-2 py-0.5 rounded hover:bg-gray-800 {refImageAdjust ? 'text-orange-400' : 'text-gray-400'}"
				onclick={() => refImageAdjust = !refImageAdjust} disabled={!refImageUrl}
				title="Drag to pan, scroll to scale">
				{refImageAdjust ? 'Lock photo' : 'Move / scale'}
			</button>
			<button class="px-2 py-0.5 rounded hover:bg-gray-800 text-gray-400" onclick={fitRefImageToWheelbase} disabled={!refImageUrl}>Fit</button>
			<button class="px-2 py-0.5 rounded hover:bg-gray-800 {refImageVisible ? 'text-gray-300' : 'text-gray-600'}"
				onclick={() => refImageVisible = !refImageVisible} disabled={!refImageUrl}>
				{refImageVisible ? 'Hide' : 'Show'}
			</button>
			<button class="px-2 py-0.5 rounded hover:bg-gray-800 text-red-400/80" onclick={clearRefImage}>Clear</button>
			<span class="text-[10px] text-gray-600">Drop a file on the canvas or paste a screenshot. Not stored in the vehicle graph.</span>
		</div>
	{/if}

	<div class="flex flex-1 overflow-hidden">
		<!-- Left Tool Palette -->
		<div class="w-14 shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col items-center py-2 gap-1">
			{#each tools as tool}
				{#if tool.id === 'anchor'}
					<!-- Anchor tool with sub-menu -->
					<div class="relative">
						<button
							type="button"
							class="w-10 h-10 flex flex-col items-center justify-center rounded text-xs transition-colors
								{activeTool === 'anchor'
									? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
									: 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}"
							onclick={() => { showAnchorMenu = !showAnchorMenu; }}
							title="{tool.label} ({tool.shortcut})"
						>
							<span class="text-base leading-none">{tool.icon}</span>
							<span class="text-[8px] mt-0.5 leading-none">{tool.shortcut}</span>
						</button>
						{#if showAnchorMenu}
							<div class="absolute left-12 top-0 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 z-50 min-w-[130px]">
								<button class="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-xs {anchorSubType === 'front_anchor' && activeTool === 'anchor' ? 'text-orange-400' : 'text-gray-300'}"
									onclick={() => { anchorSubType = 'front_anchor'; activeTool = 'anchor'; refImageAdjust = false; showAnchorMenu = false; memberStartId = null; dimStartId = null; reflineStart = null; editPopupVisible = false; }}>
									⚓ Front End Anchor
								</button>
								<button class="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-xs {anchorSubType === 'rear_anchor' && activeTool === 'anchor' ? 'text-cyan-400' : 'text-gray-300'}"
									onclick={() => { anchorSubType = 'rear_anchor'; activeTool = 'anchor'; refImageAdjust = false; showAnchorMenu = false; memberStartId = null; dimStartId = null; reflineStart = null; editPopupVisible = false; }}>
									⚓ Rear End Anchor
								</button>
							</div>
						{/if}
					</div>
				{:else}
				<button
					type="button"
					class="w-10 h-10 flex flex-col items-center justify-center rounded text-xs transition-colors
						{activeTool === tool.id
							? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
							: 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}"
					onclick={() => { activeTool = tool.id; refImageAdjust = false; memberStartId = null; dimStartId = null; reflineStart = null; editPopupVisible = false; showAnchorMenu = false; }}
					title="{tool.label} ({tool.shortcut})"
				>
					<span class="text-base leading-none">{tool.icon}</span>
					<span class="text-[8px] mt-0.5 leading-none">{tool.shortcut}</span>
				</button>
				{/if}
			{/each}

			<div class="flex-1"></div>
		</div>

		<!-- Central Canvas -->
		<div class="flex-1 relative overflow-hidden" bind:this={containerEl}
			role="region"
			aria-label="Geometry layout canvas"
			ondragover={onCanvasDragOver}
			ondragleave={onCanvasDragLeave}
			ondrop={onCanvasDrop}>
			<svg
				bind:this={svgEl}
				width={canvasW}
				height={canvasH}
				class="absolute inset-0"
				style="cursor: {refImageAdjust ? (draggingRefImage ? 'grabbing' : 'grab') : activeTool === 'select' ? (isPanning ? 'grabbing' : 'default') : activeTool === 'edit' ? 'pointer' : 'crosshair'};"
				onpointerdown={onPointerDown}
				onpointermove={onPointerMove}
				onpointerup={onPointerUp}
				onwheel={onWheel}
				oncontextmenu={(e) => e.preventDefault()}
			>
				<rect x="0" y="0" width={canvasW} height={canvasH} fill="#0a0a0f" />

				<!-- Grid -->
				{#if showGrid}
					{#each gridLevels as level}
						{@const gLeft = Math.floor(viewLeft / level.step) * level.step}
						{@const gRight = Math.ceil(viewRight / level.step) * level.step}
						{@const gBottom = Math.floor(viewBottom / level.step) * level.step}
						{@const gTop = Math.ceil(viewTop / level.step) * level.step}
						{@const maxLines = 300}
						{@const nCols = Math.min(maxLines, Math.ceil((gRight - gLeft) / level.step) + 1)}
						{@const nRows = Math.min(maxLines, Math.ceil((gTop - gBottom) / level.step) + 1)}
						{#each { length: nCols } as _, i}
							{@const wx = gLeft + i * level.step}
							{@const effX = viewSide === 'right' ? wx : -wx}
							{@const sx = (effX - panX) * zoom + canvasW / 2}
							<line x1={sx} y1="0" x2={sx} y2={canvasH}
								stroke={level.isMajor ? '#1e293b' : '#111827'}
								stroke-width={level.isMajor ? 1 : 0.5}
								opacity={refImageUrl && refImageVisible ? 0.35 : 1} />
						{/each}
						{#each { length: nRows } as _, i}
							{@const wy = gBottom + i * level.step}
							{@const sy = -(wy - panY) * zoom + canvasH / 2}
							<line x1="0" y1={sy} x2={canvasW} y2={sy}
								stroke={level.isMajor ? '#1e293b' : '#111827'}
								stroke-width={level.isMajor ? 1 : 0.5}
								opacity={refImageUrl && refImageVisible ? 0.35 : 1} />
						{/each}
					{/each}
				{/if}

				<!-- Reference image (world-space tracing aid, above grid, below geometry) -->
				{#if refImageUrl && refImageVisible}
					{@const imgH = refImageWidthMm * refImageAspect}
					{@const [ix1, iy1] = worldToScreen(refImageOriginX, refImageOriginY + imgH)}
					{@const [ix2, iy2] = worldToScreen(refImageOriginX + refImageWidthMm, refImageOriginY)}
					<image
						href={refImageUrl}
						x={Math.min(ix1, ix2)}
						y={Math.min(iy1, iy2)}
						width={Math.abs(ix2 - ix1)}
						height={Math.abs(iy2 - iy1)}
						opacity={refImageOpacity}
						preserveAspectRatio="none"
						style="pointer-events: none;"
					/>
					{#if refImageAdjust}
						<rect
							x={Math.min(ix1, ix2)}
							y={Math.min(iy1, iy2)}
							width={Math.abs(ix2 - ix1)}
							height={Math.abs(iy2 - iy1)}
							fill="none"
							stroke="#f97316"
							stroke-width="1"
							stroke-dasharray="6,4"
							opacity="0.8"
							style="pointer-events: none;"
						/>
					{/if}
				{/if}

				<!-- Ground reference line (Y=0) -->
				{#if showGround}
				{@const [, groundSy] = worldToScreen(0, 0)}
				<line x1="0" y1={groundSy} x2={canvasW} y2={groundSy} stroke="#22c55e" stroke-width="1.5" stroke-opacity="0.4" />
				<text x="4" y={groundSy - 4} fill="#22c55e" font-size="10" opacity="0.6">Ground</text>
				{/if}

				<!-- Origin axis -->
				{#if showOrigin}
				{@const [ox, oy] = worldToScreen(0, 0)}
				<line x1={ox} y1="0" x2={ox} y2={canvasH} stroke="#1e3a5f" stroke-width="1" stroke-dasharray="6,4" />
				{/if}

				<!-- Wheels (reference, not user entities) -->
				{#if layers.wheels}
					{@const [fax, fay] = worldToScreen(frontContactX, frontAxleY)}
					{@const wr = frontWheelRadiusMm * zoom}
					<circle cx={fax} cy={fay} r={wr} fill="none" stroke="#4b5563" stroke-width="1.5" stroke-dasharray="4,4" />
					<circle cx={fax} cy={fay} r="3" fill="#6b7280" />
					<text x={fax} y={fay - wr - 6} text-anchor="middle" fill="#6b7280" font-size="9">Front</text>
					{@const [rax, ray] = worldToScreen(rearContactX, rearAxleY)}
					{@const rr = rearWheelRadiusMm * zoom}
					<circle cx={rax} cy={ray} r={rr} fill="none" stroke="#4b5563" stroke-width="1.5" stroke-dasharray="4,4" />
					<circle cx={rax} cy={ray} r="3" fill="#6b7280" />
					<text x={rax} y={ray - rr - 6} text-anchor="middle" fill="#6b7280" font-size="9">Rear</text>
				{/if}

				<!-- Steering axis reference -->
				{#if layers.steering}
					{@const saLen = 600}
					{@const saBaseX = frontContactX}
					{@const saBaseY = 0}
					{@const saDx = -Math.sin(rakeRad)}
					{@const saDy = Math.cos(rakeRad)}
					{@const [sa1x, sa1y] = worldToScreen(saBaseX - saLen * 0.2 * saDx, saBaseY - saLen * 0.2 * saDy)}
					{@const [sa2x, sa2y] = worldToScreen(saBaseX + saLen * saDx, saBaseY + saLen * saDy)}
					<line x1={sa1x} y1={sa1y} x2={sa2x} y2={sa2y} stroke="#f97316" stroke-width="1" stroke-dasharray="8,4" opacity="0.5" />
					<text x={sa2x + 4} y={sa2y - 4} fill="#f97316" font-size="9" opacity="0.7">{rakeAngleDeg} rake</text>
				{/if}

				<!-- Reference lines -->
				{#if layers.reflines && showRefLines}
					{#each refLines as rl}
						{@const [rx1, ry1] = worldToScreen(rl.x1, rl.y1)}
						{@const [rx2, ry2] = worldToScreen(rl.x2, rl.y2)}
						{@const isSelected = selected?.kind === 'refline' && (selected.data as RefLine).id === rl.id}
						<line x1={rx1} y1={ry1} x2={rx2} y2={ry2}
							stroke={rl.color || '#6366f1'} stroke-width={isSelected ? (rl.lineWidth || 1.5) + 1 : (rl.lineWidth || 1.5)}
							stroke-dasharray={getLineDash(rl.lineStyle || 'dashed-sm')} opacity={isSelected ? 1 : 0.7} />
						{#if rl.label}
							<text x={(rx1 + rx2) / 2} y={(ry1 + ry2) / 2 - 8} text-anchor="middle" fill={rl.color || '#6366f1'} font-size="10" opacity="0.9">{rl.label}</text>
						{/if}
					{/each}
					{#if reflineStart}
						{@const [psx, psy] = worldToScreen(reflineStart.x, reflineStart.y)}
						{@const [pex, pey] = worldToScreen(mouseWorldX, mouseWorldY)}
						<line x1={psx} y1={psy} x2={pex} y2={pey} stroke="#6366f1" stroke-width="1.5" stroke-dasharray={getLineDash(reflinePreviewStyle)} opacity="0.5" />
						<text x={pex + 8} y={pey - 8} fill="#6366f1" font-size="8" opacity="0.6">{lineStyleLabels[reflinePreviewStyle]} (scroll to change)</text>
					{/if}
				{/if}

				<!-- Frame members -->
				{#if layers.frame}
					{#each members as m}
						{@const a = nodeById(m.startId)}
						{@const b = nodeById(m.endId)}
						{#if a && b}
							{@const [ax, ay] = worldToScreen(a.x, a.y)}
							{@const [bx, by] = worldToScreen(b.x, b.y)}
							{@const isSelected = selected?.kind === 'member' && selected.data.id === m.id}
							<line x1={ax} y1={ay} x2={bx} y2={by}
								stroke={isSelected ? '#fbbf24' : '#60a5fa'}
								stroke-width={isSelected ? 3 : 2}
								stroke-linecap="round" />
							{#if m.label}
								<text x={(ax + bx) / 2} y={(ay + by) / 2 - 6} text-anchor="middle" fill="#93c5fd" font-size="9">{m.label}</text>
							{/if}
						{/if}
					{/each}
					{#if memberStartId}
						{@const sn = nodeById(memberStartId)}
						{#if sn}
							{@const [msx, msy] = worldToScreen(sn.x, sn.y)}
							{@const [mex, mey] = worldToScreen(mouseWorldX, mouseWorldY)}
							<line x1={msx} y1={msy} x2={mex} y2={mey} stroke="#60a5fa" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.5" />
						{/if}
					{/if}
				{/if}

				<!-- Constraints -->
				{#if layers.constraints}
					{#each constraints as c}
						{@const n = nodeById(c.nodeIds[0])}
						{#if n}
							{@const [cx_, cy_] = worldToScreen(n.x, n.y)}
							{@const isSelected = selected?.kind === 'constraint' && (selected.data as Constraint).id === c.id}
							{#if c.type === 'fixed'}
								<polygon points="{cx_},{cy_ + 4} {cx_ - 8},{cy_ + 16} {cx_ + 8},{cy_ + 16}"
									fill="none" stroke={isSelected ? '#fbbf24' : '#f472b6'} stroke-width="1.5" />
								<line x1={cx_ - 10} y1={cy_ + 16} x2={cx_ + 10} y2={cy_ + 16}
									stroke={isSelected ? '#fbbf24' : '#f472b6'} stroke-width="1.5" />
							{:else if c.type === 'horizontal'}
								<line x1={cx_ - 10} y1={cy_} x2={cx_ + 10} y2={cy_}
									stroke={isSelected ? '#fbbf24' : '#f472b6'} stroke-width="2" />
							{:else if c.type === 'vertical'}
								<line x1={cx_} y1={cy_ - 10} x2={cx_} y2={cy_ + 10}
									stroke={isSelected ? '#fbbf24' : '#f472b6'} stroke-width="2" />
							{/if}
							<text x={cx_ + 10} y={cy_ + 16} fill="#f472b6" font-size="8" opacity="0.7">{c.type}</text>
						{/if}
					{/each}
				{/if}

				<!-- Dimensions -->
				{#if layers.dimensions}
					{#each dimensions as dim}
						{@const a = nodeById(dim.startId)}
						{@const b = nodeById(dim.endId)}
						{#if a && b}
							{@const [ax, ay] = worldToScreen(a.x, a.y)}
							{@const [bx, by] = worldToScreen(b.x, b.y)}
							{@const mx = (ax + bx) / 2}
							{@const dist = Math.hypot(b.x - a.x, b.y - a.y)}
							{@const isSelected = selected?.kind === 'dimension' && (selected.data as Dimension).id === dim.id}
							<line x1={ax} y1={ay - dim.offset} x2={bx} y2={by - dim.offset}
								stroke={isSelected ? '#fbbf24' : '#a78bfa'} stroke-width="1" />
							<line x1={ax} y1={ay} x2={ax} y2={ay - dim.offset - 4}
								stroke="#a78bfa" stroke-width="0.5" opacity="0.5" />
							<line x1={bx} y1={by} x2={bx} y2={by - dim.offset - 4}
								stroke="#a78bfa" stroke-width="0.5" opacity="0.5" />
							<polygon points="{ax},{ay - dim.offset} {ax + 5},{ay - dim.offset - 3} {ax + 5},{ay - dim.offset + 3}"
								fill={isSelected ? '#fbbf24' : '#a78bfa'} />
							<polygon points="{bx},{by - dim.offset} {bx - 5},{by - dim.offset - 3} {bx - 5},{by - dim.offset + 3}"
								fill={isSelected ? '#fbbf24' : '#a78bfa'} />
							<text x={mx} y={((ay + by) / 2) - dim.offset - 6} text-anchor="middle" fill="#c4b5fd" font-size="10" font-family="monospace">
								{fmtDimLabel(dist)}
							</text>
						{/if}
					{/each}
				{/if}

				<!-- Nodes -->
				{#each nodes as n}
					{@const isSpecialAnchor = n.type === 'front_anchor' || n.type === 'rear_anchor'}
					{@const isOldAnchor = n.type === 'anchor' || n.type === 'steering_head' || n.type === 'rear_axle' || n.type === 'rear_module'}
					{@const layerOk = (isOldAnchor || isSpecialAnchor) ? layers.anchors : layers.frame}
					{#if layerOk}
						{@const [nx, ny] = worldToScreen(n.x, n.y)}
						{@const isSelected = selected?.kind === 'node' && selected.data.id === n.id}
						{@const isHovered = hoveredNodeId === n.id}
						{@const color = nodeTypeColors[n.type]}
						{@const baseR = isSpecialAnchor ? 9 : 5}
						<circle cx={nx} cy={ny} r={isSelected ? baseR + 2 : isHovered ? baseR + 1 : baseR}
							fill={isSelected ? '#fbbf24' : color}
							stroke={isSelected ? '#fff' : isHovered ? '#fff' : isSpecialAnchor ? '#fff' : 'none'}
							stroke-width={isSelected ? 2 : isSpecialAnchor ? 1.5 : 1}
							opacity={isSpecialAnchor ? 0.9 : 1}
							onpointerenter={() => hoveredNodeId = n.id}
							onpointerleave={() => hoveredNodeId = null}
							style="cursor: pointer;" />
						{#if isSpecialAnchor}
							<!-- Crosshair on anchor -->
							<line x1={nx - baseR - 3} y1={ny} x2={nx + baseR + 3} y2={ny} stroke={color} stroke-width="1" opacity="0.5" />
							<line x1={nx} y1={ny - baseR - 3} x2={nx} y2={ny + baseR + 3} stroke={color} stroke-width="1" opacity="0.5" />
						{/if}
						{#if isSelected}
							<circle cx={nx} cy={ny} r={baseR + 7} fill="none" stroke="#fbbf24" stroke-width="1" stroke-dasharray="3,2" opacity="0.5" />
						{/if}
						{#if n.label || n.type !== 'generic'}
							<text x={nx + baseR + 4} y={ny - 6} fill={color} font-size={isSpecialAnchor ? '11' : '9'} font-weight={isSpecialAnchor ? 'bold' : 'normal'} opacity="0.8">
								{n.label || nodeTypeLabels[n.type]}
							</text>
						{/if}
						{#if isHovered || isSelected}
							<text x={nx + baseR + 4} y={ny + 14} fill="#9ca3af" font-size="8" font-family="monospace">
								({fmtCoord(n.x)}, {fmtCoord(n.y)})
							</text>
						{/if}
					{/if}
				{/each}

				<!-- Rider overlay -->
				{#if layers.rider}
					{@const seatX = wheelbaseMm * 0.55}
					{@const [hx, hy] = worldToScreen(seatX, seatHeightMm + 350)}
					{@const [sx, sy] = worldToScreen(seatX, seatHeightMm)}
					{@const [fx, fy] = worldToScreen(seatX + 200, 0)}
					<circle cx={hx} cy={hy} r={16 * zoom > 8 ? 16 * zoom : 8} fill="none" stroke="#34d399" stroke-width="1" opacity="0.3" />
					<line x1={hx} y1={hy + (16 * zoom > 8 ? 16 * zoom : 8)} x2={sx} y2={sy} stroke="#34d399" stroke-width="1.5" opacity="0.3" />
					{@const [kx, ky] = worldToScreen(seatX + 100, seatHeightMm * 0.5)}
					<line x1={sx} y1={sy} x2={kx} y2={ky} stroke="#34d399" stroke-width="1.5" opacity="0.3" />
					<line x1={kx} y1={ky} x2={fx} y2={fy} stroke="#34d399" stroke-width="1.5" opacity="0.3" />
					{@const [ax_, ay_] = worldToScreen(frontContactX - 50, seatHeightMm + 100)}
					<line x1={hx} y1={hy + (16 * zoom > 8 ? 16 * zoom : 8)} x2={ax_} y2={ay_} stroke="#34d399" stroke-width="1" opacity="0.2" stroke-dasharray="4,3" />
				{/if}

				<!-- Front End geometry overlay -->
				{#if showFrontEnd && frontEndResults && frontEndTire}
					{@const feAnchor = getAnchorNode('front_anchor')}
					{#if feAnchor}
						{@const fe = frontEndResults}
						{@const fed = frontEndData}
						{@const anchorX = feAnchor.x}
						{@const anchorY = feAnchor.y}
						{@const offsetX = anchorX - fe.steeringColumnCenter.x}
						{@const offsetY = anchorY - fe.steeringColumnCenter.y}
						{@const feColor = '#f97316'}
						{@const feOpacity = 0.6}
						{@const feRakeRad = (fed?.rakeAngleDeg ?? rakeAngleDeg) * Math.PI / 180}
						{@const saDirX = -Math.sin(feRakeRad)}
						{@const saDirY = Math.cos(feRakeRad)}
						{@const saPerpX = saDirY}
						{@const saPerpY = -saDirX}
						{@const forkOffset = fed?.forkOffsetMm ?? 40}
						{@const scHeight = fed?.steeringColumnHeightMm ?? 200}
						{@const scHalfH = scHeight / 2}
						{@const scHalfW = 25}
						{@const ttThick = scHalfW / 2}
						{@const ttGap = 3}

						<!-- Steering axis line (full length) -->
						{@const [saGx, saGy] = worldToScreen(fe.steeringAxisGround.x + offsetX, fe.steeringAxisGround.y + offsetY)}
						{@const [saTx, saTy] = worldToScreen(fe.steeringAxisTop.x + offsetX, fe.steeringAxisTop.y + offsetY)}
						<line x1={saGx} y1={saGy} x2={saTx} y2={saTy}
							stroke="#60a5fa" stroke-width="1" stroke-dasharray="8,4" opacity={feOpacity * 0.6} />

						<!-- Steering column rectangle -->
						{@const scCx = fe.steeringColumnCenter.x + offsetX}
						{@const scCy = fe.steeringColumnCenter.y + offsetY}
						{@const sc1x = scCx + scHalfH * saDirX + scHalfW * saPerpX}
						{@const sc1y = scCy + scHalfH * saDirY + scHalfW * saPerpY}
						{@const sc2x = scCx + scHalfH * saDirX - scHalfW * saPerpX}
						{@const sc2y = scCy + scHalfH * saDirY - scHalfW * saPerpY}
						{@const sc3x = scCx - scHalfH * saDirX - scHalfW * saPerpX}
						{@const sc3y = scCy - scHalfH * saDirY - scHalfW * saPerpY}
						{@const sc4x = scCx - scHalfH * saDirX + scHalfW * saPerpX}
						{@const sc4y = scCy - scHalfH * saDirY + scHalfW * saPerpY}
						{@const [s1x, s1y] = worldToScreen(sc1x, sc1y)}
						{@const [s2x, s2y] = worldToScreen(sc2x, sc2y)}
						{@const [s3x, s3y] = worldToScreen(sc3x, sc3y)}
						{@const [s4x, s4y] = worldToScreen(sc4x, sc4y)}
						<polygon points="{s1x},{s1y} {s2x},{s2y} {s3x},{s3y} {s4x},{s4y}"
							fill="none" stroke={feColor} stroke-width="2" opacity={feOpacity} />

						<!-- Top triple tree -->
						{@const ttTopCy = scCy + (scHalfH + ttGap + ttThick / 2) * saDirY}
						{@const ttTopCx = scCx + (scHalfH + ttGap + ttThick / 2) * saDirX}
						{@const ttMinPerp = Math.min(-scHalfW, forkOffset - scHalfW)}
						{@const ttMaxPerp = Math.max(scHalfW, forkOffset + scHalfW)}
						{@const tt1x = ttTopCx + ttThick / 2 * saDirX + ttMinPerp * saPerpX}
						{@const tt1y = ttTopCy + ttThick / 2 * saDirY + ttMinPerp * saPerpY}
						{@const tt2x = ttTopCx + ttThick / 2 * saDirX + ttMaxPerp * saPerpX}
						{@const tt2y = ttTopCy + ttThick / 2 * saDirY + ttMaxPerp * saPerpY}
						{@const tt3x = ttTopCx - ttThick / 2 * saDirX + ttMaxPerp * saPerpX}
						{@const tt3y = ttTopCy - ttThick / 2 * saDirY + ttMaxPerp * saPerpY}
						{@const tt4x = ttTopCx - ttThick / 2 * saDirX + ttMinPerp * saPerpX}
						{@const tt4y = ttTopCy - ttThick / 2 * saDirY + ttMinPerp * saPerpY}
						{@const [t1x, t1y] = worldToScreen(tt1x, tt1y)}
						{@const [t2x, t2y] = worldToScreen(tt2x, tt2y)}
						{@const [t3x, t3y] = worldToScreen(tt3x, tt3y)}
						{@const [t4x, t4y] = worldToScreen(tt4x, tt4y)}
						<polygon points="{t1x},{t1y} {t2x},{t2y} {t3x},{t3y} {t4x},{t4y}"
							fill="none" stroke={feColor} stroke-width="1.5" opacity={feOpacity} />

						<!-- Bottom triple tree -->
						{@const btTopCy = scCy - (scHalfH + ttGap + ttThick / 2) * saDirY}
						{@const btTopCx = scCx - (scHalfH + ttGap + ttThick / 2) * saDirX}
						{@const bt1x = btTopCx + ttThick / 2 * saDirX + ttMinPerp * saPerpX}
						{@const bt1y = btTopCy + ttThick / 2 * saDirY + ttMinPerp * saPerpY}
						{@const bt2x = btTopCx + ttThick / 2 * saDirX + ttMaxPerp * saPerpX}
						{@const bt2y = btTopCy + ttThick / 2 * saDirY + ttMaxPerp * saPerpY}
						{@const bt3x = btTopCx - ttThick / 2 * saDirX + ttMaxPerp * saPerpX}
						{@const bt3y = btTopCy - ttThick / 2 * saDirY + ttMaxPerp * saPerpY}
						{@const bt4x = btTopCx - ttThick / 2 * saDirX + ttMinPerp * saPerpX}
						{@const bt4y = btTopCy - ttThick / 2 * saDirY + ttMinPerp * saPerpY}
						{@const [b1x, b1y] = worldToScreen(bt1x, bt1y)}
						{@const [b2x, b2y] = worldToScreen(bt2x, bt2y)}
						{@const [b3x, b3y] = worldToScreen(bt3x, bt3y)}
						{@const [b4x, b4y] = worldToScreen(bt4x, bt4y)}
						<polygon points="{b1x},{b1y} {b2x},{b2y} {b3x},{b3y} {b4x},{b4y}"
							fill="none" stroke={feColor} stroke-width="1.5" opacity={feOpacity} />

						<!-- Fork tube (line from forkTop to forkBottom, offset from SA by forkOffset) -->
						{@const [ftx, fty] = worldToScreen(fe.forkTop.x + offsetX, fe.forkTop.y + offsetY)}
						{@const [fbx, fby] = worldToScreen(fe.forkBottom.x + offsetX, fe.forkBottom.y + offsetY)}
						{@const forkTubeW = (fed?.forkTubeSize?.includes('54') ? 54 : fed?.forkTubeSize?.includes('49') ? 49 : fed?.forkTubeSize?.includes('46') ? 46 : fed?.forkTubeSize?.includes('41') ? 41 : fed?.forkTubeSize?.includes('37') ? 37 : 41) * zoom}
						<line x1={ftx} y1={fty} x2={fbx} y2={fby}
							stroke={feColor} stroke-width={Math.max(2, forkTubeW * 0.8)} opacity={feOpacity * 0.4} />
						<line x1={ftx} y1={fty} x2={fbx} y2={fby}
							stroke={feColor} stroke-width="1.5" opacity={feOpacity} />

						<!-- Link arm (for leading/trailing link types) -->
						{#if fe.linkPivot && fe.linkEnd}
							{@const [lpx, lpy] = worldToScreen(fe.linkPivot.x + offsetX, fe.linkPivot.y + offsetY)}
							{@const [lex, ley] = worldToScreen(fe.linkEnd.x + offsetX, fe.linkEnd.y + offsetY)}
							<line x1={lpx} y1={lpy} x2={lex} y2={ley}
								stroke={feColor} stroke-width="3" opacity={feOpacity} />
							<circle cx={lpx} cy={lpy} r={4} fill={feColor} opacity={feOpacity} />
							<circle cx={lex} cy={ley} r={4} fill={feColor} opacity={feOpacity} />
						{/if}

						<!-- Fork end cap circle -->
						{@const forkCapR = 25.4}
						{@const forkBottomX = fe.forkBottom.x + offsetX}
						{@const forkBottomY = fe.forkBottom.y + offsetY}
						{@const capCx = forkBottomX - 25.4 * saDirX}
						{@const capCy = forkBottomY - 25.4 * saDirY}
						{@const [fcx, fcy] = worldToScreen(capCx, capCy)}
						<circle cx={fcx} cy={fcy} r={forkCapR * zoom}
							fill="none" stroke={feColor} stroke-width="1.5" opacity={feOpacity} />

						<!-- Axle/Spindle -->
						{@const [axX, axY] = worldToScreen(fe.axleCenter.x + offsetX, fe.axleCenter.y + offsetY)}
						{@const spindleOuterR = 25.4 * zoom}
						{@const spindleInnerR = 12.7 * zoom}
						<circle cx={axX} cy={axY} r={spindleOuterR}
							fill="none" stroke={feColor} stroke-width="1" opacity={feOpacity * 0.7} />
						<circle cx={axX} cy={axY} r={spindleInnerR}
							fill="none" stroke={feColor} stroke-width="1" opacity={feOpacity * 0.7} />
						<circle cx={axX} cy={axY} r={3} fill={feColor} opacity={feOpacity} />

						<!-- Wheel (outer tire) -->
						{@const wheelR = frontEndTire.outerRadiusMm * zoom}
						<circle cx={axX} cy={axY} r={wheelR}
							fill="none" stroke={feColor} stroke-width="1.5" opacity={feOpacity * 0.6} />
						<!-- Rim -->
						{@const rimR = frontEndTire.rimRadiusMm * zoom}
						<circle cx={axX} cy={axY} r={rimR}
							fill="none" stroke={feColor} stroke-width="1" opacity={feOpacity * 0.4} />
						<!-- Tire cross section (thick stroke) -->
						{@const tireW = (frontEndTire.outerRadiusMm - frontEndTire.rimRadiusMm) * zoom}
						{@const tireMidR = (frontEndTire.outerRadiusMm + frontEndTire.rimRadiusMm) / 2 * zoom}
						<circle cx={axX} cy={axY} r={tireMidR}
							fill="none" stroke={feColor} stroke-width={tireW} opacity={feOpacity * 0.12} />

						<!-- Contact patch -->
						{@const [cpx, cpy] = worldToScreen(fe.contactPatch.x + offsetX, fe.contactPatch.y + offsetY)}
						<circle cx={cpx} cy={cpy} r={4} fill={feColor} stroke="#fff" stroke-width="1" opacity={feOpacity} />

						<!-- Label at top -->
						{@const [labelX, labelY] = worldToScreen(fe.steeringAxisTop.x + offsetX, fe.steeringAxisTop.y + offsetY)}
						<text x={labelX + 10} y={labelY - 5} fill={feColor} font-size="10" opacity={feOpacity * 0.8}>
							Front End
						</text>
					{/if}
				{/if}

				<!-- Dimension preview -->
				{#if dimStartId}
					{@const sn = nodeById(dimStartId)}
					{#if sn}
						{@const [dsx, dsy] = worldToScreen(sn.x, sn.y)}
						{@const [dex, dey] = worldToScreen(mouseWorldX, mouseWorldY)}
						<line x1={dsx} y1={dsy} x2={dex} y2={dey} stroke="#a78bfa" stroke-width="1" stroke-dasharray="3,3" opacity="0.4" />
					{/if}
				{/if}

				<!-- Scale indicator -->
				{#if showScale && gridLevels.length > 0}
					{@const scaleLevel = gridLevels[gridLevels.length - 1]}
					{@const scalePx = scaleLevel.step * zoom}
					{@const scaleX = 30}
					{@const scaleY = canvasH - 30}
					{@const tickH = 8}
					{@const scaleLabel = (() => {
						const mm = scaleLevel.step;
						if (unitSystem === 'us') {
							if (mm >= 25.4 * 12) return `${Math.round(mm / (25.4 * 12))}'`;
							if (mm >= 25.4) return `${Math.round(mm / 25.4)}"`;
							const frac = mm / 25.4;
							if (Math.abs(frac - 0.5) < 0.01) return '1/2"';
							if (Math.abs(frac - 0.25) < 0.01) return '1/4"';
							if (Math.abs(frac - 0.125) < 0.01) return '1/8"';
							if (Math.abs(frac - 0.0625) < 0.01) return '1/16"';
							return `${frac.toFixed(3)}"`;
						}
						if (mm >= 1000) return `${mm / 1000}m`;
						if (mm >= 10) return `${mm}mm`;
						return `${mm}mm`;
					})()}
					<!-- Main horizontal line -->
					<line x1={scaleX} y1={scaleY} x2={scaleX + scalePx} y2={scaleY}
						stroke="#eab308" stroke-width="1.5" />
					<!-- Left tick -->
					<line x1={scaleX} y1={scaleY - tickH / 2} x2={scaleX} y2={scaleY + tickH / 2}
						stroke="#eab308" stroke-width="1.5" />
					<!-- Right tick -->
					<line x1={scaleX + scalePx} y1={scaleY - tickH / 2} x2={scaleX + scalePx} y2={scaleY + tickH / 2}
						stroke="#eab308" stroke-width="1.5" />
					<!-- Label -->
					<text x={scaleX + scalePx / 2} y={scaleY - 10} text-anchor="middle" fill="#eab308" font-size="10" font-family="monospace">
						{scaleLabel}
					</text>
				{/if}

				<!-- Coordinate label -->
				<text x={canvasW - 4} y={canvasH - 4} text-anchor="end" fill="#374151" font-size="9" font-family="monospace">
					{unitSystem === 'us' ? 'X--> longitudinal  Y up vertical  (inches)' : 'X--> longitudinal  Y up vertical  (mm)'}
				</text>
			</svg>

			<!-- Tool hint overlay -->
			{#if refImageDragOver}
				<div class="absolute inset-0 z-20 flex items-center justify-center bg-orange-500/10 border-2 border-dashed border-orange-400 pointer-events-none">
					<span class="text-sm text-orange-300">Drop screencap to trace</span>
				</div>
			{/if}

			<div class="absolute top-2 left-2 text-[10px] text-gray-600 pointer-events-none">
				{#if refImageAdjust}
					Drag to pan the screencap. Scroll to scale. Esc locks it so you can place nodes.
				{:else if activeTool === 'node'}
					Click to place node. Snap: {showSnap ? fmtSnapLabel() : 'off'}
				{:else if activeTool === 'member'}
					{#if memberStartId}
						Click end node to complete member. Esc to cancel.
					{:else}
						Click start node.
					{/if}
				{:else if activeTool === 'dimension'}
					{#if dimStartId}
						Click end node. Esc to cancel.
					{:else}
						Click start node.
					{/if}
				{:else if activeTool === 'refline'}
					{#if reflineStart}
						Click end point. Scroll to change line style. Esc to cancel.
					{:else}
						Click start point.
					{/if}
				{:else if activeTool === 'constraint'}
					Click a node to add constraint.
				{:else if activeTool === 'anchor'}
					Click to place {anchorSubType === 'front_anchor' ? 'Front End' : 'Rear End'} anchor. Only one of each allowed.
				{:else if activeTool === 'edit'}
					Click entity to edit properties.
				{:else if activeTool === 'select'}
					{#if !refImageUrl}
						Import a screencap, drop a file, or paste a screenshot to trace over it.
					{:else}
						Click to select. Drag nodes to move. Scroll to zoom. Left-drag empty space to pan.
					{/if}
				{/if}
			</div>

			<!-- Edit Popup -->
			{#if editPopupVisible && selected}
				<div class="absolute bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 space-y-2 text-xs z-50 min-w-[180px]"
					style="left: {Math.min(editPopupX, canvasW - 200)}px; top: {Math.min(editPopupY, canvasH - 250)}px;">
					<div class="text-gray-400 font-semibold uppercase text-[10px] tracking-wider mb-1">
						Edit {selected.kind}
					</div>

					<button class="w-full px-2 py-1.5 rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 text-left"
						onclick={deleteSelected}>
						Delete
					</button>

					{#if selected.kind === 'refline'}
						{@const rl = selected.data as RefLine}
						<div class="space-y-1.5 border-t border-gray-800 pt-2">
							<div>
								<label class="text-gray-500 block mb-0.5">Label</label>
								<input type="text" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={rl.label} oninput={(e) => { rl.label = (e.target as HTMLInputElement).value; refLines = refLines; }} />
							</div>
							<div>
								<label class="text-gray-500 block mb-0.5">Color</label>
								<input type="color" class="w-full h-6 bg-gray-800 border border-gray-700 rounded cursor-pointer"
									value={rl.color || '#6366f1'} oninput={(e) => { rl.color = (e.target as HTMLInputElement).value; refLines = refLines; }} />
							</div>
							<div>
								<label class="text-gray-500 block mb-0.5">Line Style</label>
								<select class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={rl.lineStyle || 'dashed-sm'} onchange={(e) => { rl.lineStyle = (e.target as HTMLSelectElement).value as LineStyle; refLines = refLines; }}>
									{#each lineStyles as ls}
										<option value={ls}>{lineStyleLabels[ls]}</option>
									{/each}
								</select>
							</div>
							<div>
								<label class="text-gray-500 block mb-0.5">Thickness</label>
								<input type="number" min="0.5" max="8" step="0.5" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={rl.lineWidth || 1.5} oninput={(e) => { rl.lineWidth = Number((e.target as HTMLInputElement).value); refLines = refLines; }} />
							</div>
						</div>
					{/if}

					{#if selected.kind === 'node'}
						{@const n = selected.data as LayoutNode}
						<div class="space-y-1.5 border-t border-gray-800 pt-2">
							<div>
								<label class="text-gray-500 block mb-0.5">Label</label>
								<input type="text" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={n.label} oninput={(e) => { n.label = (e.target as HTMLInputElement).value; nodes = nodes; }} />
							</div>
							<div>
								<label class="text-gray-500 block mb-0.5">Type</label>
								<select class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={n.type} onchange={(e) => { n.type = (e.target as HTMLSelectElement).value as NodeType; nodes = nodes; }}>
									{#each Object.entries(nodeTypeLabels) as [val, lbl]}
										<option value={val}>{lbl}</option>
									{/each}
								</select>
							</div>
						</div>
					{/if}

					{#if selected.kind === 'member'}
						{@const m = selected.data as FrameMember}
						<div class="space-y-1.5 border-t border-gray-800 pt-2">
							<div>
								<label class="text-gray-500 block mb-0.5">Label</label>
								<input type="text" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={m.label} oninput={(e) => { m.label = (e.target as HTMLInputElement).value; members = members; }} />
							</div>
						</div>
					{/if}

					<button class="w-full px-2 py-1 rounded hover:bg-gray-800 text-gray-500 text-center mt-1"
						onclick={() => editPopupVisible = false}>
						Close
					</button>
				</div>
			{/if}
		</div>

		<!-- Right Properties Panel -->
		<div class="w-56 shrink-0 border-l border-gray-800 bg-gray-900 overflow-y-auto">
			<div class="p-3 space-y-4 text-xs">
				<div>
					<h4 class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Properties</h4>
					{#if selected?.kind === 'node'}
						{@const n = selected.data as LayoutNode}
						<div class="space-y-2">
							<div>
								<label class="text-gray-500 block mb-0.5">Label</label>
								<input type="text" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={n.label} oninput={(e) => { n.label = (e.target as HTMLInputElement).value; nodes = nodes; }} />
							</div>
							<div>
								<label class="text-gray-500 block mb-0.5">Type</label>
								<select class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={n.type} onchange={(e) => { n.type = (e.target as HTMLSelectElement).value as NodeType; nodes = nodes; }}>
									{#each Object.entries(nodeTypeLabels) as [val, lbl]}
										<option value={val}>{lbl}</option>
									{/each}
								</select>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label class="text-gray-500 block mb-0.5">X ({fmtUnit()})</label>
									<input type="number" step={unitSystem === 'us' ? 25.4 / 8 : snapSize} class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
										value={unitSystem === 'us' ? +(n.x / 25.4).toFixed(3) : n.x} oninput={(e) => { pushUndo(); const v = Number((e.target as HTMLInputElement).value); n.x = unitSystem === 'us' ? v * 25.4 : v; nodes = nodes; }} />
								</div>
								<div>
									<label class="text-gray-500 block mb-0.5">Y ({fmtUnit()})</label>
									<input type="number" step={unitSystem === 'us' ? 25.4 / 8 : snapSize} class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
										value={unitSystem === 'us' ? +(n.y / 25.4).toFixed(3) : n.y} oninput={(e) => { pushUndo(); const v = Number((e.target as HTMLInputElement).value); n.y = unitSystem === 'us' ? v * 25.4 : v; nodes = nodes; }} />
								</div>
							</div>
							<div class="text-gray-600 font-mono">
								{unitSystem === 'us' ? `(${n.x.toFixed(1)} mm, ${n.y.toFixed(1)} mm)` : `(${(n.x / 25.4).toFixed(2)}", ${(n.y / 25.4).toFixed(2)}")`}
							</div>
						</div>
					{:else if selected?.kind === 'member'}
						{@const m = selected.data as FrameMember}
						{@const a = nodeById(m.startId)}
						{@const b = nodeById(m.endId)}
						<div class="space-y-2">
							<div>
								<label class="text-gray-500 block mb-0.5">Label</label>
								<input type="text" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={m.label} oninput={(e) => { m.label = (e.target as HTMLInputElement).value; members = members; }} />
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label class="text-gray-500 block mb-0.5">OD (mm)</label>
									<input type="number" step="0.1" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
										value={m.diameter} oninput={(e) => { m.diameter = Number((e.target as HTMLInputElement).value); members = members; }} />
								</div>
								<div>
									<label class="text-gray-500 block mb-0.5">Wall (mm)</label>
									<input type="number" step="0.1" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
										value={m.thickness} oninput={(e) => { m.thickness = Number((e.target as HTMLInputElement).value); members = members; }} />
								</div>
							</div>
							{#if a && b}
								{@const len = Math.hypot(b.x - a.x, b.y - a.y)}
								<div class="text-gray-500">
									Length: <span class="text-gray-300 font-mono">{fmtLen(len)}</span>
								</div>
								<div class="text-gray-500">
									From ({fmtCoord(a.x)}, {fmtCoord(a.y)}) to ({fmtCoord(b.x)}, {fmtCoord(b.y)})
								</div>
							{/if}
						</div>
					{:else if selected?.kind === 'constraint'}
						{@const c = selected.data as Constraint}
						<div class="space-y-2">
							<div>
								<label class="text-gray-500 block mb-0.5">Type</label>
								<select class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={c.type} onchange={(e) => { c.type = (e.target as HTMLSelectElement).value as ConstraintType; constraints = constraints; }}>
									<option value="fixed">Fixed</option>
									<option value="horizontal">Horizontal</option>
									<option value="vertical">Vertical</option>
									<option value="distance">Distance</option>
									<option value="angle">Angle</option>
								</select>
							</div>
							{#if c.type === 'distance' || c.type === 'angle'}
								<div>
									<label class="text-gray-500 block mb-0.5">Value</label>
									<input type="number" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
										value={c.value} oninput={(e) => { c.value = Number((e.target as HTMLInputElement).value); constraints = constraints; }} />
								</div>
							{/if}
						</div>
					{:else if selected?.kind === 'dimension'}
						{@const d = selected.data as Dimension}
						{@const a = nodeById(d.startId)}
						{@const b = nodeById(d.endId)}
						<div class="space-y-2">
							<div>
								<label class="text-gray-500 block mb-0.5">Offset (px)</label>
								<input type="number" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
									value={d.offset} oninput={(e) => { d.offset = Number((e.target as HTMLInputElement).value); dimensions = dimensions; }} />
							</div>
							{#if a && b}
								{@const dist = Math.hypot(b.x - a.x, b.y - a.y)}
								<div class="text-gray-300 font-mono">{fmtLen(dist)}</div>
							{/if}
						</div>
					{:else if selected?.kind === 'refline'}
						{@const rl = selected.data as RefLine}
						<div class="space-y-2">
							<div>
								<label class="text-gray-500 block mb-0.5">Label</label>
								<input type="text" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={rl.label} oninput={(e) => { rl.label = (e.target as HTMLInputElement).value; refLines = refLines; }} />
							</div>
							<div>
								<label class="text-gray-500 block mb-0.5">Color</label>
								<input type="color" class="w-full h-6 bg-gray-800 border border-gray-700 rounded cursor-pointer"
									value={rl.color || '#6366f1'} oninput={(e) => { rl.color = (e.target as HTMLInputElement).value; refLines = refLines; }} />
							</div>
							<div>
								<label class="text-gray-500 block mb-0.5">Line Style</label>
								<select class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={rl.lineStyle || 'dashed-sm'} onchange={(e) => { rl.lineStyle = (e.target as HTMLSelectElement).value as LineStyle; refLines = refLines; }}>
									{#each lineStyles as ls}
										<option value={ls}>{lineStyleLabels[ls]}</option>
									{/each}
								</select>
							</div>
							<div>
								<label class="text-gray-500 block mb-0.5">Thickness</label>
								<input type="number" min="0.5" max="8" step="0.5" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
									value={rl.lineWidth || 1.5} oninput={(e) => { rl.lineWidth = Number((e.target as HTMLInputElement).value); refLines = refLines; }} />
							</div>
							<div class="text-gray-500">
								Length: <span class="text-gray-300 font-mono">{fmtLen(Math.hypot(rl.x2 - rl.x1, rl.y2 - rl.y1))}</span>
							</div>
						</div>
					{:else}
						<p class="text-gray-600 italic">Nothing selected</p>
					{/if}
				</div>

				{#if refImageFileName}
					<div>
						<div class="flex items-center gap-2 mb-2">
							<div class="h-px flex-1 bg-gray-800"></div>
							<span class="text-[9px] text-gray-600 uppercase tracking-widest">Screencap</span>
							<div class="h-px flex-1 bg-gray-800"></div>
						</div>
						<div class="text-gray-400 truncate" title={refImageFileName}>{refImageFileName}</div>
						<div class="text-gray-600">{refImageUrl ? 'Local cache' : 'Reload file to restore'}</div>
					</div>
				{/if}

				<!-- Vehicle parameters -->
				<div>
					<div class="flex items-center gap-2 mb-2">
						<div class="h-px flex-1 bg-gray-800"></div>
						<span class="text-[9px] text-gray-600 uppercase tracking-widest">Vehicle</span>
						<div class="h-px flex-1 bg-gray-800"></div>
					</div>
					<div class="space-y-2">
						<div>
							<label class="text-gray-500 block mb-0.5">Wheelbase ({fmtUnit()})</label>
							<input type="number" step={unitSystem === 'us' ? 0.25 : 10} class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
								value={unitSystem === 'us' ? +(wheelbaseMm / 25.4).toFixed(3) : wheelbaseMm}
								oninput={(e) => { const v = Number((e.target as HTMLInputElement).value); wheelbaseMm = unitSystem === 'us' ? v * 25.4 : v; }} />
						</div>
						<div>
							<label class="text-gray-500 block mb-0.5">Seat height ({fmtUnit()})</label>
							<input type="number" step={unitSystem === 'us' ? 0.25 : 10} class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
								value={unitSystem === 'us' ? +(seatHeightMm / 25.4).toFixed(3) : seatHeightMm}
								oninput={(e) => { const v = Number((e.target as HTMLInputElement).value); seatHeightMm = unitSystem === 'us' ? v * 25.4 : v; }} />
						</div>
						<div>
							<label class="text-gray-500 block mb-0.5">Rake angle (deg)</label>
							<input type="number" step="0.5" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
								bind:value={rakeAngleDeg} />
						</div>
						<div>
							<label class="text-gray-500 block mb-0.5">Front wheel radius ({fmtUnit()})</label>
							<input type="number" step={unitSystem === 'us' ? 0.125 : 1} class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
								value={unitSystem === 'us' ? +(frontWheelRadiusMm / 25.4).toFixed(3) : frontWheelRadiusMm}
								oninput={(e) => { const v = Number((e.target as HTMLInputElement).value); frontWheelRadiusMm = unitSystem === 'us' ? v * 25.4 : v; }} />
						</div>
						<div>
							<label class="text-gray-500 block mb-0.5">Rear wheel radius ({fmtUnit()})</label>
							<input type="number" step={unitSystem === 'us' ? 0.125 : 1} class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
								value={unitSystem === 'us' ? +(rearWheelRadiusMm / 25.4).toFixed(3) : rearWheelRadiusMm}
								oninput={(e) => { const v = Number((e.target as HTMLInputElement).value); rearWheelRadiusMm = unitSystem === 'us' ? v * 25.4 : v; }} />
						</div>
					</div>
				</div>

				<!-- Stats -->
				<div>
					<div class="flex items-center gap-2 mb-2">
						<div class="h-px flex-1 bg-gray-800"></div>
						<span class="text-[9px] text-gray-600 uppercase tracking-widest">Stats</span>
						<div class="h-px flex-1 bg-gray-800"></div>
					</div>
					<div class="space-y-1 text-gray-500">
						<div>Nodes: <span class="text-gray-300">{nodes.length}</span></div>
						<div>Members: <span class="text-gray-300">{members.length}</span></div>
						<div>Constraints: <span class="text-gray-300">{constraints.length}</span></div>
						<div>Dimensions: <span class="text-gray-300">{dimensions.length}</span></div>
						<div>Ref lines: <span class="text-gray-300">{refLines.length}</span></div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
