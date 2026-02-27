import * as THREE from 'three'
import type { SemanticEntity, SemanticRelation } from '@/semantic/model/SemanticGraph'
import type { BaseGizmo } from './BaseGizmo'
import { NodeGizmo } from './entities/NodeGizmo'
import { PointGizmo } from './entities/PointGizmo'
import { LineGizmo } from './entities/LineGizmo'
import { PlaneGizmo } from './entities/PlaneGizmo'
import { ModelGizmo } from './entities/ModelGizmo'
import { ArrowGizmo } from './entities/ArrowGizmo'
import { SymbolGizmo } from './entities/SymbolGizmo'
import { LabelGizmo } from './entities/LabelGizmo'
import { LinkGizmo } from './entities/LinkGizmo'
import { MarkerGizmo } from './entities/MarkerGizmo'
import { BadgeGizmo } from './entities/BadgeGizmo'
import { StepSequenceGizmo } from './process/StepSequenceGizmo'
import { StateOverlayGizmo } from './process/StateOverlayGizmo'
import { TraceTrailGizmo } from './process/TraceTrailGizmo'
import { ScalarFieldGizmo } from './fields/ScalarFieldGizmo'
import { VectorFieldGizmo } from './fields/VectorFieldGizmo'
import { SampleProbeGizmo } from './fields/SampleProbeGizmo'
import type { BaseRelationGizmo } from './relations/BaseRelationGizmo'
import { MeasureDistanceGizmo } from './relations/MeasureDistanceGizmo'
import { MeasureAngleGizmo } from './relations/MeasureAngleGizmo'
import { ProjectionHelperGizmo } from './relations/ProjectionHelperGizmo'
import { IntersectionMarkerGizmo } from './relations/IntersectionMarkerGizmo'

export class GizmoFactory {
  createForEntity(entity: SemanticEntity): BaseGizmo | null {
    let gizmo: BaseGizmo

    switch (entity.type) {
      case 'node':
        gizmo = new NodeGizmo(entity)
        break
      case 'point':
        gizmo = new PointGizmo(entity)
        break
      case 'line':
        gizmo = new LineGizmo(entity)
        break
      case 'plane':
        gizmo = new PlaneGizmo(entity)
        break
      case 'model':
        gizmo = new ModelGizmo(entity)
        break
      case 'arrow':
        gizmo = new ArrowGizmo(entity)
        break
      case 'symbol':
        gizmo = new SymbolGizmo(entity)
        break
      case 'label':
        gizmo = new LabelGizmo(entity)
        break
      case 'marker':
        gizmo = new MarkerGizmo(entity)
        break
      case 'badge':
        gizmo = new BadgeGizmo(entity)
        break
      case 'step_sequence':
        gizmo = new StepSequenceGizmo(entity)
        break
      case 'state_overlay':
        gizmo = new StateOverlayGizmo(entity)
        break
      case 'trace_trail':
        gizmo = new TraceTrailGizmo(entity)
        break
      case 'scalar_field':
      case 'surface_field':
        gizmo = new ScalarFieldGizmo(entity)
        break
      case 'vector_field':
        gizmo = new VectorFieldGizmo(entity)
        break
      case 'sample_probe':
        gizmo = new SampleProbeGizmo(entity)
        break
      default:
        return null
    }

    gizmo.build(entity)
    return gizmo
  }

  createForRelation(
    relation: SemanticRelation,
    sourcePos: THREE.Vector3,
    targetPos: THREE.Vector3
  ): BaseGizmo | BaseRelationGizmo | null {
    switch (relation.type) {
      case 'link': {
        const entity: SemanticEntity = {
          id: relation.id,
          type: 'node',
          props: {
            x0: sourcePos.x, y0: sourcePos.y, z0: sourcePos.z,
            x1: targetPos.x, y1: targetPos.y, z1: targetPos.z,
          },
        }
        const gizmo = new LinkGizmo(entity)
        gizmo.build(entity)
        return gizmo
      }
      case 'measure_distance': {
        const g = new MeasureDistanceGizmo(relation)
        g.build(relation, sourcePos, targetPos)
        return g
      }
      case 'measure_angle': {
        const g = new MeasureAngleGizmo(relation)
        g.build(relation, sourcePos, targetPos)
        return g
      }
      case 'projection': {
        const g = new ProjectionHelperGizmo(relation)
        g.build(relation, sourcePos, targetPos)
        return g
      }
      case 'intersection': {
        const g = new IntersectionMarkerGizmo(relation)
        g.build(relation, sourcePos, targetPos)
        return g
      }
      default:
        return null
    }
  }
}
