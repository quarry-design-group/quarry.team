/**
 * Architecture diagrams for long-form content (case studies): the typed data
 * model an author writes, and the pure layout that turns it into SVG geometry
 * at build time. `ArchitectureDiagram.astro` renders the result; nothing here
 * runs in the browser.
 *
 * The model is a grid read left to right. Lanes stack top to bottom, each a
 * labelled band of one or more rows; a node sits in one lane at a column and a
 * row within that lane. Flows are the paths a request or an event takes, as an
 * ordered list of node ids. Edges are derived from consecutive steps in the
 * flows, so the picture, the hover highlight and the text alternative all come
 * from the same source and cannot disagree.
 *
 * A step that runs backwards (to an earlier column, or up its own column) is a
 * return path: it is drawn dashed through a channel beneath the lanes and
 * enters its target from the left, so feedback loops (a reverse-ETL write-back)
 * read as loops. Containers are labelled boxes drawn around nodes and other
 * containers (a network, an availability zone, a compliance boundary); they
 * may nest but never partly overlap.
 *
 * Geometry is in SVG user units of the diagram's viewBox (the diagram scales
 * as a whole), not CSS pixels.
 */

/** How a node reads: an outside actor (dashed), a regular step, or a key step (accented). */
export type DiagramNodeKind = 'actor' | 'step' | 'key';

/** Colour of a short annotation under a node. */
export type DiagramTone = 'primary' | 'accent';

export interface DiagramLane {
  id: string;
  /** Shown as the lane heading; numbered by the component (`01 · …`). */
  label: string;
  /** Rows in the lane; nodes in it use `row` 0 … rows − 1. Default 1. */
  rows?: number;
}

export interface DiagramNode {
  id: string;
  lane: string;
  /** 0-based column, shared by every lane. */
  col: number;
  /** 0-based row within the lane. Default 0. */
  row?: number;
  kind?: DiagramNodeKind;
  /** The node's name — its button label. */
  title: string;
  /** One short line under the title. */
  detail?: string;
  /** Opens in the node's detail card. Plain sentences; one string per paragraph. */
  description: string[];
  /** A short tag on the node's top edge (e.g. "Gate"). */
  badge?: string;
  /** A short annotation under the node, kept to one line. */
  note?: { text: string; tone?: DiagramTone };
}

export interface DiagramGroup {
  /** A heading drawn above the topmost of `nodes` (e.g. "Destinations"). */
  label: string;
  nodes: string[];
}

export interface DiagramFlow {
  id: string;
  /** Names the path in the text alternative and the detail cards. */
  label: string;
  /** Node ids in order; each consecutive pair is an edge. A step back to an
   *  earlier column (or up its own column) is drawn as a return path. */
  steps: string[];
  /** A short label drawn along the flow's return path, if it has one. */
  returnLabel?: string;
}

/** How a container is drawn: a compliance or trust boundary (tinted), a
 *  network (solid), a zone within one (dashed), or a plain grouping (dotted). */
export type DiagramContainerKind = 'boundary' | 'network' | 'zone' | 'group';

export interface DiagramContainer {
  id: string;
  label: string;
  kind: DiagramContainerKind;
  /** Node ids and container ids directly inside it. */
  contains: string[];
}

export interface Diagram {
  /** Unique on the page; prefixes every element id (kebab-case). */
  id: string;
  /** Small mono heading above the title. */
  kicker?: string;
  /** The figure's title, set in the display face. */
  title: string;
  /** Continues the title in the muted colour. */
  subtitle?: string;
  lanes: DiagramLane[];
  nodes: DiagramNode[];
  groups?: DiagramGroup[];
  flows: DiagramFlow[];
  /** Labelled boxes around nodes and other containers. */
  containers?: DiagramContainer[];
  /** A strip under the lanes for what underpins everything (e.g. the foundation). */
  footer?: { label: string; items: string[] };
  /** Spacing overrides for a dense diagram (containers need wider gaps). */
  geometry?: Partial<Pick<Geometry, 'colWidth' | 'colGap' | 'rowGap' | 'laneGap'>>;
  /** In-page minimum width: `wide` raises it for a diagram with many columns,
   *  so its text keeps a legible size and the region scrolls instead. */
  floor?: 'standard' | 'wide';
}

/** Identity helper so a data file is type-checked against the model. */
export const defineDiagram = (diagram: Diagram): Diagram => diagram;

/**
 * The component highlights a flow with one static CSS rule per flow slot
 * (`f1` … `f16`), which keeps the stylesheet static under the strict CSP
 * (ADR-0015). Raise this together with the rules in ArchitectureDiagram.astro.
 */
export const MAX_FLOWS = 16;

/** Layout constants, in viewBox units. */
export const GEOMETRY = {
  pad: 40,
  colWidth: 248,
  colGap: 72,
  /** Node height. At the in-page floor scale (~0.6) a node's button stays
   *  at least 44 CSS px tall (WCAG 2.5.5, AAA). */
  rowHeight: 88,
  rowGap: 24,
  /** Lane heading band above a lane's first row. */
  laneHead: 40,
  /** Space between lanes; a node's note sits in it. */
  laneGap: 56,
  /** Height of the footer strip. */
  footerHeight: 64,
  /** Gap left between an arrowhead's tip and the node it points at. */
  arrowGap: 6,
  /** Arrowhead length. A connector stops at the head's base, so its stroke
   *  never runs into the narrowing tip. */
  arrowLength: 9,
  /** Straight run where a curved connector leaves and enters a node, so it
   *  meets the node, and its arrowhead, square. */
  lead: 10,
  /** Return paths: the first channel's distance below the lowest node, and
   *  the spacing between channels. */
  returnDrop: 40,
  returnStep: 22,
  /** Container padding on each side, plus the label band at its top. */
  containerPad: 12,
  containerHead: 26,
} as const;

export type Geometry = { -readonly [K in keyof typeof GEOMETRY]: number };

export interface PlacedNode extends DiagramNode {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Flow slots (`f1` …) this node is on. */
  flowSlots: string[];
  /** Lane label, for the detail card. */
  laneLabel: string;
  /** Labels of the containers around the node, outermost first. */
  containerPath: string[];
}

export interface PlacedEdge {
  from: string;
  to: string;
  d: string;
  flowSlots: string[];
  /** Drawn dashed, through the channel beneath the lanes. */
  isReturn: boolean;
  /** Label along the channel, from the flow's `returnLabel`. */
  label?: { text: string; x: number; y: number };
}

export interface PlacedContainer {
  id: string;
  label: string;
  kind: DiagramContainerKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 for an outermost container. */
  depth: number;
  /** Titles of the nodes directly inside, and the containers directly inside. */
  nodeTitles: string[];
  childIds: string[];
}

export interface PlacedGroup {
  label: string;
  x: number;
  y: number;
  nodes: PlacedNode[];
}

/** What a lane renders, in reading order: a node, or a labelled group of nodes. */
export type LaneItem = { node: PlacedNode } | { group: PlacedGroup };

export interface PlacedLane {
  id: string;
  label: string;
  /** Heading baseline: above the row the lane's leftmost node sits on, so
   *  the heading reads with its path rather than the lane's top edge. */
  labelY: number;
  top: number;
  bottom: number;
  /** Nodes left to right (then top to bottom), groups kept together: the
   *  order a screen reader meets them, under the lane's heading. */
  items: LaneItem[];
}

export interface DiagramLayout {
  /** viewBox origin; negative when containers reach past the grid's margin. */
  minX: number;
  minY: number;
  width: number;
  height: number;
  containers: PlacedContainer[];
  lanes: PlacedLane[];
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  groups: PlacedGroup[];
  footer?: { label: string; items: string[]; y: number };
  /** Flows with their slot and resolved node titles, for the text alternative. */
  flows: (DiagramFlow & { slot: string; titles: string[] })[];
}

const ID = /^[a-z][a-z0-9-]*$/;

/** Throws on a malformed diagram, so a broken data file fails the build, not the page. */
export function validateDiagram(diagram: Diagram): void {
  const fail = (msg: string): never => {
    throw new Error(`Diagram "${diagram.id}": ${msg}`);
  };
  if (!ID.test(diagram.id)) fail('id must be kebab-case');
  if (diagram.lanes.length === 0) fail('needs at least one lane');
  if (diagram.flows.length === 0) fail('needs at least one flow');
  if (diagram.flows.length > MAX_FLOWS) fail(`has more than ${MAX_FLOWS} flows`);

  const lanes = new Map<string, DiagramLane>();
  for (const lane of diagram.lanes) {
    if (lanes.has(lane.id)) fail(`duplicate lane "${lane.id}"`);
    if ((lane.rows ?? 1) < 1) fail(`lane "${lane.id}" needs at least one row`);
    lanes.set(lane.id, lane);
  }

  const nodes = new Set<string>();
  const cells = new Set<string>();
  for (const node of diagram.nodes) {
    if (!ID.test(node.id)) fail(`node id "${node.id}" must be kebab-case`);
    if (nodes.has(node.id)) fail(`duplicate node "${node.id}"`);
    nodes.add(node.id);
    const lane =
      lanes.get(node.lane) ?? fail(`node "${node.id}" is in unknown lane "${node.lane}"`);
    const row = node.row ?? 0;
    if (!Number.isInteger(node.col) || node.col < 0) fail(`node "${node.id}" has a bad col`);
    if (!Number.isInteger(row) || row < 0 || row >= (lane.rows ?? 1)) {
      fail(`node "${node.id}" row ${row} is outside lane "${lane.id}"`);
    }
    const cell = `${node.lane}:${node.col}:${row}`;
    if (cells.has(cell)) fail(`node "${node.id}" overlaps another node`);
    cells.add(cell);
    if (node.description.length === 0) fail(`node "${node.id}" needs a description`);
  }

  const flows = new Set<string>();
  for (const flow of diagram.flows) {
    if (flows.has(flow.id)) fail(`duplicate flow "${flow.id}"`);
    flows.add(flow.id);
    if (flow.steps.length < 2) fail(`flow "${flow.id}" needs at least two steps`);
    for (const step of flow.steps) {
      if (!nodes.has(step)) fail(`flow "${flow.id}" names unknown node "${step}"`);
    }
  }

  const containers = new Map((diagram.containers ?? []).map((c) => [c.id, c]));
  const parentOf = new Map<string, string>();
  for (const container of diagram.containers ?? []) {
    if (!ID.test(container.id)) fail(`container id "${container.id}" must be kebab-case`);
    if (nodes.has(container.id)) fail(`container "${container.id}" shares an id with a node`);
    if (container.contains.length === 0) fail(`container "${container.id}" is empty`);
    for (const id of container.contains) {
      if (!nodes.has(id) && !containers.has(id)) {
        fail(`container "${container.id}" names unknown node or container "${id}"`);
      }
      if (parentOf.has(id)) fail(`"${id}" is inside more than one container`);
      parentOf.set(id, container.id);
    }
  }
  if (containers.size !== (diagram.containers ?? []).length) fail('duplicate container id');
  for (const id of containers.keys()) {
    const seen = new Set<string>();
    for (let at: string | undefined = id; at; at = parentOf.get(at)) {
      if (seen.has(at)) fail(`container "${id}" contains itself`);
      seen.add(at);
    }
  }

  const laneOf = new Map(diagram.nodes.map((n) => [n.id, n.lane]));
  const grouped = new Set<string>();
  for (const group of diagram.groups ?? []) {
    if (group.nodes.length === 0) fail(`group "${group.label}" is empty`);
    for (const id of group.nodes) {
      if (!nodes.has(id)) fail(`group "${group.label}" names unknown node "${id}"`);
      if (grouped.has(id)) fail(`node "${id}" is in more than one group`);
      grouped.add(id);
    }
    if (new Set(group.nodes.map((id) => laneOf.get(id))).size > 1) {
      fail(`group "${group.label}" spans lanes; a group sits within one lane`);
    }
  }
}

/** Lays the diagram out on its grid. Validates first. */
export function layoutDiagram(diagram: Diagram): DiagramLayout {
  validateDiagram(diagram);
  const g: Geometry = { ...GEOMETRY, ...diagram.geometry };

  const cols = Math.max(...diagram.nodes.map((n) => n.col)) + 1;
  const width = g.pad * 2 + cols * g.colWidth + (cols - 1) * g.colGap;

  const lanes: PlacedLane[] = [];
  let y = g.pad;
  for (const lane of diagram.lanes) {
    const rows = lane.rows ?? 1;
    const top = y + g.laneHead;
    const bottom = top + rows * g.rowHeight + (rows - 1) * g.rowGap;
    lanes.push({ id: lane.id, label: lane.label, labelY: y + 14, top, bottom, items: [] });
    y = bottom + g.laneGap;
  }
  // Return paths run in channels beneath the last lane, above the footer.
  const returnSteps = diagram.flows.flatMap((f) =>
    f.steps.slice(1).filter((_, i) => isBackward(diagram, f.steps[i], f.steps[i + 1])),
  ).length;
  const lastBottom = lanes[lanes.length - 1].bottom;
  if (returnSteps > 0) y += g.returnDrop + (returnSteps - 1) * g.returnStep;
  const footer = diagram.footer ? { ...diagram.footer, y } : undefined;
  const gridHeight = footer ? y + g.footerHeight + g.pad / 2 : y - g.laneGap + g.pad;

  const slotOf = new Map(diagram.flows.map((f, i) => [f.id, `f${i + 1}`]));
  const laneById = new Map(lanes.map((l) => [l.id, l]));

  const nodes: PlacedNode[] = diagram.nodes.map((node) => {
    const lane = laneById.get(node.lane) as PlacedLane;
    return {
      ...node,
      x: g.pad + node.col * (g.colWidth + g.colGap),
      y: lane.top + (node.row ?? 0) * (g.rowHeight + g.rowGap),
      w: g.colWidth,
      h: g.rowHeight,
      flowSlots: diagram.flows
        .filter((f) => f.steps.includes(node.id))
        .map((f) => slotOf.get(f.id) as string),
      laneLabel: lane.label,
      containerPath: [],
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // A lane heading sits over its path: above the row of the lane's leftmost
  // node, unless a node on an earlier row would sit under the heading text.
  for (const lane of lanes) {
    const own = nodes.filter((n) => n.lane === lane.id);
    const firstCol = Math.min(...own.map((n) => n.col));
    const row = Math.min(...own.filter((n) => n.col === firstCol).map((n) => n.row ?? 0));
    const span = Math.ceil(((lane.label.length + 5) * 10) / (g.colWidth + g.colGap));
    const blocked = own.some((n) => (n.row ?? 0) < row && n.col < firstCol + span);
    if (!blocked) lane.labelY += row * (g.rowHeight + g.rowGap);
  }

  const edges = new Map<string, PlacedEdge>();
  let channel = 0;
  for (const flow of diagram.flows) {
    for (let i = 1; i < flow.steps.length; i++) {
      const key = `${flow.steps[i - 1]}>${flow.steps[i]}`;
      const slot = slotOf.get(flow.id) as string;
      const existing = edges.get(key);
      if (existing) {
        if (!existing.flowSlots.includes(slot)) existing.flowSlots.push(slot);
        continue;
      }
      const a = byId.get(flow.steps[i - 1]) as PlacedNode;
      const b = byId.get(flow.steps[i]) as PlacedNode;
      if (isBackward(diagram, a.id, b.id)) {
        const cy = lastBottom + g.returnDrop + channel * g.returnStep;
        channel += 1;
        const { d, label } = returnPath(a, b, cy, g);
        edges.set(key, {
          from: a.id,
          to: b.id,
          d,
          flowSlots: [slot],
          isReturn: true,
          label: flow.returnLabel ? { text: flow.returnLabel, ...label } : undefined,
        });
      } else {
        edges.set(key, {
          from: a.id,
          to: b.id,
          d: edgePath(a, b, g),
          flowSlots: [slot],
          isReturn: false,
        });
      }
    }
  }

  const containers = placeContainers(diagram, byId, g);

  // The viewBox takes in every container (they may reach past the margin).
  const minX = Math.min(0, ...containers.map((c) => c.x - g.containerPad));
  const minY = Math.min(0, ...containers.map((c) => c.y - g.containerPad));
  const maxX = Math.max(width, ...containers.map((c) => c.x + c.w + g.containerPad));
  const maxY = Math.max(gridHeight, ...containers.map((c) => c.y + c.h + g.containerPad));

  const readingOrder = (a: PlacedNode, b: PlacedNode) => a.col - b.col || a.y - b.y;
  const groups: PlacedGroup[] = (diagram.groups ?? []).map((group) => {
    const members = group.nodes.map((id) => byId.get(id) as PlacedNode).sort(readingOrder);
    const top = members.reduce((m, n) => (n.y < m.y ? n : m));
    return {
      label: group.label,
      x: Math.min(...members.map((n) => n.x)),
      y: top.y - 12,
      nodes: members,
    };
  });
  const groupOf = new Map(groups.flatMap((gr) => gr.nodes.map((n) => [n.id, gr] as const)));
  for (const lane of lanes) {
    const placed = new Set<PlacedGroup>();
    for (const node of nodes.filter((n) => n.lane === lane.id).sort(readingOrder)) {
      const group = groupOf.get(node.id);
      if (!group) lane.items.push({ node });
      else if (!placed.has(group)) {
        placed.add(group);
        lane.items.push({ group });
      }
    }
  }

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
    containers,
    lanes,
    nodes,
    edges: [...edges.values()],
    groups,
    footer,
    flows: diagram.flows.map((f) => ({
      ...f,
      slot: slotOf.get(f.id) as string,
      titles: f.steps.map((id) => (byId.get(id) as PlacedNode).title),
    })),
  };
}

/** A step that runs to an earlier column, or up its own column. */
export function isBackward(diagram: Diagram, fromId: string, toId: string): boolean {
  const a = diagram.nodes.find((n) => n.id === fromId);
  const b = diagram.nodes.find((n) => n.id === toId);
  if (!a || !b) return false;
  if (b.col < a.col) return true;
  if (b.col > a.col) return false;
  const lanes = diagram.lanes.map((l) => l.id);
  const ai = lanes.indexOf(a.lane);
  const bi = lanes.indexOf(b.lane);
  return bi < ai || (bi === ai && (b.row ?? 0) <= (a.row ?? 0));
}

/**
 * Connector from `a` to `b`, ending short of `b` for the arrowhead. Forward
 * edges leave the right side and enter the left (straight on one row, an
 * S-curve across rows); an edge within one column runs top to bottom.
 */
export function edgePath(a: PlacedNode, b: PlacedNode, g: Geometry = GEOMETRY): string {
  const { arrowGap, arrowLength, lead } = g;
  const stop = arrowGap + arrowLength;
  if (b.col > a.col) {
    const sx = a.x + a.w;
    const sy = a.y + a.h / 2;
    const ex = b.x - stop;
    const ey = b.y + b.h / 2;
    if (sy === ey) return `M${sx} ${sy}H${ex}`;
    // Straight out, an S-curve with level tangents at both ends, straight in.
    const x1 = sx + lead;
    const x2 = ex - lead;
    const mid = x1 + (x2 - x1) / 2;
    return `M${sx} ${sy}H${x1}C${mid} ${sy} ${mid} ${ey} ${x2} ${ey}H${ex}`;
  }
  const x = a.x + a.w / 2;
  return `M${x} ${a.y + a.h}V${b.y - stop}`;
}

/**
 * A return path from `a` back to `b`: down from `a` into the channel at `cy`,
 * across beneath the lanes, up the gap to the left of `b`, and into `b` from
 * the left, square-cornered so it reads as a loop rather than a forward step.
 */
export function returnPath(
  a: PlacedNode,
  b: PlacedNode,
  cy: number,
  g: Geometry = GEOMETRY,
): { d: string; label: { x: number; y: number } } {
  const stop = g.arrowGap + g.arrowLength;
  const sx = a.x + a.w / 2;
  const ex = b.x - stop;
  const ey = b.y + b.h / 2;
  const lx = b.x - stop - 14;
  const r = 10;
  const d =
    `M${sx} ${a.y + a.h}V${cy - r}Q${sx} ${cy} ${sx - r} ${cy}` +
    `H${lx + r}Q${lx} ${cy} ${lx} ${cy - r}V${ey + r}Q${lx} ${ey} ${lx + r} ${ey}H${ex}`;
  return { d, label: { x: lx + (sx - lx) / 2, y: cy - 8 } };
}

/** Boxes for the containers, sized to what they hold, innermost first. */
function placeContainers(
  diagram: Diagram,
  byId: Map<string, PlacedNode>,
  g: Geometry,
): PlacedContainer[] {
  const defs = new Map((diagram.containers ?? []).map((c) => [c.id, c]));
  const parentOf = new Map<string, string>();
  for (const c of defs.values()) for (const id of c.contains) parentOf.set(id, c.id);
  const depthOf = (id: string): number => {
    let depth = 0;
    for (let at = parentOf.get(id); at; at = parentOf.get(at)) depth += 1;
    return depth;
  };

  const boxes = new Map<string, PlacedContainer>();
  const boxOf = (id: string): { x: number; y: number; w: number; h: number } => {
    const node = byId.get(id);
    if (node) return node;
    const done = boxes.get(id);
    if (done) return done;
    const def = defs.get(id) as DiagramContainer;
    const inner = def.contains.map(boxOf);
    const x0 = Math.min(...inner.map((b) => b.x)) - g.containerPad;
    const y0 = Math.min(...inner.map((b) => b.y)) - g.containerPad - g.containerHead;
    // Never narrower than its label: mono glyphs advance 0.6em plus 0.1em
    // tracking at the label's 15-unit size (`.dg-box-label`).
    const labelWidth = def.label.length * 15 * 0.7 + 28;
    const x1 = Math.max(Math.max(...inner.map((b) => b.x + b.w)) + g.containerPad, x0 + labelWidth);
    const y1 = Math.max(...inner.map((b) => b.y + b.h)) + g.containerPad;
    const placed: PlacedContainer = {
      id,
      label: def.label,
      kind: def.kind,
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
      depth: depthOf(id),
      nodeTitles: def.contains.filter((c) => byId.has(c)).map((c) => byId.get(c)!.title),
      childIds: def.contains.filter((c) => defs.has(c)),
    };
    boxes.set(id, placed);
    return placed;
  };
  for (const id of defs.keys()) boxOf(id);

  // Nodes learn the containers around them, outermost first.
  for (const node of byId.values()) {
    const path: string[] = [];
    for (let at = parentOf.get(node.id); at; at = parentOf.get(at)) {
      path.unshift((defs.get(at) as DiagramContainer).label);
    }
    node.containerPath = path;
  }

  // Containers may nest, never partly overlap; nor may a node sit in one
  // it does not belong to.
  const list = [...boxes.values()];
  const inside = (outer: string, inner: string) => {
    for (let at = parentOf.get(inner); at; at = parentOf.get(at)) if (at === outer) return true;
    return false;
  };
  const meets = (
    p: { x: number; y: number; w: number; h: number },
    q: { x: number; y: number; w: number; h: number },
  ) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  for (const a of list) {
    for (const b of list) {
      if (a.id >= b.id || inside(a.id, b.id) || inside(b.id, a.id)) continue;
      if (meets(a, b)) {
        throw new Error(`Diagram "${diagram.id}": containers "${a.id}" and "${b.id}" overlap`);
      }
    }
    for (const node of byId.values()) {
      if (!inside(a.id, node.id) && meets(a, node)) {
        throw new Error(
          `Diagram "${diagram.id}": node "${node.id}" sits inside container "${a.id}" without belonging to it`,
        );
      }
    }
  }
  return list.sort((p, q) => p.depth - q.depth);
}
