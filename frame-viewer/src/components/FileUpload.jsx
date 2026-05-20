import { useState, useRef } from 'react'
import { FrameParser } from '../frameParser.js'
import './FileUpload.css'

export default function FileUpload({ onFileParsed, onLoadingStart, onLoadingEnd, onError }) {
  const [fileName, setFileName] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [fileFormat, setFileFormat] = useState('auto')
  const fileInputRef = useRef()

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (ev) => setFileContent(ev.target.result)
    reader.onerror = () => onError('File read failed.')
    reader.readAsText(file)
  }

  function handleParse() {
    if (!fileContent) { onError('Please select a file first.'); return; }
    onLoadingStart()
    setTimeout(() => {
      try {
        const parser = new FrameParser(fileContent, fileFormat)
        const data = parser.parse()
        onFileParsed(data)
      } catch (e) {
        onError('Parse failed: ' + e.message)
        onLoadingEnd()
      }
    }, 50)
  }

  return (
    <div className="file-upload">
      <div className="upload-card">
        <div className="upload-icon">📁</div>
        <h2>Upload Structural Model</h2>
        <p className="upload-desc">NASTRAN BDF (.bdf, .dat) or STRUDL (.txt, .str)</p>

        <div className="upload-controls">
          <input
            ref={fileInputRef}
            type="file"
            accept=".bdf,.dat,.txt,.str,.inp"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>
            Choose File
          </button>
          {fileName && <span className="file-name">{fileName}</span>}
        </div>

        <div className="format-select">
          <label>Format:</label>
          <select value={fileFormat} onChange={e => setFileFormat(e.target.value)}>
            <option value="auto">Auto Detect</option>
            <option value="NASTRAN_BDF">NASTRAN BDF</option>
            <option value="STRUDL">STRUDL</option>
          </select>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleParse}
          disabled={!fileContent}
          name="parse"
        >
          ▶ Parse &amp; View 3D
        </button>

        <div className="info-box">
          <h3>Supported Formats</h3>
          <ul>
            <li><strong>NASTRAN BDF</strong> — GRID, CBAR, CBEAM, PBAR, MAT1</li>
            <li><strong>STRUDL</strong> — JOINT COORDINATES, MEMBER INCIDENCES</li>
          </ul>
          <p className="info-note">All processing is done in your browser. No data is uploaded to any server.</p>
        </div>
      </div>
    </div>
  )
}
