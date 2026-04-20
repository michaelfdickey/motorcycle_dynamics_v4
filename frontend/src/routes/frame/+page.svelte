<script lang="ts">
	let activeTab = $state(0);

	const models = [
		{
			id: 0,
			short: 'Geometry Layout',
			title: 'Rigid Geometry Layout Model',
			summary: 'This is the non-structural foundation. It treats the vehicle as a set of points, lines, reference bodies, and constraints with no deformation or force response. Its purpose is to establish the geometry language of the platform: wheelbase, rake, trail, seat position, steering axis, engine envelope, rider packaging, suspension anchor locations, and body volume. This is where broad concept sketching lives.',
			technical: 'This model is a kinematic scene model. There is no stiffness matrix, no force vector, and no displacement solution. The system consists of named geometric entities and dimensional constraints.',
			sections: [
				{
					heading: 'Core Entities',
					items: [
						'Nodes / points: 2D or 3D coordinates',
						'Lines / axes: steering axis, swingarm line, frame centerlines',
						'Circles / arcs: wheels, steering sweep, suspension travel arcs',
						'Bodies / envelopes: rider torso, engine, battery, shell, cargo volume',
						'Reference planes: ground plane, symmetry plane, body datum planes',
					],
				},
				{
					heading: 'Typical Inputs',
					items: [
						'Absolute dimensions',
						'Parametric constraints',
						'Rider anthropometric dimensions',
						'Tire diameters and contact patch locations',
						'Drivetrain and suspension hardpoint locations',
					],
				},
				{
					heading: 'Typical Outputs',
					items: [
						'Wheelbase',
						'Seat height',
						'Ground clearance',
						'Front and rear weight-arm distances',
						'Steering axis intersection and trail',
						'Packaging overlap / collision warnings',
						'Motion envelopes for steering and suspension',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'Sketch constraints',
						'Dimension editing',
						'Layer visibility',
						'Envelope toggles',
						'Parametric sliders for rake, trail, wheelbase, seat recline, etc.',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'geometry/points.py',
						'geometry/constraints.py',
						'geometry/primitives.py',
						'layout/rider_fit.py',
						'layout/vehicle_params.py',
						'ui/sketch_controls.py',
					],
				},
			],
			note: 'Internal data model uses a graph-based parametric system: entities, constraints, dependency resolution, recompute engine. This layer should feed all later models.',
		},
		{
			id: 1,
			short: '2D Truss',
			title: '2D Truss Model',
			summary: 'This is the first force-based model. It represents the frame as pin-jointed axial members that can only carry tension and compression. It is not realistic enough to represent an actual motorcycle frame by itself, but it is extremely useful for early topology exploration and understanding load paths.',
			technical: 'This is a standard 2D truss finite element model.',
			sections: [
				{
					heading: 'Assumptions',
					items: [
						'Members are connected by ideal pins',
						'Members carry only axial load',
						'No bending moment transfer',
						'No rotational degrees of freedom at nodes',
					],
				},
				{
					heading: 'Degrees of Freedom',
					items: ['Per node: u_x, u_y'],
				},
				{
					heading: 'Element Formulation',
					items: [
						'Node coordinates: (x\u2081, y\u2081), (x\u2082, y\u2082)',
						'Length L, direction cosines c, s',
						'Material and section properties: E, A',
						'Local axial stiffness: k_local = (EA/L) [1 -1; -1 1]',
						'Transform into 4\u00d74 global element stiffness matrix using direction cosines',
					],
				},
				{
					heading: 'Global Solution',
					items: ['Assemble: Ku = f', 'Apply boundary conditions and solve for nodal displacements'],
				},
				{
					heading: 'Typical Use Cases',
					items: [
						'Brake reaction load paths',
						'Engine mount force routing',
						'Approximate tension/compression map',
						'Early frame topology comparison',
					],
				},
				{
					heading: 'Outputs',
					items: [
						'Axial force per member',
						'Member stress \u03c3 = F/A',
						'Factor of safety',
						'Approximate Euler buckling margin for compression members',
						'Nodal displacements',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'Pin/roller/fixed supports',
						'Point loads',
						'Distributed nodal load generators',
						'Display axial-only coloring',
						'Toggle tension vs compression display',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'fea/truss2d/elements.py',
						'fea/truss2d/assembly.py',
						'fea/truss2d/solver.py',
						'fea/truss2d/postprocess.py',
						'loads/basic_cases.py',
						'visualization/truss_plot.py',
					],
				},
			],
			note: 'This layer remains useful even after more advanced models exist because it is very fast and excellent for topology optimization intuition.',
		},
		{
			id: 2,
			short: '2D Beam',
			title: '2D Beam Model',
			summary: 'This is the first model that captures member bending. It represents members as beams with stiffness in axial extension and flexure, making it much more realistic for motorcycle frame side-view studies than a truss model. It still misses torsion and true 3D effects, but it is a strong starting point for a frame simulator.',
			technical: 'This is typically an Euler\u2013Bernoulli beam FEM in 2D.',
			sections: [
				{
					heading: 'Assumptions',
					items: [
						'Small deflections',
						'Plane sections remain plane',
						'Shear deformation neglected initially',
						'In-plane analysis only',
					],
				},
				{
					heading: 'Degrees of Freedom',
					items: ['Per node: u_x, u_y, \u03b8_z'],
				},
				{
					heading: 'Element Properties',
					items: ['E: Young\u2019s modulus', 'A: area', 'I: second moment of area', 'L: element length'],
				},
				{
					heading: 'Element Stiffness',
					items: ['Local 6\u00d76 beam element combining axial and bending contributions'],
				},
				{
					heading: 'Captures',
					items: [
						'Axial stretching/compression',
						'Vertical and longitudinal bending',
						'End moments and joint moment transfer',
						'Side-view deflection under braking or bump load',
					],
				},
				{
					heading: 'Typical Load Cases',
					items: [
						'Vertical rider weight',
						'Engine weight',
						'Front axle braking reaction',
						'Rear wheel bump load',
						'Seat support load',
					],
				},
				{
					heading: 'Outputs',
					items: [
						'Nodal displacements',
						'Element shear force and bending moment diagrams',
						'Normal stress from axial + bending',
						'Deflected shape',
						'Peak moment locations',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'Cross-section library',
						'Beam property assignment',
						'Local axis display',
						'Moment and shear diagrams',
						'Load case selector',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'fea/beam2d/elements.py',
						'fea/beam2d/section_props.py',
						'fea/beam2d/assembly.py',
						'fea/beam2d/postprocess.py',
						'viz/moment_diagrams.py',
					],
				},
			],
			note: 'This is a good place to introduce section-property calculators for tube, box, plate, and custom sections.',
		},
		{
			id: 3,
			short: '2D Frame',
			title: '2D Frame Model',
			summary: 'This is the first genuinely useful "frame simulator" tier for motorcycle concept work. In practice, it is the same mathematical family as 2D beam FEM, but used as a complete frame-analysis environment with real joints, supports, section properties, and mixed load cases. It is where a side-view structural approximation becomes productively actionable.',
			technical: 'A 2D frame model is a beam-network structural model where joint continuity, support constraints, and load application are treated as part of a whole assembled frame.',
			sections: [
				{
					heading: 'What Distinguishes It from Basic Beam Mode',
					items: [
						'Real multi-member structures',
						'Rigid joints or partial-release joints',
						'Distributed loads',
						'Mixed member types',
						'Load combinations',
						'Subframe / main frame / swingarm interactions in 2D projection',
					],
				},
				{
					heading: 'Core Mathematical System',
					items: [
						'Still: Ku = f',
						'But now with: releases, multi-point constraints, more complex support types, member-end force recovery, load combinations',
					],
				},
				{
					heading: 'Useful Capabilities',
					items: [
						'Frame stiffness map',
						'Joint force resolution',
						'Brake dive load path',
						'Swingarm pivot reaction estimates',
						'Side-plane optimization',
					],
				},
				{
					heading: 'Outputs',
					items: [
						'Global stiffness estimates',
						'Nodal displacement contours',
						'Peak stress by member',
						'Member utilization',
						'Joint reaction tables',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'End-moment release toggles',
						'Joint type selection',
						'Load combinations',
						'Design-study parameter sweeps',
						'Cross-section swapping',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'frame2d/model.py',
						'frame2d/joints.py',
						'frame2d/releases.py',
						'frame2d/load_combos.py',
						'frame2d/results.py',
					],
				},
			],
			note: 'This is the lowest level where you can start comparing alternative frame architectures in a meaningful way.',
		},
		{
			id: 4,
			short: '2.5D Multi-Plane',
			title: 'Multi-Plane / 2.5D Frame Model',
			summary: 'This is an intermediate model that approximates torsional and cross-frame behavior without requiring a full 3D beam solver. You represent the chassis using multiple coupled 2D planes, typically side view, top view, and possibly front view, with cross-member coupling or equivalent torsional springs. This is a high-value transitional tier.',
			technical: 'This is not a canonical textbook element type so much as a composite structural approximation framework.',
			sections: [
				{
					heading: 'Strategy',
					items: [
						'Represent: side plane members, top plane members, cross-ties between planes, equivalent torsional coupling elements',
					],
				},
				{
					heading: 'Why Use It',
					items: [
						'A motorcycle frame is not just bending in one plane',
						'Cornering, offset masses, uneven road loads, and steering loads create torsional deformation',
						'Before full 3D beams, multi-plane coupling can estimate these effects cheaply',
					],
				},
				{
					heading: 'Ways to Implement',
					items: [
						'Two or three coupled 2D FEM systems',
						'Cross-members modeled as springs or beam surrogates',
						'Equivalent torsional stiffness assigned between frame stations',
						'Reduced-order bridge from side-frame rails to top-frame spread',
					],
				},
				{
					heading: 'Typical Outputs',
					items: [
						'Approximate torsional twist along frame',
						'Side-to-side displacement differential',
						'Cross-member load transfer',
						'Frame station twist plots',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'Plane visibility toggles',
						'Coupling stiffness sliders',
						'Equivalent torsion calibration controls',
						'Symmetry assumptions on/off',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'multiplane/model.py',
						'multiplane/coupling.py',
						'multiplane/calibration.py',
						'multiplane/results.py',
					],
				},
			],
			note: 'This layer is approximate, but extremely valuable if you want insight before full 3D.',
		},
		{
			id: 5,
			short: '3D Beam / Space-Frame',
			title: '3D Beam / Space-Frame Model',
			summary: 'This is the first model that is fully motorcycle-relevant for structural behavior. It captures 3D bending, torsion, axial deformation, and out-of-plane response. For a tubular, boxed, or skeletal recumbent motorcycle chassis, this is the core structural model you will likely spend the most time using.',
			technical: 'This is a 3D beam FEM, ideally using Timoshenko beam elements eventually, though Euler\u2013Bernoulli may suffice initially.',
			sections: [
				{
					heading: 'Degrees of Freedom',
					items: ['Per node: u_x, u_y, u_z, \u03b8_x, \u03b8_y, \u03b8_z'],
				},
				{
					heading: 'Captures',
					items: [
						'Axial extension',
						'Bending about two axes',
						'Torsion',
						'Shear deformation (if Timoshenko)',
						'Off-axis coupling due to member orientation',
					],
				},
				{
					heading: 'Element Properties',
					items: ['E, G, A', 'I_y, I_z', 'J (torsional constant)', 'Local orientation axes'],
				},
				{
					heading: 'Typical Load Cases',
					items: [
						'Vertical static loads',
						'Longitudinal braking loads',
						'Lateral cornering loads',
						'Engine torque reactions',
						'Rider offset loading',
						'Asymmetric road bump loads',
					],
				},
				{
					heading: 'Outputs',
					items: [
						'3D deflected shape',
						'Member forces and moments in local axes',
						'Torsional twist',
						'Stress estimates',
						'Compliance at steering head, seat, swingarm pivot',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'3D node editing',
						'Local axis viewer',
						'Load-vector gizmos',
						'Per-member section assignment',
						'Mirror/symmetry tools',
						'Twist visualization',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'fea/beam3d/elements.py',
						'fea/beam3d/transforms.py',
						'fea/beam3d/assembly.py',
						'fea/beam3d/loads.py',
						'fea/beam3d/postprocess.py',
						'viz/beam3d_viewer.py',
					],
				},
			],
			note: 'You need consistent local coordinate frame construction for each beam. That is a major source of bugs.',
		},
		{
			id: 6,
			short: 'Lumped-Mass',
			title: 'Lumped-Mass + Flexible Frame Model',
			summary: 'This adds inertial realism by placing concentrated masses for rider, engine, wheels, battery, fuel, shell, etc. onto the structural frame model. This is the bridge between static structure and dynamic vehicle behavior. It is essential for a recumbent platform because the unusual rider position and body packaging materially change inertial coupling.',
			technical: 'This is a structural model with attached mass and inertia elements.',
			sections: [
				{
					heading: 'Additions',
					items: [
						'Point masses at nodes',
						'Rigid-body inertia tensors for major components',
						'Distributed mass converted into equivalent nodal masses',
						'Optional CG tracking by subsystem',
					],
				},
				{
					heading: 'Why This Matters',
					items: [
						'Pure stiffness tells only half the story',
						'Dynamic behavior depends on: mass distribution, mass moments of inertia, where the mass sits relative to flexible structure',
					],
				},
				{
					heading: 'Mathematical Form',
					items: [
						'Static: Ku = f',
						'Dynamic: M\u00fc + C\u016b + Ku = f(t)',
						'M = mass matrix, C = damping matrix, K = stiffness matrix',
					],
				},
				{
					heading: 'Outputs',
					items: [
						'Subsystem CG',
						'Mode participation tendency',
						'Static sag with realistic mass placement',
						'Inertial loading under acceleration/braking',
						'Support reactions with vehicle mass included',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'Component mass editor',
						'Inertia tensor assignment',
						'Auto-place mass at envelope centroid',
						'Mass grouping/layer controls',
						'CG display',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'dynamics/mass_models.py',
						'dynamics/inertia.py',
						'dynamics/assemble_mass.py',
						'vehicle/components.py',
					],
				},
			],
			note: 'This becomes the foundation for modal and transient solvers.',
		},
		{
			id: 7,
			short: 'Modal Analysis',
			title: 'Modal Analysis Model',
			summary: 'This solves for natural frequencies and mode shapes of the frame-plus-mass system. It does not directly simulate handling, but it tells you where the structure is compliant, how it wants to vibrate, and whether you are approaching problematic flexible behavior. This is highly relevant for motorcycles because weave, wobble, and rider-induced resonance all interact with structural modes.',
			technical: 'This is an eigenvalue problem derived from the mass and stiffness matrices.',
			sections: [
				{
					heading: 'Governing Equation',
					items: [
						'For undamped free vibration: M\u00fc + Ku = 0',
						'Assume harmonic motion: u = \u03c6 e^{i\u03c9t}',
						'Then: (K \u2212 \u03c9\u00b2M)\u03c6 = 0',
						'Solve for: eigenvalues \u03c9\u00b2, eigenvectors \u03c6',
					],
				},
				{
					heading: 'Outputs',
					items: [
						'Natural frequencies',
						'Mode shapes',
						'Nodal deformation amplitudes',
						'Effective modal masses',
						'Relative participation by subsystem',
					],
				},
				{
					heading: 'Practical Uses',
					items: [
						'Identify weak torsional regions',
						'Compare frame concepts',
						'Estimate sensitivity to steering-head shake',
						'Understand shell/frame resonance',
						'Check whether accessory masses create bad modes',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'Number of modes to solve',
						'Constrained/free mode options',
						'Mode animation playback',
						'Frequency table',
						'Modal participation viewer',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'modal/eigensolve.py',
						'modal/mode_shapes.py',
						'modal/participation.py',
						'viz/mode_animator.py',
					],
				},
			],
			note: 'Use sparse eigensolvers once models grow beyond toy size.',
		},
		{
			id: 8,
			short: 'Time-Domain',
			title: 'Time-Domain Structural Dynamics Model',
			summary: 'This is the first true transient structural simulation layer. Instead of just solving a static load or a mode shape, it simulates how the structure moves over time under changing loads. This is where you begin to see how frame flex responds to braking events, bump impacts, rider movement, engine pulses, or oscillatory inputs.',
			technical: 'This is a time integration solver for the second-order system: M\u00fc + C\u016b + Ku = f(t).',
			sections: [
				{
					heading: 'Core Ingredients',
					items: [
						'Mass matrix',
						'Damping model',
						'Stiffness matrix',
						'Time-varying load function',
						'Initial conditions',
					],
				},
				{
					heading: 'Common Numerical Methods',
					items: [
						'Newmark-beta',
						'Hilber\u2013Hughes\u2013Taylor',
						'Central difference for explicit cases',
						'Runge\u2013Kutta on state-space form',
					],
				},
				{
					heading: 'Inputs',
					items: [
						'Load histories',
						'Pulse loads',
						'Harmonic loads',
						'Road-event impulses',
						'Torque pulses',
					],
				},
				{
					heading: 'Outputs',
					items: [
						'Displacement vs time',
						'Velocity vs time',
						'Acceleration vs time',
						'Stress histories',
						'Transient twist and compliance',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'Play/pause time scrubber',
						'Simulation timestep',
						'Damping controls',
						'Load waveform editor',
						'Sensor probe points',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'transient/newmark.py',
						'transient/state_space.py',
						'transient/load_history.py',
						'transient/probes.py',
						'viz/time_series.py',
					],
				},
			],
			note: 'This is the first layer where structural flex can be linked meaningfully to vehicle events.',
		},
		{
			id: 9,
			short: 'Shell Elements',
			title: 'Shell Element Model',
			summary: 'This introduces surface-based finite elements for structures where plate and skin behavior matter: sheet-metal chassis, stressed skins, body shells, composite fairings, floor pans, seat pans, and monocoque concepts. For an enclosed recumbent design, shell modeling becomes increasingly important because body structure may start carrying meaningful load.',
			technical: 'This is a plate/shell finite element model using triangular or quadrilateral shell elements.',
			sections: [
				{
					heading: 'Captures',
					items: [
						'In-plane membrane stress',
						'Bending stress in thin structures',
						'Local panel deformation',
						'Buckling tendency',
						'Load spreading across skins',
					],
				},
				{
					heading: 'Appropriate Uses',
					items: [
						'Sheet-metal subframes',
						'Stressed body shell',
						'Floor pan and side shell analysis',
						'Fairing stiffness',
						'Composite panel approximations',
					],
				},
				{
					heading: 'Key Properties',
					items: [
						'Thickness',
						'Orthotropic material support for composites',
						'Laminate stackups eventually',
						'Local shell normals and mesh quality',
					],
				},
				{
					heading: 'Outputs',
					items: [
						'von Mises stress',
						'Membrane vs bending stress components',
						'Local displacement contours',
						'Buckling mode precursors',
						'Panel utilization',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'Mesh density controls',
						'Thickness assignment painter',
						'Laminate editor (later)',
						'Shell-to-beam connection tools',
						'Contour overlay',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'shell/mesh.py',
						'shell/elements.py',
						'shell/materials.py',
						'shell/assembly.py',
						'shell/postprocess.py',
					],
				},
			],
			note: 'You may not want to write a full shell solver immediately. It may be better to support import/export or surrogate reduced models first.',
		},
		{
			id: 10,
			short: 'Solid / Nonlinear',
			title: 'Solid / Nonlinear / Contact Structural Model',
			summary: 'This is the highest-fidelity structural tier. It uses 3D continuum elements and can include material yielding, large deformation, contact, and local stress concentration effects. This is for final validation: joints, brackets, lugs, welded nodes, bonded regions, crash-relevant local structure, and extreme load cases. It is not where concept design starts, but it is where detailed design eventually converges.',
			technical: 'This is a 3D continuum FEM, optionally with nonlinear solution procedures.',
			sections: [
				{
					heading: 'Element Types',
					items: ['Tetrahedral', 'Hexahedral', 'Wedge / pyramid transitional elements'],
				},
				{
					heading: 'Captures',
					items: [
						'Full 3D stress tensor',
						'Local notch effects',
						'Contact pressure',
						'Bolt-region and weld-adjacent stress fields',
						'Material plasticity',
						'Geometric nonlinearity',
						'Large deflection',
						'Local buckling and collapse behavior',
					],
				},
				{
					heading: 'Governing Form',
					items: [
						'Nonlinear equilibrium: R(u) = f_ext \u2212 f_int(u) = 0',
						'Using: Newton\u2013Raphson, incremental load stepping, contact iteration',
					],
				},
				{
					heading: 'Outputs',
					items: [
						'Local stress/strain',
						'Plastic regions',
						'Contact status',
						'Deformation progression',
						'Failure initiation indicators',
					],
				},
				{
					heading: 'Controls / UI',
					items: [
						'Contact pair definitions',
						'Material model selection',
						'Nonlinear convergence settings',
						'Load stepping controls',
						'Cut sections / clipping planes',
					],
				},
				{
					heading: 'Python Modules',
					items: [
						'solid/mesh.py',
						'solid/material_models.py',
						'solid/nonlinear_solver.py',
						'solid/contact.py',
						'solid/postprocess.py',
					],
				},
			],
			note: 'This is computationally expensive and usually not where your custom package should focus first. Often the better approach is to build lower-order specialized solvers and interface outward for this tier.',
		},
	];

	const active = $derived(models[activeTab]);
</script>

<div class="space-y-6">
	<h2 class="text-2xl font-bold">Frame</h2>

	<!-- Sub-tabs -->
	<div class="flex flex-wrap gap-1 border-b border-gray-800 pb-1">
		{#each models as m}
			<button
				type="button"
				class="px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap
					{activeTab === m.id
						? 'bg-gray-800 text-orange-400 border-t border-x border-orange-500/40'
						: 'text-gray-500 hover:text-gray-200 hover:bg-gray-800/50'}"
				onclick={() => activeTab = m.id}
			>
				{m.id}. {m.short}
			</button>
		{/each}
	</div>

	<!-- Active model detail -->
	<div class="rounded-lg border border-gray-800 bg-gray-900 p-6 space-y-6">
		<!-- Header -->
		<div>
			<h3 class="text-lg font-semibold text-gray-100">{active.title}</h3>
			<span class="inline-block mt-1 px-2 py-0.5 text-[10px] uppercase tracking-widest rounded bg-gray-800 text-gray-500">Level {active.id}</span>
		</div>

		<!-- Summary -->
		<div>
			<h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Model Summary</h4>
			<p class="text-sm text-gray-300 leading-relaxed">{active.summary}</p>
		</div>

		<!-- Technical description -->
		<div>
			<h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Technical Description</h4>
			<p class="text-sm text-gray-400 leading-relaxed">{active.technical}</p>
		</div>

		<!-- Sections -->
		<div class="grid gap-4 sm:grid-cols-2">
			{#each active.sections as section}
				<div class="rounded border border-gray-800 bg-gray-950 p-3">
					<h5 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{section.heading}</h5>
					<ul class="space-y-1">
						{#each section.items as item}
							<li class="text-sm text-gray-400 flex gap-2">
								<span class="text-gray-600 shrink-0">&bull;</span>
								<span>{item}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>

		<!-- Note -->
		{#if active.note}
			<div class="rounded border border-orange-500/20 bg-orange-500/5 px-4 py-3">
				<p class="text-sm text-orange-300/80"><span class="font-semibold text-orange-400">Note:</span> {active.note}</p>
			</div>
		{/if}
	</div>
</div>
