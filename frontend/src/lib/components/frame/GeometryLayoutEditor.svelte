<script lang="ts">
	// ── Types ──
	type Tool = 'select' | 'node' | 'member' | 'constraint' | 'dimension' | 'refline';
	type NodeType = 'generic' | 'steering_head' | 'rear_axle' | 'rear_module' | 'engine' | 'seat' | 'rider' | 'anchor';
	type ConstraintType = 'horizontal' | 'vertical' | 'distance' | 'angle' | 'fixed';

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
		diameter: number;    // mm conceptual tube OD
		thickness: number;   // mm wall
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
		offset: number;      // perpendicular offset for label
	}
	interface RefLine {
		id: string;
		x1: number; y1: number;
		x2: number; y2: number;
		label: string;
	}
	type AnyElement =
		| { kind: 'node'; data: LayoutNode }
		| { kind: 'member'; data: FrameMember }
		| { kind: 'constraint'; data: Constraint }
		| { kind: 'dimension'; data: Dimension }
		| { kind: 'refline'; data: RefLine };

	// ── State ──
	let activeTool = $state<Tool>('select');
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

	// View state
	let panX = $state(0);      // world offset
	let panY = $state(0);
	let zoom = $state(0.5);    // pixels per mm
	let showGrid = $state(true);
	let showSnap = $state(true);

	// Unit system
	type UnitSystem = 'metric' | 'us';
	let unitSystem = $state<UnitSystem>('metric');
	const EIGHTH_INCH_MM = 25.4 / 8; // 3.175 mm
	const snapSize = $derived(unitSystem === 'metric' ? 25 : EIGHTH_INCH_MM);

	// Formatting helpers
	function fmtLen(mm: number): string {
		if (unitSystem === 'us') {
			const inches = mm / 25.4;
			const whole = Math.floor(inches);
			const frac = inches - whole;
			const eighths = Math.round(frac * 8);
			if (eighths === 0) return `${whole}\"`;
			if (eighths === 8) return `${whole + 1}\"`;
			return `${whole} ${eighths}/8\"`;
		}
		return `${mm.toFixed(1)} mm`;
	}
	function fmtCoord(mm: number): string {
		if (unitSystem === 'us') return `${(mm / 25.4).toFixed(3)}\"`;
		return `${mm.toFixed(0)}`;
	}
	function fmtSnapLabel(): string {
		if (unitSystem === 'us') return '1/8\"';
		return `${25}mm`;
	}
	function fmtUnit(): string {
		return unitSystem === 'us' ? 'in' : 'mm';
	}
	function fmtDimLabel(mm: number): string {
		if (unitSystem === 'us') return `${(mm / 25.4).toFixed(3)}\"`;
		return `${mm.toFixed(1)} mm`;
	}

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

	// Global vehicle params
	let wheelbaseMm = $state(1500);
	let seatHeightMm = $state(800);
	let rakeAngleDeg = $state(27);
	let frontWheelRadiusMm = $state(312);
	let rearWheelRadiusMm = $state(312);

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
			nodes: structuredClone(nodes),
			members: structuredClone(members),
			constraints: structuredClone(constraints),
			dimensions: structuredClone(dimensions),
			refLines: structuredClone(refLines),
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
	// World: X right (forward), Y up
	// Screen: X right, Y down
	function worldToScreen(wx: number, wy: number): [number, number] {
		const sx = (wx - panX) * zoom + canvasW / 2;
		const sy = -(wy - panY) * zoom + canvasH / 2;
		return [sx, sy];
	}
	function screenToWorld(sx: number, sy: number): [number, number] {
		const wx = (sx - canvasW / 2) / zoom + panX;
		const wy = -((sy - canvasH / 2) / zoom) + panY;
		return [wx, wy];
	}
	function snapWorld(v: number): number {
		if (!showSnap) return v;
		return Math.round(v / snapSize) * snapSize;
	}

	// ── Grid derived values ──
	const gridStep = $derived((() => {
		const pixPerStep = snapSize * zoom;
		if (pixPerStep < 10) return snapSize * 10;
		if (pixPerStep < 25) return snapSize * 4;
		if (pixPerStep < 50) return snapSize * 2;
		return snapSize;
	})());
	const majorGridStep = $derived(gridStep * 4);

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

	// Live mouse position in world coords for member/refline preview
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

		// Middle-click or Space always pans
		if (e.button === 1) {
			isPanning = true;
			panStartScreen = [sx, sy];
			panStartWorld = [panX, panY];
			e.preventDefault();
			return;
		}

		if (e.button !== 0) return;

		if (activeTool === 'select') {
			// Check if clicking a node
			const hit = findNodeNear(wx, wy);
			if (hit) {
				selected = { kind: 'node', data: hit };
				dragNode = hit;
				dragStartWorld = [hit.x, hit.y];
				pushUndo();
			} else {
				// Check member hit
				const memberHit = findMemberNear(wx, wy);
				if (memberHit) {
					selected = { kind: 'member', data: memberHit };
				} else {
					selected = null;
					// Start pan
					isPanning = true;
					panStartScreen = [sx, sy];
					panStartWorld = [panX, panY];
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
				};
				refLines = [...refLines, newRL];
				selected = { kind: 'refline', data: newRL };
				reflineStart = null;
			}
		}
	}

	function onPointerMove(e: MouseEvent) {
		if (!svgEl) return;
		const [sx, sy] = getSvgXY(e);
		const [wx, wy] = screenToWorld(sx, sy);
		mouseWorldX = snapWorld(wx);
		mouseWorldY = snapWorld(wy);

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
			// Trigger reactivity
			nodes = nodes;
			return;
		}
	}

	function onPointerUp(_e: MouseEvent) {
		isPanning = false;
		if (dragNode) {
			dragNode = null;
		}
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 0.9 : 1.1;
		const newZoom = Math.max(0.05, Math.min(5, zoom * factor));

		// Zoom toward cursor
		const [sx, sy] = getSvgXY(e);
		const [wx, wy] = screenToWorld(sx, sy);
		zoom = newZoom;
		// Adjust pan so world point stays under cursor
		panX = wx - (sx - canvasW / 2) / newZoom;
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
		}
		if (e.metaKey || e.ctrlKey) {
			if (e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
			if (e.key === 'y') { e.preventDefault(); redo(); }
		}
		// Tool shortcuts
		if (!(e.target instanceof HTMLInputElement)) {
			if (e.key === 'v' || e.key === '1') activeTool = 'select';
			if (e.key === 'n' || e.key === '2') activeTool = 'node';
			if (e.key === 'm' || e.key === '3') activeTool = 'member';
			if (e.key === 'c' || e.key === '4') activeTool = 'constraint';
			if (e.key === 'd' || e.key === '5') activeTool = 'dimension';
			if (e.key === 'r' || e.key === '6') activeTool = 'refline';
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
			frontWheelRadiusMm, rearWheelRadiusMm, nextId, layers, unitSystem,
		};
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
	}
	function loadState() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const data = JSON.parse(raw);
			nodes = data.nodes ?? [];
			members = data.members ?? [];
			constraints = data.constraints ?? [];
			dimensions = data.dimensions ?? [];
			refLines = data.refLines ?? [];
			panX = data.panX ?? 0;
			panY = data.panY ?? 0;
			zoom = data.zoom ?? 0.5;
			wheelbaseMm = data.wheelbaseMm ?? 1500;
			seatHeightMm = data.seatHeightMm ?? 800;
			rakeAngleDeg = data.rakeAngleDeg ?? 27;
			frontWheelRadiusMm = data.frontWheelRadiusMm ?? 312;
			rearWheelRadiusMm = data.rearWheelRadiusMm ?? 312;
			nextId = data.nextId ?? 1;
			unitSystem = data.unitSystem ?? 'metric';
			if (data.layers) {
				for (const k of Object.keys(layers)) {
					if (k in data.layers) (layers as any)[k] = data.layers[k];
				}
			}
		} catch {}
	}

	$effect(() => { loadState(); });
	$effect(() => {
		// Auto-save on any data change
		const _ = [nodes, members, constraints, dimensions, refLines, panX, panY, zoom,
			wheelbaseMm, seatHeightMm, rakeAngleDeg, frontWheelRadiusMm, rearWheelRadiusMm, layers, unitSystem];
		saveState();
	});

	function resetView() {
		panX = wheelbaseMm / 2;
		panY = 300;
		zoom = 0.5;
	}

	// ── Derived geometry for front/rear reference ──
	// Right-side view: rear on left (X=0), front on right (X=wheelbase)
	const rearContactX = $derived(0);
	const frontContactX = $derived(wheelbaseMm);
	const frontAxleY = $derived(frontWheelRadiusMm);
	const rearAxleY = $derived(rearWheelRadiusMm);

	// Steering axis
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
	};

	// Tool config
	const tools: { id: Tool; label: string; icon: string; shortcut: string }[] = [
		{ id: 'select', label: 'Select / Move', icon: '⇲', shortcut: 'V' },
		{ id: 'node', label: 'Node', icon: '◉', shortcut: 'N' },
		{ id: 'member', label: 'Frame Member', icon: '╱', shortcut: 'M' },
		{ id: 'constraint', label: 'Constraint', icon: '▽', shortcut: 'C' },
		{ id: 'dimension', label: 'Dimension', icon: '↔', shortcut: 'D' },
		{ id: 'refline', label: 'Reference Line', icon: '┄', shortcut: 'R' },
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
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-[calc(100vh-220px)] min-h-[500px] rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
	<!-- ── Top Toolbar ── -->
	<div class="flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-3 py-1.5 text-xs shrink-0">
		<button class="px-2 py-1 rounded hover:bg-gray-800 text-gray-400 disabled:opacity-30" onclick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)">↩ Undo</button>
		<button class="px-2 py-1 rounded hover:bg-gray-800 text-gray-400 disabled:opacity-30" onclick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)">↪ Redo</button>
		<div class="w-px h-4 bg-gray-700"></div>
		<button class="px-2 py-1 rounded hover:bg-gray-800 text-gray-400" onclick={resetView} title="Reset View">⊞ Reset View</button>
		<button class="px-2 py-1 rounded hover:bg-gray-800 {showGrid ? 'text-orange-400' : 'text-gray-500'}" onclick={() => showGrid = !showGrid} title="Toggle Grid (G)">▦ Grid</button>
		<button class="px-2 py-1 rounded hover:bg-gray-800 {showSnap ? 'text-orange-400' : 'text-gray-500'}" onclick={() => showSnap = !showSnap} title="Toggle Snap (S)">⊹ Snap {fmtSnapLabel()}</button>
		<div class="w-px h-4 bg-gray-700"></div>
		<button class="px-2 py-1 rounded hover:bg-gray-800 {unitSystem === 'metric' ? 'text-orange-400' : 'text-gray-500'}" onclick={() => unitSystem = 'metric'} title="Metric (mm)">mm</button>
		<button class="px-2 py-1 rounded hover:bg-gray-800 {unitSystem === 'us' ? 'text-orange-400' : 'text-gray-500'}" onclick={() => unitSystem = 'us'} title="US (inches)">in</button>
		<div class="w-px h-4 bg-gray-700"></div>
		<span class="text-gray-600">Zoom: {(zoom * 100).toFixed(0)}%</span>
		<span class="text-gray-600 ml-2">Cursor: ({fmtCoord(mouseWorldX)}, {fmtCoord(mouseWorldY)}) {fmtUnit()}</span>
		<div class="flex-1"></div>
		{#if selected}
			<button class="px-2 py-1 rounded hover:bg-red-900/40 text-red-400" onclick={deleteSelected} title="Delete (Del)">✕ Delete</button>
		{/if}
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- ── Left Tool Palette ── -->
		<div class="w-14 shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col items-center py-2 gap-1">
			{#each tools as tool}
				<button
					type="button"
					class="w-10 h-10 flex flex-col items-center justify-center rounded text-xs transition-colors
						{activeTool === tool.id
							? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
							: 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}"
					onclick={() => { activeTool = tool.id; memberStartId = null; dimStartId = null; reflineStart = null; }}
					title="{tool.label} ({tool.shortcut})"
				>
					<span class="text-base leading-none">{tool.icon}</span>
					<span class="text-[8px] mt-0.5 leading-none">{tool.shortcut}</span>
				</button>
			{/each}

			<div class="flex-1"></div>

			<!-- Layer toggles -->
			<div class="w-full px-1 space-y-0.5">
				<div class="text-[7px] text-gray-600 uppercase tracking-widest text-center mb-1">Layers</div>
				{#each Object.entries(layers) as [key, visible]}
					<button
						type="button"
						class="w-full text-[7px] px-0.5 py-0.5 rounded truncate transition-colors {visible ? 'text-gray-300 bg-gray-800' : 'text-gray-600 hover:text-gray-400'}"
						onclick={() => (layers as any)[key] = !visible}
						title="{layerLabels[key]}"
					>
						{layerLabels[key]}
					</button>
				{/each}
			</div>
		</div>

		<!-- ── Central Canvas ── -->
		<div class="flex-1 relative overflow-hidden" bind:this={containerEl}>
			<svg
				bind:this={svgEl}
				class="w-full h-full"
				style="cursor: {activeTool === 'select' ? (isPanning ? 'grabbing' : 'default') : 'crosshair'};"
				onpointerdown={onPointerDown}
				onpointermove={onPointerMove}
				onpointerup={onPointerUp}
				onwheel={onWheel}
				oncontextmenu={(e) => e.preventDefault()}
			>
				<!-- Background -->
				<rect x="0" y="0" width={canvasW} height={canvasH} fill="#0a0a0f" />

				<!-- Grid -->
				{#if showGrid}
					{@const gLeft = Math.floor(viewLeft / gridStep) * gridStep}
					{@const gRight = Math.ceil(viewRight / gridStep) * gridStep}
					{@const gBottom = Math.floor(viewBottom / gridStep) * gridStep}
					{@const gTop = Math.ceil(viewTop / gridStep) * gridStep}
					{#each { length: Math.min(200, Math.ceil((gRight - gLeft) / gridStep) + 1) } as _, i}
						{@const wx = gLeft + i * gridStep}
						{@const [sx] = worldToScreen(wx, 0)}
						{@const isMajor = Math.abs(wx % majorGridStep) < 0.5}
						<line x1={sx} y1="0" x2={sx} y2={canvasH} stroke={isMajor ? '#1e293b' : '#111827'} stroke-width={isMajor ? 1 : 0.5} />
					{/each}
					{#each { length: Math.min(200, Math.ceil((gTop - gBottom) / gridStep) + 1) } as _, i}
						{@const wy = gBottom + i * gridStep}
						{@const [, sy] = worldToScreen(0, wy)}
						{@const isMajor = Math.abs(wy % majorGridStep) < 0.5}
						<line x1="0" y1={sy} x2={canvasW} y2={sy} stroke={isMajor ? '#1e293b' : '#111827'} stroke-width={isMajor ? 1 : 0.5} />
					{/each}
				{/if}

				<!-- Origin axes -->
				{#if true}
				{@const [ox, oy] = worldToScreen(0, 0)}
				<line x1={ox} y1="0" x2={ox} y2={canvasH} stroke="#1e3a5f" stroke-width="1" stroke-dasharray="6,4" />
				<line x1="0" y1={oy} x2={canvasW} y2={oy} stroke="#1e3a5f" stroke-width="1" stroke-dasharray="6,4" />
				{/if}

				<!-- ── Ground reference line ── -->
				{#if true}
				{@const [, groundSy] = worldToScreen(0, 0)}
				<line x1="0" y1={groundSy} x2={canvasW} y2={groundSy} stroke="#22c55e" stroke-width="1.5" stroke-opacity="0.4" />
				<text x="4" y={groundSy - 4} fill="#22c55e" font-size="10" opacity="0.6">Ground</text>
				{/if}

				<!-- ── Wheels (reference) ── -->
				{#if layers.wheels}
					<!-- Front wheel -->
					{@const [fax, fay] = worldToScreen(frontContactX, frontAxleY)}
					{@const wr = frontWheelRadiusMm * zoom}
					<circle cx={fax} cy={fay} r={wr} fill="none" stroke="#4b5563" stroke-width="1.5" stroke-dasharray="4,4" />
					<circle cx={fax} cy={fay} r="3" fill="#6b7280" />
					<text x={fax} y={fay - wr - 6} text-anchor="middle" fill="#6b7280" font-size="9">Front</text>
					<!-- Rear wheel -->
					{@const [rax, ray] = worldToScreen(rearContactX, rearAxleY)}
					{@const rr = rearWheelRadiusMm * zoom}
					<circle cx={rax} cy={ray} r={rr} fill="none" stroke="#4b5563" stroke-width="1.5" stroke-dasharray="4,4" />
					<circle cx={rax} cy={ray} r="3" fill="#6b7280" />
					<text x={rax} y={ray - rr - 6} text-anchor="middle" fill="#6b7280" font-size="9">Rear</text>
				{/if}

				<!-- ── Steering axis reference ── -->
				{#if layers.steering}
					{@const saLen = 600}
					{@const saBaseX = frontContactX}
					{@const saBaseY = 0}
					{@const saDx = -Math.sin(rakeRad)}
					{@const saDy = Math.cos(rakeRad)}
					{@const [sa1x, sa1y] = worldToScreen(saBaseX - saLen * 0.2 * saDx, saBaseY - saLen * 0.2 * saDy)}
					{@const [sa2x, sa2y] = worldToScreen(saBaseX + saLen * saDx, saBaseY + saLen * saDy)}
					<line x1={sa1x} y1={sa1y} x2={sa2x} y2={sa2y} stroke="#f97316" stroke-width="1" stroke-dasharray="8,4" opacity="0.5" />
					<text x={sa2x + 4} y={sa2y - 4} fill="#f97316" font-size="9" opacity="0.7">{rakeAngleDeg}° rake</text>
				{/if}

				<!-- ── Reference lines ── -->
				{#if layers.reflines}
					{#each refLines as rl}
						{@const [rx1, ry1] = worldToScreen(rl.x1, rl.y1)}
						{@const [rx2, ry2] = worldToScreen(rl.x2, rl.y2)}
						<line x1={rx1} y1={ry1} x2={rx2} y2={ry2}
							stroke="#6366f1" stroke-width="1" stroke-dasharray="6,3" opacity="0.6"
							class={selected?.kind === 'refline' && (selected.data as RefLine).id === rl.id ? 'stroke-2' : ''} />
						{#if rl.label}
							<text x={(rx1 + rx2) / 2} y={(ry1 + ry2) / 2 - 6} text-anchor="middle" fill="#6366f1" font-size="9" opacity="0.7">{rl.label}</text>
						{/if}
					{/each}
					<!-- Refline preview -->
					{#if reflineStart}
						{@const [psx, psy] = worldToScreen(reflineStart.x, reflineStart.y)}
						{@const [pex, pey] = worldToScreen(mouseWorldX, mouseWorldY)}
						<line x1={psx} y1={psy} x2={pex} y2={pey} stroke="#6366f1" stroke-width="1" stroke-dasharray="3,3" opacity="0.4" />
					{/if}
				{/if}

				<!-- ── Frame members ── -->
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
					<!-- Member preview line -->
					{#if memberStartId}
						{@const sn = nodeById(memberStartId)}
						{#if sn}
							{@const [msx, msy] = worldToScreen(sn.x, sn.y)}
							{@const [mex, mey] = worldToScreen(mouseWorldX, mouseWorldY)}
							<line x1={msx} y1={msy} x2={mex} y2={mey} stroke="#60a5fa" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.5" />
						{/if}
					{/if}
				{/if}

				<!-- ── Constraints ── -->
				{#if layers.constraints}
					{#each constraints as c}
						{@const n = nodeById(c.nodeIds[0])}
						{#if n}
							{@const [cx_, cy_] = worldToScreen(n.x, n.y)}
							{@const isSelected = selected?.kind === 'constraint' && (selected.data as Constraint).id === c.id}
							{#if c.type === 'fixed'}
								<!-- Fixed: triangle -->
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

				<!-- ── Dimensions ── -->
				{#if layers.dimensions}
					{#each dimensions as dim}
						{@const a = nodeById(dim.startId)}
						{@const b = nodeById(dim.endId)}
						{#if a && b}
							{@const [ax, ay] = worldToScreen(a.x, a.y)}
							{@const [bx, by] = worldToScreen(b.x, b.y)}
							{@const mx = (ax + bx) / 2}
							{@const my = (ay + by) / 2}
							{@const dist = Math.hypot(b.x - a.x, b.y - a.y)}
							{@const isSelected = selected?.kind === 'dimension' && (selected.data as Dimension).id === dim.id}
							<!-- Dimension line with arrows -->
							<line x1={ax} y1={ay - dim.offset} x2={bx} y2={by - dim.offset}
								stroke={isSelected ? '#fbbf24' : '#a78bfa'} stroke-width="1" />
							<!-- Extension lines -->
							<line x1={ax} y1={ay} x2={ax} y2={ay - dim.offset - 4}
								stroke="#a78bfa" stroke-width="0.5" opacity="0.5" />
							<line x1={bx} y1={by} x2={bx} y2={by - dim.offset - 4}
								stroke="#a78bfa" stroke-width="0.5" opacity="0.5" />
							<!-- Arrows -->
							<polygon points="{ax},{ay - dim.offset} {ax + 5},{ay - dim.offset - 3} {ax + 5},{ay - dim.offset + 3}"
								fill={isSelected ? '#fbbf24' : '#a78bfa'} />
							<polygon points="{bx},{by - dim.offset} {bx - 5},{by - dim.offset - 3} {bx - 5},{by - dim.offset + 3}"
								fill={isSelected ? '#fbbf24' : '#a78bfa'} />
							<!-- Label -->
							<text x={mx} y={((ay + by) / 2) - dim.offset - 6} text-anchor="middle" fill="#c4b5fd" font-size="10" font-family="monospace">
								{fmtDimLabel(dist)}
							</text>
						{/if}
					{/each}
				{/if}

				<!-- ── Nodes ── -->
				{#each nodes as n}
					{@const isAnchor = n.type === 'anchor' || n.type === 'steering_head' || n.type === 'rear_axle' || n.type === 'rear_module'}
					{@const layerOk = (isAnchor ? layers.anchors : layers.frame)}
					{#if layerOk}
						{@const [nx, ny] = worldToScreen(n.x, n.y)}
						{@const isSelected = selected?.kind === 'node' && selected.data.id === n.id}
						{@const isHovered = hoveredNodeId === n.id}
						{@const color = nodeTypeColors[n.type]}
						<circle cx={nx} cy={ny} r={isSelected ? 7 : isHovered ? 6 : 5}
							fill={isSelected ? '#fbbf24' : color}
							stroke={isSelected ? '#fff' : isHovered ? '#fff' : 'none'}
							stroke-width={isSelected ? 2 : 1}
							onpointerenter={() => hoveredNodeId = n.id}
							onpointerleave={() => hoveredNodeId = null}
							style="cursor: pointer;" />
						{#if n.label || n.type !== 'generic'}
							<text x={nx + 9} y={ny - 6} fill={color} font-size="9" opacity="0.8">
								{n.label || nodeTypeLabels[n.type]}
							</text>
						{/if}
						<!-- Coordinate label on hover -->
						{#if isHovered || isSelected}
							<text x={nx + 9} y={ny + 14} fill="#9ca3af" font-size="8" font-family="monospace">
								({fmtCoord(n.x)}, {fmtCoord(n.y)})
							</text>
						{/if}
					{/if}
				{/each}

				<!-- ── Rider overlay ── -->
				{#if layers.rider}
					<!-- Simple mannequin: head, torso, legs (schematic) using seat height -->
					{@const seatX = wheelbaseMm * 0.55}
					{@const [hx, hy] = worldToScreen(seatX, seatHeightMm + 350)}
					{@const [sx, sy] = worldToScreen(seatX, seatHeightMm)}
					{@const [fx, fy] = worldToScreen(seatX + 200, 0)}
					<!-- Head -->
					<circle cx={hx} cy={hy} r={16 * zoom > 8 ? 16 * zoom : 8} fill="none" stroke="#34d399" stroke-width="1" opacity="0.3" />
					<!-- Torso -->
					<line x1={hx} y1={hy + (16 * zoom > 8 ? 16 * zoom : 8)} x2={sx} y2={sy} stroke="#34d399" stroke-width="1.5" opacity="0.3" />
					<!-- Legs -->
					{@const [kx, ky] = worldToScreen(seatX + 100, seatHeightMm * 0.5)}
					<line x1={sx} y1={sy} x2={kx} y2={ky} stroke="#34d399" stroke-width="1.5" opacity="0.3" />
					<line x1={kx} y1={ky} x2={fx} y2={fy} stroke="#34d399" stroke-width="1.5" opacity="0.3" />
					<!-- Arms to steering area -->
					{@const [ax_, ay_] = worldToScreen(frontContactX - 50, seatHeightMm + 100)}
					<line x1={hx} y1={hy + (16 * zoom > 8 ? 16 * zoom : 8)} x2={ax_} y2={ay_} stroke="#34d399" stroke-width="1" opacity="0.2" stroke-dasharray="4,3" />
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

				<!-- ── Coordinate readout ── -->
				<text x={canvasW - 4} y={canvasH - 4} text-anchor="end" fill="#374151" font-size="9" font-family="monospace">
					{unitSystem === 'us' ? 'X→ longitudinal  Y↑ vertical  (inches)' : 'X→ longitudinal  Y↑ vertical  (mm)'}
				</text>
			</svg>

			<!-- Tool hint overlay -->
			<div class="absolute top-2 left-2 text-[10px] text-gray-600 pointer-events-none">
				{#if activeTool === 'node'}
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
						Click end point. Esc to cancel.
					{:else}
						Click start point.
					{/if}
				{:else if activeTool === 'constraint'}
					Click a node to add constraint.
				{:else if activeTool === 'select'}
					Click to select. Drag nodes to move. Scroll to zoom. Left-drag empty space to pan.
				{/if}
			</div>
		</div>

		<!-- ── Right Properties Panel ── -->
		<div class="w-56 shrink-0 border-l border-gray-800 bg-gray-900 overflow-y-auto">
			<div class="p-3 space-y-4 text-xs">
				<!-- Selection info -->
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
							{#if true}
							{@const len = Math.hypot(rl.x2 - rl.x1, rl.y2 - rl.y1)}
							<div class="text-gray-500">
								Length: <span class="text-gray-300 font-mono">{len.toFixed(1)} mm</span>
							</div>
							{/if}
						</div>
					{:else}
						<p class="text-gray-600 italic">Nothing selected</p>
					{/if}
				</div>

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
							<input type="number" step="10" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
								bind:value={wheelbaseMm} />
						</div>
						<div>
							<label class="text-gray-500 block mb-0.5">Seat height ({fmtUnit()})</label>
							<input type="number" step="10" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
								bind:value={seatHeightMm} />
						</div>
						<div>
							<label class="text-gray-500 block mb-0.5">Rake angle (°)</label>
							<input type="number" step="0.5" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
								bind:value={rakeAngleDeg} />
						</div>
						<div>
							<label class="text-gray-500 block mb-0.5">Front wheel radius ({fmtUnit()})</label>
							<input type="number" step="1" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
								bind:value={frontWheelRadiusMm} />
						</div>
						<div>
							<label class="text-gray-500 block mb-0.5">Rear wheel radius ({fmtUnit()})</label>
							<input type="number" step="1" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs font-mono"
								bind:value={rearWheelRadiusMm} />
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
