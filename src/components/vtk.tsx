"use client"

import "@kitware/vtk.js/Rendering/Profiles/Geometry"

import vtkFullScreenRenderWindow from "@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow"
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor"
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper"
import vtkConeSource from "@kitware/vtk.js/Filters/Sources/ConeSource"
import type vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer"
import type vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow"
import { useEffect, useRef, useState } from "react"

interface VTKContext {
  fullScreenRenderWindow: vtkFullScreenRenderWindow
  renderer: vtkRenderer
  renderWindow: vtkRenderWindow
  coneSource: vtkConeSource
  actor: vtkActor
  mapper: vtkMapper
}

export function VtkApp() {
  const vtkContainerRef = useRef<HTMLDivElement>(null)
  const context = useRef<VTKContext | null>(null)
  const [coneResolution, setConeResolution] = useState<number>(6)
  const [representation, setRepresentation] = useState<number>(2)

  useEffect(() => {
    if (!context.current && vtkContainerRef.current) {
      if (vtkContainerRef.current.innerHTML) {
        vtkContainerRef.current.innerHTML = ""
      }

      // Create full screen render window
      const fullScreenRenderWindow = vtkFullScreenRenderWindow.newInstance({
        background: [0.95, 0.95, 0.95],
      })

      // Add the container to our div
      const container = fullScreenRenderWindow.getContainer()
      vtkContainerRef.current.appendChild(container)

      const coneSource = vtkConeSource.newInstance({})

      const mapper = vtkMapper.newInstance()
      mapper.setInputConnection(coneSource.getOutputPort())

      const actor = vtkActor.newInstance()
      actor.setMapper(mapper)

      const renderer = fullScreenRenderWindow.getRenderer()
      const renderWindow = fullScreenRenderWindow.getRenderWindow()

      renderer.addActor(actor)
      renderer.resetCamera()
      renderWindow.render()

      context.current = {
        fullScreenRenderWindow,
        renderWindow,
        renderer,
        coneSource,
        actor,
        mapper,
      }
    }

    return () => {
      if (context.current) {
        const { fullScreenRenderWindow, coneSource, actor, mapper } = context.current
        actor.delete()
        mapper.delete()
        coneSource.delete()
        fullScreenRenderWindow.delete()
        context.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (context.current) {
      const { coneSource, renderWindow } = context.current
      coneSource.setResolution(coneResolution)
      renderWindow.render()
    }
  }, [coneResolution])

  useEffect(() => {
    if (context.current) {
      const { actor, renderWindow } = context.current
      actor.getProperty().setRepresentation(representation)
      renderWindow.render()
    }
  }, [representation])

  return (
    <div className="w-full h-full relative bg-gray-50">
      <div ref={vtkContainerRef} className="w-full h-full" />

      {/* Control Panel */}
      <div className="absolute top-6 left-6 bg-white rounded-lg shadow-md border border-gray-200 p-4 min-w-[200px]">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">VizCad Controls</h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="rendering-style" className="block text-sm font-medium text-gray-700 mb-2">
              Rendering Style
            </label>
            <select
              id="rendering-style"
              value={representation}
              onChange={(ev) => setRepresentation(Number(ev.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="0">Points</option>
              <option value="1">Wireframe</option>
              <option value="2">Surface</option>
            </select>
          </div>

          <div>
            <label htmlFor="cone-resolution" className="block text-sm font-medium text-gray-700 mb-2">
              Resolution: {coneResolution}
            </label>
            <input
              id="cone-resolution"
              type="range"
              min="4"
              max="80"
              value={coneResolution}
              onChange={(ev) => setConeResolution(Number(ev.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer 
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 
                         [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm
                         [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full 
                         [&::-moz-range-thumb]:bg-orange-500 [&::-moz-range-thumb]:cursor-pointer 
                         [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow-sm"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
