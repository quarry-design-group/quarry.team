import { describe, expect, it } from 'vitest';
import { GEOMETRY, MAX_FLOWS, layoutDiagram, type Diagram } from './diagram';

const base = (): Diagram => ({
  id: 'test',
  title: 'Test',
  lanes: [
    { id: 'a', label: 'Lane A' },
    { id: 'b', label: 'Lane B', rows: 3 },
  ],
  nodes: [
    { id: 'one', lane: 'a', col: 0, title: 'One', description: ['…'] },
    { id: 'two', lane: 'a', col: 1, title: 'Two', description: ['…'] },
    { id: 'hub', lane: 'b', col: 0, row: 1, title: 'Hub', description: ['…'] },
    { id: 'up', lane: 'b', col: 1, row: 0, title: 'Up', description: ['…'] },
    { id: 'down', lane: 'b', col: 1, row: 2, title: 'Down', description: ['…'] },
  ],
  flows: [
    { id: 'top', label: 'Top', steps: ['one', 'two'] },
    { id: 'u', label: 'Up', steps: ['hub', 'up'] },
    { id: 'd', label: 'Down', steps: ['hub', 'down'] },
  ],
});

describe('layoutDiagram', () => {
  it('places nodes on the column grid and stacks lanes', () => {
    const { nodes, lanes, width } = layoutDiagram(base());
    const g = GEOMETRY;
    expect(width).toBe(g.pad * 2 + 2 * g.colWidth + g.colGap);
    const two = nodes.find((n) => n.id === 'two')!;
    expect(two.x).toBe(g.pad + g.colWidth + g.colGap);
    expect(two.y).toBe(lanes[0].top);
    const down = nodes.find((n) => n.id === 'down')!;
    expect(down.y).toBe(lanes[1].top + 2 * (g.rowHeight + g.rowGap));
    expect(lanes[1].top).toBeGreaterThan(lanes[0].bottom);
  });

  it('assigns each flow a slot and tags its nodes and edges', () => {
    const { nodes, edges, flows } = layoutDiagram(base());
    expect(flows.map((f) => f.slot)).toEqual(['f1', 'f2', 'f3']);
    expect(nodes.find((n) => n.id === 'hub')!.flowSlots).toEqual(['f2', 'f3']);
    expect(nodes.find((n) => n.id === 'down')!.flowSlots).toEqual(['f3']);
    expect(edges).toHaveLength(3);
    expect(flows[2].titles).toEqual(['Hub', 'Down']);
  });

  it('merges a step shared by several flows into one edge', () => {
    const d = base();
    d.flows.push({ id: 'again', label: 'Again', steps: ['one', 'two'] });
    const { edges } = layoutDiagram(d);
    const shared = edges.filter((e) => e.from === 'one' && e.to === 'two');
    expect(shared).toHaveLength(1);
    expect(shared[0].flowSlots).toEqual(['f1', 'f4']);
  });

  it('draws a straight connector on one row and a curve across rows', () => {
    const { edges } = layoutDiagram(base());
    expect(edges.find((e) => e.to === 'two')!.d).toMatch(/^M[\d.]+ [\d.]+H[\d.]+$/);
    expect(edges.find((e) => e.to === 'up')!.d).toContain('C');
  });

  it('sets a lane heading over the row its path starts on', () => {
    const { lanes, nodes } = layoutDiagram(base());
    const hub = nodes.find((n) => n.id === 'hub')!;
    // Lane B's leftmost node (hub) is on row 1; nothing sits under the heading on row 0.
    expect(lanes[1].labelY).toBeLessThan(hub.y);
    expect(hub.y - lanes[1].labelY).toBeLessThan(GEOMETRY.laneHead);
  });

  it('keeps a lane heading at the top when a node would sit under it', () => {
    const d = base();
    // A heading long enough to reach column 1, where 'up' sits on row 0.
    d.lanes[1].label = 'A lane heading long enough to span two columns';
    const { lanes } = layoutDiagram(d);
    expect(lanes[1].labelY).toBeLessThan(lanes[1].top);
  });

  it('ends every connector at the arrowhead base, entering level', () => {
    const { edges, nodes } = layoutDiagram(base());
    const up = nodes.find((n) => n.id === 'up')!;
    const curve = edges.find((e) => e.to === 'up')!.d;
    const stop = up.x - GEOMETRY.arrowGap - GEOMETRY.arrowLength;
    expect(curve).toMatch(new RegExp(`H${stop}$`));
  });

  it('places a group label above its topmost node', () => {
    const d = { ...base(), groups: [{ label: 'Out', nodes: ['down', 'up'] }] };
    const { groups, nodes } = layoutDiagram(d);
    expect(groups[0].y).toBeLessThan(nodes.find((n) => n.id === 'up')!.y);
  });
});

describe('return paths', () => {
  it('draws a backwards step dashed through a channel beneath the lanes', () => {
    const d = base();
    d.flows.push({ id: 'back', label: 'Back', steps: ['up', 'hub'], returnLabel: 'Written back' });
    const { edges, lanes, height } = layoutDiagram(d);
    const back = edges.find((e) => e.from === 'up' && e.to === 'hub')!;
    expect(back.isReturn).toBe(true);
    const lastBottom = lanes[lanes.length - 1].bottom;
    const channel = Math.max(
      ...(back.d.match(/V[\d.]+|Q[\d.]+ ([\d.]+)/g) ?? []).map((m) =>
        Number(m.split(/[ VQ]/).pop()),
      ),
    );
    expect(channel).toBeGreaterThan(lastBottom);
    expect(height).toBeGreaterThan(channel);
    expect(back.label).toMatchObject({ text: 'Written back' });
    // It enters its target from the left, level, at the arrowhead's base.
    const hub = layoutDiagram(d).nodes.find((n) => n.id === 'hub')!;
    expect(back.d).toMatch(new RegExp(`H${hub.x - GEOMETRY.arrowGap - GEOMETRY.arrowLength}$`));
  });

  it('keeps forward steps solid', () => {
    expect(layoutDiagram(base()).edges.every((e) => !e.isReturn)).toBe(true);
  });
});

describe('containers', () => {
  const boxed = (): Diagram => ({
    ...base(),
    containers: [
      { id: 'outer', label: 'Outer', kind: 'boundary', contains: ['inner'] },
      { id: 'inner', label: 'Inner', kind: 'zone', contains: ['one', 'two'] },
    ],
  });

  it('sizes a container to what it holds, nested inside its parent', () => {
    const { containers, nodes } = layoutDiagram(boxed());
    const outer = containers.find((c) => c.id === 'outer')!;
    const inner = containers.find((c) => c.id === 'inner')!;
    const one = nodes.find((n) => n.id === 'one')!;
    expect(inner.x).toBe(one.x - GEOMETRY.containerPad);
    expect(inner.y).toBe(one.y - GEOMETRY.containerPad - GEOMETRY.containerHead);
    expect(outer.x).toBeLessThan(inner.x);
    expect(outer.y).toBeLessThan(inner.y);
    expect(outer.depth).toBe(0);
    expect(inner.depth).toBe(1);
  });

  it('tells each node the containers around it, outermost first', () => {
    const { nodes } = layoutDiagram(boxed());
    expect(nodes.find((n) => n.id === 'two')!.containerPath).toEqual(['Outer', 'Inner']);
    expect(nodes.find((n) => n.id === 'hub')!.containerPath).toEqual([]);
  });

  it('widens the viewBox to take in a container past the margin', () => {
    const { minX, minY, width, height, containers } = layoutDiagram(boxed());
    // The outer box reaches above the top margin, so the origin moves up.
    expect(minY).toBeLessThan(0);
    for (const c of containers) {
      expect(c.x).toBeGreaterThanOrEqual(minX);
      expect(c.y).toBeGreaterThanOrEqual(minY);
      expect(c.x + c.w).toBeLessThanOrEqual(minX + width);
      expect(c.y + c.h).toBeLessThanOrEqual(minY + height);
    }
  });
});

describe('validation fails the build on a malformed diagram', () => {
  const broken = (mutate: (d: Diagram) => void) => () => {
    const d = base();
    mutate(d);
    layoutDiagram(d);
  };

  it('rejects an unknown node in a flow', () => {
    expect(broken((d) => d.flows[0].steps.push('nope'))).toThrow(/unknown node "nope"/);
  });
  it('rejects two nodes in one cell', () => {
    expect(broken((d) => (d.nodes[1].col = 0))).toThrow(/overlaps/);
  });
  it('rejects a row outside its lane', () => {
    expect(broken((d) => (d.nodes[0].row = 1))).toThrow(/outside lane/);
  });
  it('rejects a container that names an unknown member', () => {
    expect(
      broken(
        (d) => (d.containers = [{ id: 'box', label: 'Box', kind: 'group', contains: ['nope'] }]),
      ),
    ).toThrow(/unknown node or container "nope"/);
  });
  it('rejects a member in two containers', () => {
    expect(
      broken(
        (d) =>
          (d.containers = [
            { id: 'a-box', label: 'A', kind: 'group', contains: ['one'] },
            { id: 'b-box', label: 'B', kind: 'group', contains: ['one'] },
          ]),
      ),
    ).toThrow(/inside more than one container/);
  });
  it('rejects containers that partly overlap', () => {
    expect(
      broken(
        (d) =>
          (d.containers = [
            { id: 'a-box', label: 'A', kind: 'group', contains: ['hub', 'up'] },
            { id: 'b-box', label: 'B', kind: 'group', contains: ['down'] },
          ]),
      ),
    ).toThrow(/overlap|without belonging/);
  });
  it('rejects a container around a node it does not hold', () => {
    expect(
      broken(
        (d) =>
          (d.containers = [{ id: 'box', label: 'Box', kind: 'group', contains: ['two', 'down'] }]),
      ),
    ).toThrow(/without belonging/);
  });
  it(`rejects more than ${MAX_FLOWS} flows (one CSS highlight slot each)`, () => {
    expect(
      broken((d) => {
        for (let i = 0; i < MAX_FLOWS; i++) {
          d.flows.push({ id: `x${i}`, label: 'x', steps: ['one', 'two'] });
        }
      }),
    ).toThrow(/more than/);
  });
  it('rejects a node without a description', () => {
    expect(broken((d) => (d.nodes[0].description = []))).toThrow(/description/);
  });
});
