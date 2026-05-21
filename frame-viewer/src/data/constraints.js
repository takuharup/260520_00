export const CONSTRAINT_COLORS = {
  fixed: 0xee3333,
  pinned: 0x3366ee,
  custom: 0x888888,
}

const CONSTRAINT_DEFAULT_DOFS = {
  fixed: [1, 2, 3, 4, 5, 6],
  pinned: [1, 2, 3],
  custom: [],
}

export function makeConstraint(gridId, type = 'fixed') {
  return {
    id: `spc_${gridId}`,
    gridId,
    dofs: CONSTRAINT_DEFAULT_DOFS[type] ?? [],
    type,
  }
}

export function dofLabel(dofs) {
  const names = ['T1', 'T2', 'T3', 'R1', 'R2', 'R3']
  return dofs.map(d => names[d - 1] ?? `D${d}`).join(', ')
}
