import { useState } from 'react'
import FileUpload from './components/FileUpload.jsx'
import Viewer3D from './components/Viewer3D.jsx'
import Sidebar from './components/Sidebar.jsx'
import { useConstraints } from './hooks/useConstraints.js'
import { useSelection } from './hooks/useSelection.js'
import './App.css'

export default function App() {
  const [parsedData, setParsedData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const { constraints, toggleConstraint } = useConstraints()
  const { selectedGridId, selectedElemId, selectGrid, selectElem, clearSelection } = useSelection()

  function handleFileParsed(data) {
    setError(null)
    if (data.error) {
      setError(data.error)
      setIsLoading(false)
      return
    }
    setParsedData(data)
    setIsLoading(false)
  }

  function handleReset() {
    setParsedData(null)
    setError(null)
    setIsLoading(false)
    clearSelection()
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>3D Frame Viewer</h1>
        <p className="app-subtitle">NASTRAN BDF / STRUDL 3D Visualizer</p>
      </header>
      <main className="app-main">
        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p>Parsing file...</p>
          </div>
        )}
        {!parsedData ? (
          <FileUpload
            onFileParsed={handleFileParsed}
            onLoadingStart={() => setIsLoading(true)}
            onLoadingEnd={() => setIsLoading(false)}
            onError={setError}
          />
        ) : (
          <div className="viewer-layout">
            <div className={`sidebar-wrapper${sidebarOpen ? ' open' : ''}`}>
              <Sidebar
                data={parsedData}
                constraints={constraints}
                selectedGridId={selectedGridId}
                selectedElemId={selectedElemId}
                onSelectGrid={selectGrid}
                onSelectElem={selectElem}
                onToggleConstraint={toggleConstraint}
              />
            </div>
            <Viewer3D
              data={parsedData}
              onBack={handleReset}
              constraints={constraints}
              selectedGridId={selectedGridId}
              selectedElemId={selectedElemId}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen(v => !v)}
            />
          </div>
        )}
        {error && !parsedData && (
          <div className="error-panel">
            <strong>Error:</strong> {error}
          </div>
        )}
      </main>
    </div>
  )
}
