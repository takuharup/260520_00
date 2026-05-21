import { memo, useMemo } from 'react'
import TreeNode from './TreeNode.jsx'
import { dofLabel } from '../data/constraints.js'
import './Sidebar.css'

function fmtCoord(v) {
  return Number(v).toFixed(2)
}

const GridItem = memo(function GridItem({ g, isSelected, constrained, constraintDofs, onSelect, onToggle }) {
  return (
    <div
      className={`tree-leaf${isSelected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <span className="leaf-icon">📍</span>
      <span className="leaf-label">Grid {g.id}</span>
      <span className="leaf-detail">
        {fmtCoord(g.x)}, {fmtCoord(g.y)}, {fmtCoord(g.z)}
      </span>
      <button
        className={`constraint-toggle${constrained ? ' on' : ''}`}
        title={constrained ? `Remove (${dofLabel(constraintDofs)})` : 'Add fixed constraint'}
        onClick={onToggle}
      >
        🔒
      </button>
    </div>
  )
})

const ElemItem = memo(function ElemItem({ elem, isSelected, onSelect }) {
  return (
    <div
      className={`tree-leaf${isSelected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <span className="leaf-icon">━</span>
      <span className="leaf-label">Elem {elem.id}</span>
      <span className="leaf-detail">G{elem.start_grid}→G{elem.end_grid}</span>
    </div>
  )
})

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

  const constraintMap = useMemo(
    () => Object.fromEntries(constraints.map(c => [c.gridId, c])),
    [constraints]
  )

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
            return (
              <GridItem
                key={g.id}
                g={g}
                isSelected={selectedGridId === g.id}
                constrained={!!c}
                constraintDofs={c?.dofs ?? []}
                onSelect={() => onSelectGrid(g.id)}
                onToggle={e => { e.stopPropagation(); onToggleConstraint(g.id) }}
              />
            )
          })}
        </TreeNode>

        <TreeNode
          icon="📁"
          label="Elements"
          badge={data.elements?.length ?? 0}
          isExpandable
        >
          {data.elements?.map(elem => (
            <ElemItem
              key={elem.id}
              elem={elem}
              isSelected={selectedElemId === elem.id}
              onSelect={() => onSelectElem(elem.id)}
            />
          ))}
        </TreeNode>

      </div>
    </aside>
  )
}
