import { useState, useCallback } from 'react'
import { makeConstraint } from '../data/constraints.js'

export function useConstraints() {
  const [constraints, setConstraints] = useState([])

  const toggleConstraint = useCallback((gridId, type = 'fixed') => {
    setConstraints(prev => {
      const exists = prev.find(c => c.gridId === gridId)
      if (exists) return prev.filter(c => c.gridId !== gridId)
      return [...prev, makeConstraint(gridId, type)]
    })
  }, [])

  return { constraints, toggleConstraint }
}
