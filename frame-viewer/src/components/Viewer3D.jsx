import { useRef, useEffect, useState, useCallback } from 'react'
import * as THREE from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeRectShape, makeCircleShape, sectionDimsFromProp } from '../utils/crossSection.js'
import './Viewer3D.css'

const Z_AXIS = new THREE.Vector3(0, 0, 1)
const DEFAULT_SECTION_SIZE = 0.1

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

    // Rotate from +Z to the element direction
    let quaternion
    const dot = Z_AXIS.dot(direction)
    if (dot > 0.9999) {
      quaternion = new THREE.Quaternion()
    } else if (dot < -0.9999) {
      // Anti-parallel to Z: rotate 180° around X
      quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    } else {
      quaternion = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, direction)
    }

    geom.applyQuaternion(quaternion)
    geom.translate(start.x, start.y, start.z)
    geometries.push(geom)
  })

  if (geometries.length === 0) return null

  // Merge all geometries into a single draw call
  const merged = mergeBufferGeometries(geometries, false)
  geometries.forEach(g => g.dispose())
  return merged
}

export default function Viewer3D({ data, onBack }) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const linesMeshRef = useRef(null)
  const solidMeshRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const halfViewRef = useRef(1)
  const gridMapRef = useRef({})

  const [showSolid, setShowSolid] = useState(false)
  const [sectionType, setSectionType] = useState('rect')
  const [sectionSize, setSectionSize] = useState(DEFAULT_SECTION_SIZE)
  const [sectionSizeInput, setSectionSizeInput] = useState(String(DEFAULT_SECTION_SIZE))

  // Build solid geometry and swap meshes when solid params change
  const rebuildSolid = useCallback((scene, sType, sSize) => {
    if (solidMeshRef.current) {
      scene.remove(solidMeshRef.current)
      solidMeshRef.current.geometry.dispose()
      solidMeshRef.current = null
    }
    if (!data.elements || data.elements.length === 0) return

    const geom = buildSolidGeometry(data, gridMapRef.current, sType, sSize)
    if (!geom) return

    const mat = new THREE.MeshPhongMaterial({
      color: 0x4488cc,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geom, mat)
    solidMeshRef.current = mesh
    scene.add(mesh)
  }, [data])

  // Toggle visibility of lines vs solid
  useEffect(() => {
    if (!sceneRef.current) return
    if (linesMeshRef.current) linesMeshRef.current.visible = !showSolid
    if (solidMeshRef.current) solidMeshRef.current.visible = showSolid
    if (showSolid && !solidMeshRef.current) {
      rebuildSolid(sceneRef.current, sectionType, sectionSize)
      if (solidMeshRef.current) solidMeshRef.current.visible = true
    }
  }, [showSolid, rebuildSolid, sectionType, sectionSize])

  // Rebuild solid when section params change (only if in solid mode)
  useEffect(() => {
    if (!sceneRef.current || !showSolid) return
    rebuildSolid(sceneRef.current, sectionType, sectionSize)
    if (solidMeshRef.current) solidMeshRef.current.visible = true
  }, [sectionType, sectionSize, showSolid, rebuildSolid])

  // Three.js scene init
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1a)
    sceneRef.current = scene

    const width = container.clientWidth
    const height = container.clientHeight
    const aspect = width / height
    const camera = new THREE.OrthographicCamera(
      -1, 1, 1 / aspect, -1 / aspect, -100000, 100000
    )
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(1, 2, 3)
    scene.add(dirLight)

    scene.add(new THREE.GridHelper(500, 50, 0x444444, 0x222222))
    scene.add(new THREE.AxesHelper(50))

    const gridMap = {}
    if (data.grids) {
      data.grids.forEach(g => { gridMap[g.id] = g })
    }
    gridMapRef.current = gridMap

    // Grid point cloud
    if (data.grids && data.grids.length > 0) {
      const positions = new Float32Array(data.grids.length * 3)
      data.grids.forEach((g, i) => {
        positions[i * 3] = g.x
        positions[i * 3 + 1] = g.y
        positions[i * 3 + 2] = g.z
      })
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const mat = new THREE.PointsMaterial({ color: 0x00aaff, size: 4, sizeAttenuation: false })
      scene.add(new THREE.Points(geom, mat))
    }

    // Line elements
    if (data.elements && data.elements.length > 0) {
      const lineGeom = buildLineGeometry(data, gridMap)
      if (lineGeom) {
        const mat = new THREE.LineBasicMaterial({ color: 0xff6644 })
        const linesMesh = new THREE.LineSegments(lineGeom, mat)
        linesMeshRef.current = linesMesh
        scene.add(linesMesh)
      }
    }

    // Fit camera to model
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 1)
    const halfView = maxDim * 0.7
    halfViewRef.current = halfView
    const camDist = maxDim * 10
    const w = container.clientWidth
    const h = container.clientHeight
    const asp = w / h
    camera.left   = -halfView * asp
    camera.right  =  halfView * asp
    camera.top    =  halfView
    camera.bottom = -halfView
    camera.near   = -camDist
    camera.far    =  camDist
    camera.position.copy(center)
    camera.position.z += camDist / 2
    camera.lookAt(center)
    camera.updateProjectionMatrix()

    const sceneCenter = center.clone()

    const state = {
      isDragging: false,
      prevMouse: { x: 0, y: 0 },
      rotX: 0,
      rotY: 0,
      touchStartDist: 0,
    }

    function rotate(dx, dy) {
      state.rotY += dx * 0.01
      state.rotX += dy * 0.01
      state.rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.rotX))
      const q = new THREE.Quaternion()
      q.setFromEuler(new THREE.Euler(state.rotX, state.rotY, 0, 'YXZ'))
      const offset = camera.position.clone().sub(sceneCenter)
      const dist = offset.length()
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
      camera.position.copy(sceneCenter).addScaledVector(dir, dist)
      camera.lookAt(sceneCenter)
    }

    function zoom(factor) {
      camera.zoom = Math.max(0.01, camera.zoom * factor)
      camera.updateProjectionMatrix()
    }

    const onMouseDown = (e) => { state.isDragging = true; state.prevMouse = { x: e.clientX, y: e.clientY } }
    const onMouseMove = (e) => {
      if (!state.isDragging) return
      rotate(e.clientX - state.prevMouse.x, e.clientY - state.prevMouse.y)
      state.prevMouse = { x: e.clientX, y: e.clientY }
    }
    const onMouseUp = () => { state.isDragging = false }
    const onWheel = (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 0.9) }

    const onTouchStart = (e) => {
      e.preventDefault()
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        state.touchStartDist = Math.sqrt(dx * dx + dy * dy)
        state.isDragging = false
      } else if (e.touches.length === 1) {
        state.isDragging = true
        state.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }
    }
    const onTouchMove = (e) => {
      e.preventDefault()
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        zoom(dist > state.touchStartDist ? 0.95 : 1.05)
        state.touchStartDist = dist
      } else if (e.touches.length === 1 && state.isDragging) {
        rotate(e.touches[0].clientX - state.prevMouse.x, e.touches[0].clientY - state.prevMouse.y)
        state.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }
    }
    const onTouchEnd = () => { state.isDragging = false }

    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      const a = w / h
      const hv = halfViewRef.current
      camera.left   = -hv * a
      camera.right  =  hv * a
      camera.top    =  hv
      camera.bottom = -hv
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    renderer.domElement.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false })
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false })
    renderer.domElement.addEventListener('touchend', onTouchEnd)
    window.addEventListener('resize', onResize)

    let animId
    const animate = () => {
      animId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
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
        if (obj.material) obj.material.dispose()
      })
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      sceneRef.current = null
      linesMeshRef.current = null
      solidMeshRef.current = null
      rendererRef.current = null
      cameraRef.current = null
    }
  }, [data])

  function handleSectionSizeCommit(value) {
    const parsed = parseFloat(value)
    if (!isNaN(parsed) && parsed > 0) {
      setSectionSize(parsed)
    }
  }

  return (
    <div className="viewer3d">
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
