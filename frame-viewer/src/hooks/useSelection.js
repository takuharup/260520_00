import { useState, useCallback } from 'react'

export function useSelection() {
  const [selectedGridId, setSelectedGridId] = useState(null)
  const [selectedElemId, setSelectedElemId] = useState(null)

  const selectGrid = useCallback((id) => {
    setSelectedGridId(prev => prev === id ? null : id)
    setSelectedElemId(null)
  }, [])

  const selectElem = useCallback((id) => {
    setSelectedElemId(prev => prev === id ? null : id)
    setSelectedGridId(null)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedGridId(null)
    setSelectedElemId(null)
  }, [])

  return { selectedGridId, selectedElemId, selectGrid, selectElem, clearSelection }
}
