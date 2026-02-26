import './style.css'
import { Shell } from '@/app/Shell'
import { SemanticGraph } from '@/semantic/model/SemanticGraph'
import { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import { StepTrack } from '@/timeline/runtime/StepTrack'
import { EventTrack } from '@/timeline/runtime/EventTrack'

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) throw new Error('Missing #app root element')

const shell = new Shell(appRoot)

// ── Graph ─────────────────────────────────────────────────────────────────
const graph = new SemanticGraph()
const nodes = ['A', 'B', 'C', 'D', 'E', 'F']
nodes.forEach((id, i) => graph.addEntity({ id, type: 'node', props: { label: id, value: i + 1 } }))

const edges: [string, string][] = [
  ['A', 'B'], ['A', 'C'],
  ['B', 'D'], ['B', 'E'],
  ['C', 'F'],
]
edges.forEach(([s, t], i) =>
  graph.addRelation({ id: `r${i}`, type: 'link', sourceId: s, targetId: t, props: {} })
)

shell.loadGraph(graph)

// ── BFS order: A B C D E F ────────────────────────────────────────────────
const bfsOrder = ['A', 'B', 'C', 'D', 'E', 'F']
const STEP_DUR = 1.2  // seconds per step

const runtime = new TimelineRuntime({
  duration: bfsOrder.length * STEP_DUR,
  loop: false,
  speed: 1,
})

// StepTrack — one keyframe per BFS step
const stepTrack = new StepTrack('steps')
bfsOrder.forEach((nodeId, i) => {
  stepTrack.addKeyframe({
    time: i * STEP_DUR,
    value: { index: i, label: nodeId, payload: { nodeId } },
  })
})
runtime.addTrack(stepTrack)

// EventTrack — fires "visit" event at each step
const eventTrack = new EventTrack('bfs-events')
bfsOrder.forEach((nodeId, i) => {
  eventTrack.addKeyframe({
    time: i * STEP_DUR,
    value: { name: 'visit', payload: { nodeId, step: i } },
  })
})
runtime.addTrack(eventTrack)

// Color visited nodes in 3D view
const VISITED_COLOR = 0x00e5ff   // cyan
const DEFAULT_COLOR = 0x4488ff   // original blue

runtime.on({
  type: 'event',
  handler: (evt) => {
    if (evt.name === 'visit') {
      const { nodeId, step } = evt.payload as { nodeId: string; step: number }
      console.log(`[BFS] step ${step + 1}: visit ${nodeId}`)
      shell.getView3D()?.setNodeColor(nodeId, VISITED_COLOR)
    }
  },
})

// Reset colors on loop / seek back to start
runtime.on({
  type: 'end',
  handler: () => {
    console.log('[BFS] traversal complete')
  },
})

shell.setTimeline(runtime)
