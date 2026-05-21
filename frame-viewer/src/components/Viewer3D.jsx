import { useRef, useEffect, useState, useCallback } from 'react'
import * as THREE from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeRectShape, makeCircleShape, sectionDimsFromProp } from '../utils/crossSection.js'
import { CONSTRAINT_COLORS } from '../data/constraints.js'
import './Viewer3D.css'

const Z_AXIS = new THREE.Vector3(0, 0, 1)
const DEFAULT_SECTION_SIZE = 0.1

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0]
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
      else child.material.dispose()
    }
    group.remove(child)
  }
}

function buildLineGeometry(data, gridMap) {
  const linePositions = []
  data.elements.forEach(elem => {
    const sg = gridMap[elem.start_grid]
    const eg = gridMap[elem.end_grid]
    if (sg && eg) {
      linePositions.push(sg.x, sg.y, sg.z, eg.x, eg.y, eg.z)
    }
  })
  if (linePositions.length === 0) return null
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePositions), 3))
  return geom
}

function buildSolidGeometry(data, gridMap, sectionType, sectionSize) {
  const propMap = {}
  if (data.properties) {
    data.properties.forEach(p => { propMap[p.id] = p })
  }

  const geometries = []

  data.elements.forEach(elem => {
    const sg = gridMap[elem.start_grid]
    const eg = gridMap[elem.end_grid]
    if (!sg || !eg) return

    const start = new THREE.Vector3(sg.x, sg.y, sg.z)
    const end = new THREE.Vector3(eg.x, eg.y, eg.z)
    const axis = new THREE.Vector3().subVectors(end, start)
    const length = axis.length()
    if (length < 1e-10) return

    const direction = axis.clone().normalize()
    const prop = propMap[elem.property_id] || null

    let shape
    if (sectionType === 'circle') {
      const { r } = sectionDimsFromProp(prop, 'circle', sectionSize)
      shape = makeCircleShape(r)
    } else {
      const { w, h } = sectionDimsFromProp(prop, 'rect', sectionSize)
      shape = makeRectShape(w, h)
    }

    const extrudeSettings = { steps: 1, depth: length, bevelEnabled: false }
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings)

    const dot = Z_AXIS.dot(direction)
    let quaternion
    if (dot > 0.9999) {
      quaternion = new THREE.Quaternion()
    } else if (dot < -0.9999) {
      quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    } else {
      quaternion = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, direction)
    }

    geom.applyQuaternion(quaternion)
    geom.translate(start.x, start.y, start.z)
    geometries.push(geom)
  })

  if (geometries.length === 0) return null

  const merged = mergeBufferGeometries(geometries, false)
  geometries.forEach(g => g.dispose())
  return merged
}

export default function Viewer3D({
  data,
  onBack,
  constraints = [],
  selectedGridId = null,
  selectedElemId = null,
  sidebarOpen = true,
  onToggleSidebar = null,
}) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const linesMeshRef = useRef(null)
  const solidMeshRef = useRef(null)
  const solidMatRef = useRef(null)
  const constraintGroupRef = useRef(null)
  const highlightGroupRef = useRef(null)
  const maxDimRef = useRef(1)
  const gridMapRef = useRef({})
  const elemMapRef = useRef({})

  const [showSolid, setShowSolid] = useState(false)
  const [sectionType, setSectionType] = useState('rect')
  const [sectionSize, setSectionSize] = useState(DEFAULT_SECTION_SIZE)
  const [sectionSizeInput, setSectionSizeInput] = useState(String(DEFAULT_SECTION_SIZE))

  const rebuildSolid = useCallback((scene, sType, sSize) => {
    if (solidMeshRef.current) {
      scene.remove(solidMeshRef.current)
      solidMeshRef.current.geometry.dispose()
      solidMeshRef.current = null
    }
    if (!data.elements || data.elements.length === 0) return

    const geom = buildSolidGeometry(data, gridMapRef.current, sType, sSize)
    if (!geom) return

    const mesh = new THREE.Mesh(geom, solidMatRef.current)
    solidMeshRef.current = mesh
    scene.add(mesh)
  }, [data])

  // Unified solid display effect (replaces two overlapping effects)
  useEffect(() => {
    if (!sceneRef.current) return
    if (linesMeshRef.current) linesMeshRef.current.visible = !showSolid
    if (!showSolid) {
      if (solidMeshRef.current) solidMeshRef.current.visible = false
      return
    }
    rebuildSolid(sceneRef.current, sectionType, sectionSize)
    if (solidMeshRef.current) solidMeshRef.current.visible = true
  }, [showSolid, sectionType, sectionSize, rebuildSolid])

  // Update constraint markers
  useEffect(() => {
    const group = constraintGroupRef.current
    if (!group) return
    clearGroup(group)

    const maxDim = maxDimRef.current
    const coneR = Math.max(maxDim * 0.025, 0.01)
    const coneH = Math.max(maxDim * 0.06, 0.02)

    constraints.forEach(c => {
      const g = gridMapRef.current[c.gridId]
      if (!g) return
      const color = CONSTRAINT_COLORS[c.type] ?? CONSTRAINT_COLORS.custom
      const coneGeom = new THREE.ConeGeometry(coneR, coneH, 6)
      const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.92 })
      const cone = new THREE.Mesh(coneGeom, mat)
      // Tip of cone (y = +coneH/2) placed at grid node → shift center down by coneH/2
      cone.position.set(g.x, g.y - coneH / 2, g.z)
      group.add(cone)

      // Base plate for fixed supports
      if (c.type === 'fixed') {
        const plateGeom = new THREE.BoxGeometry(coneR * 2.2, coneH * 0.12, coneR * 2.2)
        const plate = new THREE.Mesh(plateGeom, mat.clone())
        plate.position.set(g.x, g.y - coneH - coneH * 0.06, g.z)
        group.add(plate)
      }
    })
  }, [constraints])

  // Update selection highlight
  useEffect(() => {
    const group = highlightGroupRef.current
    if (!group) return
    clearGroup(group)

    const maxDim = maxDimRef.current
    const sphereR = Math.max(maxDim * 0.022, 0.008)
    const yellowMat = () => new THREE.MeshBasicMaterial({ color: 0xffee00 })

    if (selectedGridId != null) {
      const g = gridMapRef.current[selectedGridId]
      if (g) {
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(sphereR, 16, 16), yellowMat())
        sphere.position.set(g.x, g.y, g.z)
        group.add(sphere)
      }
    }

    if (selectedElemId != null) {
      const elem = elemMapRef.current[selectedElemId]
      if (elem) {
        const sg = gridMapRef.current[elem.start_grid]
        const eg = gridMapRef.current[elem.end_grid]
        if (sg && eg) {
          const positions = new Float32Array([sg.x, sg.y, sg.z, eg.x, eg.y, eg.z])
          const lineGeom = new THREE.BufferGeometry()
          lineGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          group.add(new THREE.LineSegments(lineGeom, new THREE.LineBasicMaterial({ color: 0xffee00 })))
          ;[sg, eg].forEach(pt => {
            const s = new THREE.Mesh(new THREE.SphereGeometry(sphereR * 0.8, 12, 12), yellowMat())
            s.position.set(pt.x, pt.y, pt.z)
            group.add(s)
          })
        }
      }
    }
  }, [selectedGridId, selectedElemId])

  // Scene init
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1a)
    sceneRef.current = scene

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100000, 100000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(1, 2, 3)
    scene.add(dirLight)
    scene.add(new THREE.GridHelper(500, 50, 0x444444, 0x222222))
    scene.add(new THREE.AxesHelper(50))

    // Groups for markers (populated by separate effects)
    const constraintGroup = new THREE.Group()
    constraintGroupRef.current = constraintGroup
    scene.add(constraintGroup)

    const highlightGroup = new THREE.Group()
    highlightGroupRef.current = highlightGroup
    scene.add(highlightGroup)

    solidMatRef.current = new THREE.MeshPhongMaterial({
      color: 0x4488cc, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    })

    const gridMap = {}
    if (data.grids) data.grids.forEach(g => { gridMap[g.id] = g })
    gridMapRef.current = gridMap

    const elemMap = {}
    if (data.elements) data.elements.forEach(e => { elemMap[e.id] = e })
    elemMapRef.current = elemMap

    // Grid points
    if (data.grids?.length > 0) {
      const positions = new Float32Array(data.grids.length * 3)
      data.grids.forEach((g, i) => {
        positions[i * 3] = g.x; positions[i * 3 + 1] = g.y; positions[i * 3 + 2] = g.z
      })
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      scene.add(new THREE.Points(geom, new THREE.PointsMaterial({ color: 0x00aaff, size: 4, sizeAttenuation: false })))
    }

    // Line elements
    if (data.elements?.length > 0) {
      const lineGeom = buildLineGeometry(data, gridMap)
      if (lineGeom) {
        const mesh = new THREE.LineSegments(lineGeom, new THREE.LineBasicMaterial({ color: 0xff6644 }))
        linesMeshRef.current = mesh
        scene.add(mesh)
      }
    }

    // Fit camera
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 1)
    maxDimRef.current = maxDim
    const halfView = maxDim * 0.7
    const camDist = maxDim * 10
    const asp = container.clientWidth / container.clientHeight
    camera.left = -halfView * asp; camera.right = halfView * asp
    camera.top = halfView; camera.bottom = -halfView
    camera.near = -camDist; camera.far = camDist
    camera.position.copy(center); camera.position.z += camDist / 2
    camera.lookAt(center)
    camera.updateProjectionMatrix()

    const sceneCenter = center.clone()
    const halfViewRef = { v: halfView }

    const state = {
      isDragging: false, isPanning: false,
      prevMouse: { x: 0, y: 0 }, prevMid: null,
      rotX: 0, rotY: 0, touchStartDist: 0,
    }

    function rotate(dx, dy) {
      state.rotY += dx * 0.01
      state.rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.rotX + dy * 0.01))
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(state.rotX, state.rotY, 0, 'YXZ'))
      const dist = camera.position.clone().sub(sceneCenter).length()
      camera.position.copy(sceneCenter).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(q), dist)
      camera.lookAt(sceneCenter)
    }

    function zoom(factor) {
      camera.zoom = Math.max(0.01, camera.zoom * factor)
      camera.updateProjectionMatrix()
    }

    function pan(dx, dy) {
      const w = container.clientWidth, h = container.clientHeight
      const worldW = (camera.right - camera.left) / camera.zoom
      const worldH = (camera.top - camera.bottom) / camera.zoom
      const delta = new THREE.Vector3(-dx / w * worldW, dy / h * worldH, 0)
        .applyQuaternion(camera.quaternion)
      camera.position.add(delta)
      sceneCenter.add(delta)
      camera.lookAt(sceneCenter)
    }

    const onContextMenu = e => e.preventDefault()
    const onMouseDown = e => {
      state.prevMouse = { x: e.clientX, y: e.clientY }
      if (e.button === 2) state.isPanning = true
      else if (e.button === 0) state.isDragging = true
    }
    const onMouseMove = e => {
      if (state.isDragging) {
        rotate(e.clientX - state.prevMouse.x, e.clientY - state.prevMouse.y)
        state.prevMouse = { x: e.clientX, y: e.clientY }
      } else if (state.isPanning) {
        pan(e.clientX - state.prevMouse.x, e.clientY - state.prevMouse.y)
        state.prevMouse = { x: e.clientX, y: e.clientY }
      }
    }
    const onMouseUp = () => { state.isDragging = false; state.isPanning = false }
    const onWheel = e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 0.9) }

    const onTouchStart = e => {
      e.preventDefault()
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        state.touchStartDist = Math.sqrt(dx * dx + dy * dy)
        state.isDragging = false
        state.prevMid = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        }
      } else if (e.touches.length === 1) {
        state.isDragging = true
        state.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        state.prevMid = null
      }
    }
    const onTouchMove = e => {
      e.preventDefault()
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        zoom(dist > state.touchStartDist ? 0.95 : 1.05)
        state.touchStartDist = dist
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        if (state.prevMid) pan(midX - state.prevMid.x, midY - state.prevMid.y)
        state.prevMid = { x: midX, y: midY }
      } else if (e.touches.length === 1 && state.isDragging) {
        rotate(e.touches[0].clientX - state.prevMouse.x, e.touches[0].clientY - state.prevMouse.y)
        state.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }
    }
    const onTouchEnd = () => { state.isDragging = false; state.prevMid = null }

    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight, a = w / h
      const hv = halfViewRef.v
      camera.left = -hv * a; camera.right = hv * a
      camera.top = hv; camera.bottom = -hv
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    renderer.domElement.addEventListener('contextmenu', onContextMenu)
    renderer.domElement.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false })
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false })
    renderer.domElement.addEventListener('touchend', onTouchEnd)
    window.addEventListener('resize', onResize)

    let animId
    const animate = () => { animId = requestAnimationFrame(animate); renderer.render(scene, camera) }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      renderer.domElement.removeEventListener('contextmenu', onContextMenu)
      renderer.domElement.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      renderer.domElement.removeEventListener('wheel', onWheel)
      renderer.domElement.removeEventListener('touchstart', onTouchStart)
      renderer.domElement.removeEventListener('touchmove', onTouchMove)
      renderer.domElement.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('resize', onResize)
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
          else obj.material.dispose()
        }
      })
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
      solidMatRef.current?.dispose()
      solidMatRef.current = null
      sceneRef.current = null
      linesMeshRef.current = null
      solidMeshRef.current = null
      constraintGroupRef.current = null
      highlightGroupRef.current = null
      elemMapRef.current = {}
    }
  }, [data])

  function handleSectionSizeCommit(value) {
    const parsed = parseFloat(value)
    if (!isNaN(parsed) && parsed > 0) setSectionSize(parsed)
  }

  return (
    <div className="viewer3d">
      {onToggleSidebar && (
        <button className="sidebar-toggle-btn" onClick={onToggleSidebar} title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
          {sidebarOpen ? '◀' : '▶'}
        </button>
      )}
      <div className="viewer-sidebar">
        <div className="stats-panel">
          <h3>Model Info</h3>
          <div className="stat"><span>Format</span><span>{data.format}</span></div>
          <div className="stat"><span>Grids</span><span>{data.grids?.length ?? 0}</span></div>
          <div className="stat"><span>Elements</span><span>{data.elements?.length ?? 0}</span></div>
          <div className="stat"><span>Properties</span><span>{data.properties?.length ?? 0}</span></div>
          <div className="stat"><span>Materials</span><span>{data.materials?.length ?? 0}</span></div>
        </div>

        <div className="solid-controls">
          <h3>Display</h3>
          <label className="toggle-row">
            <span>Solid beams</span>
            <input
              type="checkbox"
              checked={showSolid}
              onChange={e => setShowSolid(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>

          <div className={`solid-options${showSolid ? ' visible' : ''}`}>
            <label className="ctrl-label">Section type</label>
            <select
              value={sectionType}
              onChange={e => setSectionType(e.target.value)}
              disabled={!showSolid}
            >
              <option value="rect">Rectangle</option>
              <option value="circle">Circle</option>
            </select>

            <label className="ctrl-label">Size (m)</label>
            <input
              type="number"
              min="0.001"
              step="0.01"
              value={sectionSizeInput}
              disabled={!showSolid}
              onChange={e => setSectionSizeInput(e.target.value)}
              onBlur={e => handleSectionSizeCommit(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSectionSizeCommit(e.target.value) }}
            />
          </div>
        </div>

        <div className="legend">
          <div className="legend-item"><span className="dot dot-blue" />Grids (nodes)</div>
          <div className="legend-item">
            <span className={`dot ${showSolid ? 'dot-solid' : 'dot-orange'}`} />
            {showSolid ? 'Solid beams' : 'Elements (members)'}
          </div>
          <div className="legend-item"><span className="dot dot-red" />Fixed constraint</div>
          <div className="legend-item"><span className="dot dot-indigo" />Pinned constraint</div>
          <div className="legend-item"><span className="dot dot-yellow" />Selected</div>
        </div>

        <div className="controls-hint">
          <p>Drag to rotate</p>
          <p>Wheel to zoom</p>
          <p>1 finger: rotate</p>
          <p>2 fingers: pinch zoom</p>
        </div>
        <button className="btn-back" onClick={onBack}>← Back</button>
      </div>
      <div className="viewer-canvas" ref={containerRef} />
    </div>
  )
}
