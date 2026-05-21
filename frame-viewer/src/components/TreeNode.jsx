import { useState } from 'react'

export default function TreeNode({ icon, label, badge, isExpandable, defaultExpanded = false, children }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="tree-node">
      <div
        className="tree-node-header"
        onClick={() => isExpandable && setExpanded(v => !v)}
        role={isExpandable ? 'button' : undefined}
      >
        <span className="tree-expand-icon">
          {isExpandable ? (expanded ? '▾' : '▸') : ''}
        </span>
        {icon && <span className="tree-node-icon">{icon}</span>}
        <span className="tree-node-label">{label}</span>
        {badge != null && <span className="tree-node-badge">{badge}</span>}
      </div>
      {isExpandable && expanded && (
        <div className="tree-node-children">{children}</div>
      )}
    </div>
  )
}
