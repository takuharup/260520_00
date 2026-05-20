import * as THREE from 'three'

/**
 * Returns a THREE.Shape for a rectangle centered at the origin.
 * @param {number} w - width
 * @param {number} h - height
 */
export function makeRectShape(w, h) {
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2, -h / 2)
  shape.lineTo( w / 2, -h / 2)
  shape.lineTo( w / 2,  h / 2)
  shape.lineTo(-w / 2,  h / 2)
  shape.closePath()
  return shape
}

/**
 * Returns a THREE.Shape for a circle centered at the origin.
 * @param {number} r - radius
 */
export function makeCircleShape(r) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, r, 0, Math.PI * 2, false)
  return shape
}

/**
 * Derives section size from PBAR/PBEAM area property.
 * Falls back to defaultSize when area is missing or zero.
 * @param {object|null} prop - parsed property object { ax, ... }
 * @param {string} sectionType - 'rect' or 'circle'
 * @param {number} defaultSize - fallback size in model units
 * @returns {{ w: number, h: number, r: number }}
 */
export function sectionDimsFromProp(prop, sectionType, defaultSize) {
  const ax = prop && prop.ax > 0 ? prop.ax : null
  if (sectionType === 'circle') {
    const r = ax ? Math.sqrt(ax / Math.PI) : defaultSize / 2
    return { r }
  }
  // rect: approximate as square
  const side = ax ? Math.sqrt(ax) : defaultSize
  return { w: side, h: side }
}
