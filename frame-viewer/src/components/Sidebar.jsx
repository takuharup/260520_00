import TreeNode from './TreeNode.jsx'
import { dofLabel } from '../data/constraints.js'
import './Sidebar.css'

function fmtCoord(v) {
  return Number(v).toFixed(2)
}

export default function Sidebar({
  data,
  constraints,
  selectedGridId,
  selectedElemId,
  onSelectGrid,
  onSelectElem,
  onToggleConstraint,
}) {
  if (!data) return null

  const constraintMap = Object.fromEntries(constraints.map(c => [c.gridId, c]))

  return (
    <aside className="model-sidebar">
      <div className="sidebar-title">Model Tree</div>
      <div className="sidebar-tree">

        <TreeNode
          icon="📁"
          label="Grids"
          badge={data.grids?.length ?? 0}
          isExpandable
          defaultExpanded
        >
          {data.grids?.map(g => {
            const c = constraintMap[g.id]
            const isSelected = selectedGridId === g.id
            return (
              <div
                key={g.id}
                className={`tree-leaf${isSelected ? ' selected' : ''}`}
                onClick={() => onSelectGrid(g.id)}
              >
                <span className="leaf-icon">📍</span>
                <span className="leaf-label">Grid {g.id}</span>
                <span className="leaf-detail">
                  {fmtCoord(g.x)}, {fmtCoord(g.y)}, {fmtCoord(g.z)}
                </span>
                <button
                  className={`constraint-toggle${c ? ' on' : ''}`}
                  title={c ? `Remove (${dofLabel(c.dofs)})` : 'Add fixed constraint'}
                  onClick={e => { e.stopPropagation(); onToggleConstraint(g.id) }}
                >
                  🔒
                </button>
              </div>
            )
          })}
        </TreeNode>

        <TreeNode
          icon="📁"
          label="Elements"
          badge={data.elements?.length ?? 0}
          isExpandable
        >
          {data.elements?.map(elem => {
            const isSelected = selectedElemId === elem.id
            return (
              <div
                key={elem.id}
                className={`tree-leaf${isSelected ? ' selected' : ''}`}
                onClick={() => onSelectElem(elem.id)}
              >
                <span className="leaf-icon">━</span>
                <span className="leaf-label">Elem {elem.id}</span>
                <span className="leaf-detail">
                  G{elem.start_grid}→G{elem.end_grid}
                </span>
              </div>
            )
          })}
        </TreeNode>

      </div>
    </aside>
  )
}
