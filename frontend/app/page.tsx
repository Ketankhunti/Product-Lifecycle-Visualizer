'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { motion, AnimatePresence } from 'framer-motion'
import * as THREE from 'three'

// 3D Rope Component
function Rope({ start, end }: { start: THREE.Vector3, end: THREE.Vector3 }) {
  const ropeRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial>(null)
  
  useFrame((state) => {
    if (ropeRef.current && materialRef.current) {
      // Animate rope with subtle wave motion
      const time = state.clock.elapsedTime
      ropeRef.current.rotation.z = Math.sin(time * 0.5) * 0.05
      
      // Color animation
      const hue = (Math.sin(time * 0.3) + 1) * 0.5
      materialRef.current.color.setHSL(0.1 + hue * 0.1, 0.8, 0.5)
    }
  })
  
  // Calculate rope geometry
  const distance = start.distanceTo(end)
  const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  
  // Create rope curve with natural sag
  const curve = new THREE.CatmullRomCurve3([
    start.clone(),
    new THREE.Vector3(
      center.x,
      center.y - distance * 0.15, // Natural sag
      center.z
    ),
    end.clone()
  ])
  
  const points = curve.getPoints(50)
  const geometry = new THREE.TubeGeometry(curve, 50, 0.05, 12, false)
  
  return (
    <group>
      {/* Main rope */}
      <mesh ref={ropeRef} geometry={geometry}>
        <meshStandardMaterial 
          ref={materialRef}
          color="#8B4513" 
          roughness={0.8}
          metalness={0.1}
          emissive="#2D1810"
          emissiveIntensity={0.2}
        />
      </mesh>
      
      {/* Glowing core */}
      <mesh geometry={geometry}>
        <meshBasicMaterial 
          color="#FFD700"
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  )
}

// 3D Display Card Component (No dragging)
function DisplayCard3D({ 
  stage, 
  index, 
  position
}: { 
  stage: LifecycleStage
  index: number
  position: [number, number, number]
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  // Floating animation
  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.elapsedTime
      meshRef.current.position.y = position[1] + Math.sin(time * 0.5 + index) * 0.1
      meshRef.current.rotation.y = Math.sin(time * 0.3 + index) * 0.02
    }
  })

  return (
    <group position={position}>
      {/* Display mesh - completely invisible */}
      <mesh ref={meshRef}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial 
          color="#ffffff"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

// HTML Card Overlay Component
function HTMLCardOverlay({ 
  stage, 
  index, 
  position3D, 
  camera,
  onSelect
}: { 
  stage: LifecycleStage
  index: number
  position3D: [number, number, number]
  camera: THREE.Camera
  onSelect: (stage: LifecycleStage, index: number) => void
}) {
  const [screenPosition, setScreenPosition] = useState({ x: 0, y: 0 })
  
  useEffect(() => {
    const updateScreenPosition = () => {
      // Safety check for position3D
      if (!position3D || position3D.length !== 3) {
        return
      }
      
      // Convert 3D position to screen coordinates
      const vector = new THREE.Vector3(...position3D)
      vector.project(camera)
      
  let x = (vector.x * 0.5 + 0.5) * window.innerWidth
  let y = (-vector.y * 0.5 + 0.5) * window.innerHeight

  // Card dimensions (keep in sync with render styles below)
  const cardW = 250
  const cardH = 300
  const margin = 12

  // Clamp so card never leaves viewport
  x = Math.min(window.innerWidth - margin - cardW / 2, Math.max(margin + cardW / 2, x))
  y = Math.min(window.innerHeight - margin - cardH / 2, Math.max(margin + cardH / 2, y))
      
  // Basic overlap avoidance: nudge this card if it intersects earlier siblings
  // (Reads DOM positions of already laid out cards with lower index.)
  const existing = document.querySelectorAll('.lifecycle-card-overlay')
  const desiredLeft = x - cardW / 2
  const desiredTop = y - cardH / 2
  let finalLeft = desiredLeft
  let finalTop = desiredTop
  const padding = 12
  existing.forEach((el) => {
    const idxAttr = el.getAttribute('data-card-index')
    if (!idxAttr) return
    const otherIndex = parseInt(idxAttr, 10)
    if (otherIndex >= index) return // only compare with earlier cards
    const rect = el.getBoundingClientRect()
    const overlapX = Math.max(0, Math.min(finalLeft + cardW, rect.left + rect.width) - Math.max(finalLeft, rect.left))
    const overlapY = Math.max(0, Math.min(finalTop + cardH, rect.top + rect.height) - Math.max(finalTop, rect.top))
    if (overlapX > 0 && overlapY > 0) {
      // Decide shift direction: prefer vertical shift first (if space) else horizontal
      const spaceBelow = window.innerHeight - (rect.bottom + padding + cardH)
      const spaceAbove = rect.top - padding - cardH
      if (spaceBelow > spaceAbove && spaceBelow > 0) {
        finalTop = rect.bottom + padding
      } else if (spaceAbove > 0) {
        finalTop = rect.top - padding - cardH
      } else {
        // fallback horizontal shift
        const spaceRight = window.innerWidth - (rect.right + padding + cardW)
        const spaceLeft = rect.left - padding - cardW
        if (spaceRight > spaceLeft && spaceRight > 0) {
          finalLeft = rect.right + padding
        } else if (spaceLeft > 0) {
          finalLeft = rect.left - padding - cardW
        }
      }
    }
  })

  // Re-clamp after adjustment
  finalLeft = Math.min(window.innerWidth - margin - cardW, Math.max(margin, finalLeft))
  finalTop = Math.min(window.innerHeight - margin - cardH, Math.max(margin, finalTop))

  setScreenPosition({ x: finalLeft + cardW / 2, y: finalTop + cardH / 2 })
    }
    
    updateScreenPosition()
    
    // Update on window resize
    window.addEventListener('resize', updateScreenPosition)
    
    // Also update on animation frames for smooth dragging
    let animationFrame: number
    const animate = () => {
      updateScreenPosition()
      animationFrame = requestAnimationFrame(animate)
    }
    animate()
    
    return () => {
      window.removeEventListener('resize', updateScreenPosition)
      cancelAnimationFrame(animationFrame)
    }
  }, [position3D, camera])
  
  // Detect image type and create appropriate data URL
  const getImageUrl = (base64: string): string => {
    if (base64.startsWith('PHN2Zyg')) {
      return `data:image/svg+xml;base64,${base64}`
    } else if (base64.startsWith('iVBORw0KGgo')) {
      return `data:image/png;base64,${base64}`
    } else if (base64.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${base64}`
    } else {
      return `data:image/png;base64,${base64}`
    }
  }
  
  const imageUrl = stage.image_base64 ? getImageUrl(stage.image_base64) : undefined
  
  return (
    <motion.div
      className="fixed pointer-events-auto z-20 cursor-pointer group lifecycle-card-overlay"
      data-card-index={index}
      style={{
        left: screenPosition.x - 125, // Half of card width (250px / 2)
        top: screenPosition.y - 150,  // Half of card height (300px / 2)
        width: '250px',  // Smaller width to prevent overlap
        height: '300px', // Smaller height to fit better
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        x: 0,
        y: 0
      }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
  onClick={() => onSelect(stage, index)}
      role="button"
      tabIndex={0}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(stage, index) } }}
    >
      <div className="w-full h-full glass-panel rounded-xl p-4 shadow-xl transition-all duration-200 overflow-hidden glow-border group-hover:scale-105 flex flex-col">
        {/* Stage number and title */}
        <div className="flex items-center space-x-2 mb-3 flex-shrink-0">
          <div className="w-6 h-6 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
            {index + 1}
          </div>
          <h3 className="text-base font-semibold gradient-text truncate">{stage.stage_name}</h3>
        </div>
        
        {/* Image */}
        <div className="mb-3 rounded-lg overflow-hidden bg-gray-800/50 flex items-center justify-center h-32 flex-shrink-0">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={stage.stage_name}
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <div className="text-center text-white/60">
              <div className="animate-pulse mb-2 text-xl">🖼️</div>
              <p className="text-sm">Generating...</p>
            </div>
          )}
        </div>
        
        {/* Description - truncated (no explicit read more hint; card itself is clickable) */}
        <div className="flex-1 overflow-hidden">
          <p className="text-white/80 text-sm leading-relaxed line-clamp-4 overflow-hidden break-words pr-1">
            {stage.description}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

// 3D Card Scene Component (Display only - no dragging)
function LifecycleCards3D({ lifecycle, cardPositions }: { 
  lifecycle: LifecycleData
  cardPositions: [number, number, number][]
}) {
  
  
  return (
    <group>
      {/* Enhanced lighting setup */}
      <ambientLight intensity={0.6} />
      
      {/* Main directional light */}
      <directionalLight 
        position={[10, 10, 5]} 
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      
      {/* Colorful point lights for atmosphere */}
      <pointLight position={[-6, 4, 3]} intensity={0.8} color="#00ffff" />
      <pointLight position={[6, 4, 3]} intensity={0.8} color="#ff00ff" />
      <pointLight position={[0, -4, 2]} intensity={0.6} color="#ffff00" />
      
      {/* Render 3D card placeholders */}
      {lifecycle.stages.map((stage, index) => (
        <DisplayCard3D
          key={`3d-${stage.stage_name}-${index}`}
          stage={stage}
          index={index}
          position={cardPositions[index]}
        />
      ))}
      
      {/* Render dynamic ropes between cards */}
      {cardPositions.slice(0, -1).map((pos, index) => (
        <Rope
          key={`rope-${index}-${pos.join(',')}-${cardPositions[index + 1].join(',')}`}
          start={new THREE.Vector3(...pos)}
          end={new THREE.Vector3(...cardPositions[index + 1])}
        />
      ))}
      
      {/* Background effects */}
      <ParticleSystem />
      <FloatingElements />
    </group>
  )
}

function FloatingElements() {
  const groupRef = useRef<THREE.Group>(null)
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.1
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1
    }
  })

  return (
    <group ref={groupRef}>
      <mesh position={[-3, 2, -2]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#00ff88" transparent opacity={0.8} />
      </mesh>
      
      <mesh position={[3, -1, -1]}>
        <sphereGeometry args={[0.3]} />
        <meshStandardMaterial color="#ff6b6b" transparent opacity={0.7} />
      </mesh>
      
      <mesh position={[0, 3, -3]}>
        <cylinderGeometry args={[0.2, 0.2, 1]} />
        <meshStandardMaterial color="#4ecdc4" transparent opacity={0.9} />
      </mesh>
      
      <mesh position={[2, 0, 1]}>
        <torusGeometry args={[0.5, 0.2, 8, 16]} />
        <meshStandardMaterial color="#9b59b6" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

// Particle System Component
function ParticleSystem() {
  const pointsRef = useRef<THREE.Points>(null)
  const particleCount = 500
  
  const positions = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)
  
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 20
    positions[i * 3 + 1] = (Math.random() - 0.5) * 20
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20
    
    colors[i * 3] = Math.random()
    colors[i * 3 + 1] = Math.random() * 0.5 + 0.5
    colors[i * 3 + 2] = 1
  }
  
  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.05
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={particleCount}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={colors}
          count={particleCount}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.05} vertexColors transparent opacity={0.6} />
    </points>
  )
}

// Enhanced modal with navigation, zoom, share & download
function StageModal({
  stages,
  index,
  onClose,
  onNavigate
}: {
  stages: LifecycleStage[]
  index: number
  onClose: () => void
  onNavigate: (newIndex: number) => void
}) {
  const stage = stages[index]
  const [zoomed, setZoomed] = useState(false)
  const [copied, setCopied] = useState(false)

  // Defensive: if index out of range close modal
  useEffect(() => {
    if (index < 0 || index >= stages.length) onClose()
  }, [index, stages.length, onClose])

  // Image URL helper
  const getImageUrl = (base64: string): string => {
    if (!base64) return ''
    if (base64.startsWith('PHN2Zyg')) return `data:image/svg+xml;base64,${base64}`
    if (base64.startsWith('iVBORw0KGgo')) return `data:image/png;base64,${base64}`
    if (base64.startsWith('/9j/')) return `data:image/jpeg;base64,${base64}`
    return `data:image/png;base64,${base64}`
  }
  const imageUrl = stage?.image_base64 ? getImageUrl(stage.image_base64) : undefined

  // Keyboard handlers (Esc close, arrows navigate, Enter toggle zoom)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomed) setZoomed(false)
        else onClose()
      } else if (e.key === 'ArrowRight') {
        if (index < stages.length - 1) onNavigate(index + 1)
      } else if (e.key === 'ArrowLeft') {
        if (index > 0) onNavigate(index - 1)
      } else if (e.key === 'Enter' && imageUrl) {
        setZoomed(z => !z)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index, stages.length, onNavigate, onClose, zoomed, imageUrl])

  const downloadImage = () => {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `${stage.stage_name.replace(/[^a-z0-9]+/gi,'_').toLowerCase()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const shareStage = async () => {
    const shareData = {
      title: stage.stage_name,
      text: stage.description.slice(0, 200) + (stage.description.length > 200 ? '...' : ''),
    }
    try {
      if ((navigator as any).share) {
        await (navigator as any).share(shareData)
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${stage.stage_name}\n\n${stage.description}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        alert('Share not supported on this browser.')
      }
    } catch (e) {
      console.error('Share failed', e)
    }
  }

  const prevDisabled = index === 0
  const nextDisabled = index === stages.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-6xl max-h-[90vh] rounded-2xl glass-panel border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`Stage details: ${stage.stage_name}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-bold text-sm shrink-0">
              {index + 1}
            </div>
            <h2 className="text-2xl font-semibold gradient-text truncate" title={stage.stage_name}>{stage.stage_name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={shareStage}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
              aria-label="Share"
            >{copied ? 'Copied!' : 'Share'}</button>
            {imageUrl && (
              <button
                onClick={downloadImage}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
                aria-label="Download image"
              >Download</button>
            )}
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xl font-bold flex items-center justify-center"
              aria-label="Close"
            >×</button>
          </div>
        </div>

        {/* Body layout */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Image area */}
            <div className="relative lg:w-1/2 p-4 flex items-center justify-center border-b lg:border-b-0 lg:border-r border-white/10 bg-black/20">
              {imageUrl ? (
                <button
                  onClick={() => setZoomed(true)}
                  className="group relative w-full h-full rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  aria-label="Expand image"
                >
                  <img
                    src={imageUrl}
                    alt={stage.stage_name}
                    className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium">
                    Click to Zoom
                  </div>
                </button>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">
                  Image generating...
                </div>
              )}
            </div>
          {/* Description */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <h3 className="text-lg font-semibold mb-3 text-white/90">Description</h3>
            <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
              {stage.description}
            </p>
          </div>
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-white/10 bg-white/5">
          <div className="flex gap-2">
            <button
              onClick={() => !prevDisabled && onNavigate(index - 1)}
              disabled={prevDisabled}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${prevDisabled ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20 text-white'}`}
              aria-label="Previous stage"
            >← Prev</button>
            <button
              onClick={() => !nextDisabled && onNavigate(index + 1)}
              disabled={nextDisabled}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${nextDisabled ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20 text-white'}`}
              aria-label="Next stage"
            >Next →</button>
          </div>
          {imageUrl && (
            <div className="text-xs text-white/40">
              Press Enter to toggle zoom • Arrow keys to navigate
            </div>
          )}
        </div>
      </motion.div>

      {/* Zoom / Lightbox overlay */}
      {zoomed && imageUrl && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setZoomed(false)}
          aria-label="Zoomed image view"
        >
          <img
            src={imageUrl}
            alt={stage.stage_name}
            className="max-w-[95vw] max-h-[95vh] object-contain shadow-2xl"
          />
          <button
            onClick={() => setZoomed(false)}
            className="absolute top-4 right-4 w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white text-2xl font-bold"
            aria-label="Close zoom"
          >×</button>
        </div>
      )}
    </div>
  )
}

// 3D Background Scene Component
function Scene3D() {
  return (
    <Canvas className="absolute inset-0 z-0" camera={{ position: [0, 0, 5], fov: 75 }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      <directionalLight position={[0, 5, 5]} intensity={0.3} />
      
      <ParticleSystem />
      <FloatingElements />
    </Canvas>
  )
}

// Product Input Form Component
function ProductForm({ onSubmit }: { onSubmit: (product: string) => void }) {
  const [product, setProduct] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product.trim()) return
    
    setIsLoading(true)
    await onSubmit(product)
    setIsLoading(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="glass-panel p-8 rounded-2xl backdrop-blur-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="product" className="block text-lg font-medium text-white/90 mb-2">
            Describe your product
          </label>
          <textarea
            id="product"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="e.g., A sustainable bamboo toothbrush that decomposes naturally..."
            className="w-full p-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent resize-none"
            rows={4}
            disabled={isLoading}
          />
        </div>
        
        <button
          type="submit"
          disabled={!product.trim() || isLoading}
          className="relative w-full py-5 px-8 rounded-2xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.04] focus:outline-none focus:ring-4 focus:ring-cyan-400/40 \
            bg-[radial-gradient(circle_at_30%_20%,#06b6d4_0%,#2563eb_45%,#0f172a_100%)] shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_10px_25px_-5px_rgba(14,165,233,0.5),0_8px_16px_-6px_rgba(37,99,235,0.6)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_12px_28px_-4px_rgba(14,165,233,0.65),0_10px_20px_-5px_rgba(37,99,235,0.7)]"
        >
          {isLoading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Generating Lifecycle...</span>
            </div>
          ) : (
            <span className="flex items-center justify-center gap-3 text-lg tracking-wide">
              <span className="inline-flex h-3 w-3 rounded-full bg-cyan-300 animate-pulse shadow-[0_0_8px_2px_rgba(34,211,238,0.8)]"></span>
              Generate Lifecycle Visualization
              <span className="text-cyan-200 text-sm font-normal opacity-80">AI Powered</span>
            </span>
          )}
        </button>
      </form>
    </motion.div>
  )
}

// Lifecycle Stage Card Component
interface LifecycleStage {
  stage_name: string
  prompt: string
  description: string
  image_base64?: string
  last_updated: string
}

interface LifecycleData {
  id: string
  product_description: string
  stages: LifecycleStage[]
  created_at: string
  updated_at: string
  constraints: string[]
}

function StageCard({ stage, index }: { stage: LifecycleStage; index: number }) {
  // Detect image type and create appropriate data URL
  const getImageUrl = (base64: string): string => {
    if (base64.startsWith('PHN2Zyg')) {
      return `data:image/svg+xml;base64,${base64}`
    } else if (base64.startsWith('iVBORw0KGgo')) {
      return `data:image/png;base64,${base64}`
    } else if (base64.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${base64}`
    } else {
      // Default to PNG for unknown types
      return `data:image/png;base64,${base64}`
    }
  }
  
  const imageUrl = stage.image_base64 ? getImageUrl(stage.image_base64) : undefined
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="stage-card p-6 rounded-xl glass-panel glow-border hover:scale-105 transition-all duration-300"
    >
      <div className="flex items-center space-x-4 mb-4">
        <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
          {index + 1}
        </div>
        <h3 className="text-xl font-semibold gradient-text">{stage.stage_name}</h3>
      </div>
      
      <div className="mb-4 rounded-lg overflow-hidden bg-gray-800/50 flex items-center justify-center h-48">
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt={stage.stage_name}
            className="w-full h-full object-cover rounded-lg"
          />
        ) : (
          <div className="text-center text-white/60">
            <div className="animate-pulse mb-2">🖼️</div>
            <p className="text-sm">Image generation in progress...</p>
            <p className="text-xs text-white/40">Gemini API processing</p>
          </div>
        )}
      </div>
      
      <p className="text-white/80 leading-relaxed">{stage.description}</p>
      
    </motion.div>
  )
}

// Main Hero Section Component
function HeroSection({ onGenerateLifecycle }: { onGenerateLifecycle: (product: string) => void }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <Scene3D />
      
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8"
        >
          <h1 className="text-6xl md:text-8xl font-bold gradient-text mb-6 shimmer">
            Product Lifecycle
          </h1>
          <h2 className="text-4xl md:text-6xl font-bold text-white/90 mb-8">
            Visualizer
          </h2>
          <p className="text-xl md:text-2xl text-white/70 mb-12 leading-relaxed">
            Transform product descriptions into stunning sustainability storyboards<br/>
            with AI-powered image generation
          </p>
        </motion.div>
        
        <ProductForm onSubmit={onGenerateLifecycle} />
      </div>
    </div>
  )
}

// Lifecycle Visualization Component
function LifecycleVisualization({ lifecycle }: { lifecycle: LifecycleData }) {
  const [camera, setCamera] = useState<THREE.Camera | null>(null)
  const [cardPositions, setCardPositions] = useState<[number, number, number][]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // Calculate dynamic positions based on viewport
  useEffect(() => {
    const calculatePositions = () => {
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      }
      
  // Horizontal span: expand with screen width (previously capped, causing unused side space on large displays)
  // Base span factor ~2.2 at 1400px; allow graceful growth up to a max to keep rope curvature reasonable.
  const widthFactor = viewport.width / 1400
  const horizontalScale = Math.min(2.2 * widthFactor, 3.2) // permits wider spread on large screens
      // Vertical distribution: keep within [-1.3, 1.3] world units and lift center so bottom text not cut.
      const topY = 1.1
      const midUpY = 0.2
      const midLowY = -0.6
      const bottomY = -1.0
      // If height is short, compress vertical spread
      const heightFactor = Math.min(viewport.height / 900, 1)
      const scaleY = 0.9 + heightFactor * 0.4
      // Slight center bias adjustment so middle card visually balances rope curve when spread widens
      const centerOffset = horizontalScale * 0.05
      const positions: [number, number, number][] = [
        [(-2 * horizontalScale) - centerOffset, topY * scaleY, 0],      // 1
        [(-1 * horizontalScale) - centerOffset, midLowY * scaleY, 0],   // 2
        [0 - centerOffset, bottomY * scaleY + 0.25, 0],                 // 3
        [(1 * horizontalScale) - centerOffset, midLowY * scaleY, 0],    // 4
        [(2 * horizontalScale) - centerOffset, topY * scaleY, 0],       // 5
      ]
      
      setCardPositions(positions)
    }

    calculatePositions()
    window.addEventListener('resize', calculatePositions)
    
    return () => window.removeEventListener('resize', calculatePositions)
  }, [])

  return (
    <div className="relative min-h-screen">
      {/* 3D Canvas for display cards */}
      <Canvas 
        camera={{ position: [0, 0, 8], fov: 60 }}
        style={{ height: '100vh', width: '100vw' }}
        onCreated={({ camera }) => setCamera(camera)}
      >
        {cardPositions.length > 0 && (
          <LifecycleCards3D 
            lifecycle={lifecycle}
            cardPositions={cardPositions}
          />
        )}
      </Canvas>

      {/* HTML Card Overlays */}
      {camera && lifecycle.stages.map((stage, index) => (
        <HTMLCardOverlay
          key={`html-${stage.stage_name}-${index}`}
          stage={stage}
          index={index}
          position3D={cardPositions[index]}
          camera={camera}
          onSelect={(s, i) => setSelectedIndex(i)}
        />
      ))}

      {/* Modal for selected stage */}
      {selectedIndex !== null && (
        <StageModal 
          stages={lifecycle.stages} 
          index={selectedIndex} 
          onClose={() => setSelectedIndex(null)}
          onNavigate={(i) => setSelectedIndex(i)}
        />
      )}
      
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 right-0 z-30 p-8 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 pointer-events-auto"
        >
          <h1 className="relative inline-block text-4xl md:text-6xl font-extrabold mb-5 tracking-tight leading-tight select-text">
            <span className="bg-clip-text text-transparent bg-[linear-gradient(90deg,#38bdf8_0%,#3b82f6_35%,#6366f1_70%,#a855f7_100%)] drop-shadow-[0_4px_12px_rgba(59,130,246,0.35)]">
              {lifecycle.product_description}
            </span>
            <span className="pointer-events-none absolute -inset-1 rounded-xl blur-lg opacity-30 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.45),transparent_60%)]"></span>
          </h1>
          <p className="relative mx-auto max-w-xl mb-8 text-base md:text-lg font-medium tracking-wide text-transparent bg-clip-text bg-[linear-gradient(90deg,rgba(255,255,255,0.85),rgba(203,213,225,0.85))] \
            after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:-bottom-3 after:h-px after:w-40 after:bg-gradient-to-r after:from-cyan-400/0 after:via-cyan-300/70 after:to-cyan-400/0">
            Sustainability Lifecycle Visualization
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.location.reload()}
              className="relative px-8 py-4 rounded-2xl font-semibold text-white tracking-wide overflow-hidden group transition-all duration-300 \
                bg-[radial-gradient(circle_at_20%_20%,#0ea5e9_0%,#1d4ed8_55%,#0f172a_100%)] shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_25px_-5px_rgba(14,165,233,0.45),0_6px_18px_-6px_rgba(29,78,216,0.55)] \
                hover:shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_10px_28px_-4px_rgba(14,165,233,0.6),0_8px_22px_-5px_rgba(29,78,216,0.65)]"
            >
              <span className="relative z-10 flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse shadow-[0_0_8px_2px_rgba(34,211,238,0.9)]"></span>
                Generate New Lifecycle
                <span className="text-cyan-200 text-xs font-normal bg-white/10 px-2 py-0.5 rounded-lg">AI</span>
              </span>
              {/* Animated border light */}
              <span className="absolute inset-[1px] rounded-2xl bg-[linear-gradient(125deg,rgba(255,255,255,0.12),transparent_40%,transparent_60%,rgba(255,255,255,0.15))]"></span>
              <span className="pointer-events-none absolute -inset-px rounded-2xl before:content-[''] before:absolute before:inset-0 before:rounded-2xl before:p-[2px] before:bg-[conic-gradient(from_var(--angle),rgba(6,182,212,0.4),rgba(59,130,246,0.5),rgba(6,182,212,0.4))] before:animate-spin-slow before:[mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] before:[mask-composite:exclude]"></span>
              <span className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-500 inset-0 rounded-2xl bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.25),transparent_60%)]"></span>
            </motion.button>
          </div>
        </motion.div>
        
  {/* (Instructions removed per request) */}
      </div>
    </div>
  )
}

// Main Page Component
export default function HomePage() {
  const [lifecycle, setLifecycle] = useState<LifecycleData | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentStage, setCurrentStage] = useState<string>('')
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set())

  const generateLifecycle = async (productDescription: string) => {
    setIsGenerating(true)
    setCurrentStage('')
    setCompletedStages(new Set())
    
    const stages = ['Raw Materials', 'Manufacturing', 'Distribution', 'Usage', 'End-of-Life / Recycling']
    
    try {
      console.log('Creating lifecycle skeleton...')
      
      // Step 1: Create lifecycle skeleton with empty stages
      const skeletonResponse = await fetch('http://localhost:8080/api/lifecycle/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_description: productDescription,
        }),
      })
      
      if (!skeletonResponse.ok) {
        throw new Error(`Failed to create lifecycle skeleton: ${skeletonResponse.status}`)
      }
      
      const skeletonData = await skeletonResponse.json()
      console.log('✅ Created lifecycle skeleton:', skeletonData.id)
      
      // Set initial lifecycle with empty stages
      setLifecycle(skeletonData)
      
      // Step 2: Generate each stage individually
      for (let i = 0; i < stages.length; i++) {
        const stageName = stages[i]
        setCurrentStage(stageName)
        
        console.log(`🎯 Generating stage ${i + 1}/${stages.length}: ${stageName}`)
        
        const stageResponse = await fetch(`http://localhost:8080/api/lifecycle/${skeletonData.id}/stage/${i}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (!stageResponse.ok) {
          console.error(`Failed to generate stage ${stageName}:`, stageResponse.status)
          continue // Skip this stage but continue with others
        }
        
        const stageData = await stageResponse.json()
        console.log(`✅ Generated stage: ${stageName}`)
        
        // Update completed stages
        setCompletedStages(prev => new Set([...Array.from(prev), stageName]))
        
        // Update lifecycle with new stage data
        setLifecycle(prevLifecycle => {
          if (!prevLifecycle) return prevLifecycle
          const updatedStages = [...prevLifecycle.stages]
          updatedStages[i] = stageData
          return {
            ...prevLifecycle,
            stages: updatedStages,
            updated_at: new Date().toISOString()
          }
        })
        
        // Small delay for smooth UI transitions
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      console.log('🎉 All stages generated successfully!')
      setCurrentStage('Complete!')
      
    } catch (error) {
      console.error('Error generating lifecycle:', error)
      alert(`Failed to generate lifecycle: ${error.message}`)
    } finally {
      setTimeout(() => {
        setIsGenerating(false)
        setCurrentStage('')
        setCompletedStages(new Set())
      }, 1000) // Show "Complete!" for 1 second
    }
  }

  // (Removed downloadPDF functionality per new requirements)

  return (
    <div className="min-h-screen">
      {!lifecycle ? (
        <HeroSection onGenerateLifecycle={generateLifecycle} />
      ) : (
        <LifecycleVisualization lifecycle={lifecycle} />
      )}

      {/* Loading Screen */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="glass-panel p-8 rounded-2xl text-center max-w-sm"
            >
              {/* 3D Progress Ring */}
              <div className="relative w-32 h-32 mx-auto mb-6">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background ring */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  {/* Progress ring */}
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="url(#progressGradient)"
                    strokeWidth="8"
                    fill="transparent"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ 
                      pathLength: completedStages.size / 5,
                      rotate: completedStages.size * 72
                    }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    style={{
                      strokeDasharray: "251.2 251.2",
                    }}
                  />
                  <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#00FFFF" />
                      <stop offset="100%" stopColor="#FF00FF" />
                    </linearGradient>
                  </defs>
                </svg>
                
                {/* Center indicator */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    animate={{ 
                      scale: currentStage ? [1, 1.1, 1] : 1,
                      rotate: 360 
                    }}
                    transition={{ 
                      scale: { repeat: Infinity, duration: 2 },
                      rotate: { repeat: Infinity, duration: 4, ease: "linear" }
                    }}
                    className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg"
                  >
                    {completedStages.size}/5
                  </motion.div>
                </div>
              </div>
              
              {/* Current Stage Display */}
              <motion.div
                key={currentStage}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mb-6"
              >
                <h3 className="text-2xl font-bold text-white mb-2">
                  {currentStage === 'Complete!' ? '✨ Complete!' : 'Generating Lifecycle'}
                </h3>
                {currentStage && currentStage !== 'Complete!' && (
                  <motion.p 
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="text-cyan-300 font-medium text-lg"
                  >
                    🎨 {currentStage}
                  </motion.p>
                )}
                {currentStage === 'Complete!' && (
                  <p className="text-green-400 font-medium">
                    All stages generated successfully!
                  </p>
                )}
              </motion.div>
              
              {/* Stage Indicators */}
              <div className="flex justify-center space-x-3 mb-4">
                {['Raw Materials', 'Manufacturing', 'Distribution', 'Usage', 'End-of-Life / Recycling'].map((stage, index) => (
                  <motion.div
                    key={stage}
                    initial={{ scale: 0 }}
                    animate={{ 
                      scale: 1,
                      backgroundColor: completedStages.has(stage) 
                        ? '#10B981' 
                        : currentStage === stage 
                          ? '#06B6D4' 
                          : 'rgba(255,255,255,0.2)'
                    }}
                    transition={{ delay: index * 0.1 }}
                    className={`w-3 h-3 rounded-full ${
                      currentStage === stage ? 'animate-pulse' : ''
                    }`}
                    title={stage}
                  />
                ))}
              </div>
              
              <p className="text-white/50 text-sm">
                {currentStage === 'Complete!' 
                  ? 'Ready to explore your lifecycle!'
                  : 'AI is crafting your sustainability story...'
                }
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
