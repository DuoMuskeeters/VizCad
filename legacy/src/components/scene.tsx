import { useRef, useEffect } from "react"
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow"
import type vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer"
import type vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow"

import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor"
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper"
import vtkPlaneSource from "@kitware/vtk.js/Filters/Sources/PlaneSource"
import vtkAxesActor from "@kitware/vtk.js/Rendering/Core/AxesActor"
import vtkOrientationMarkerWidget from "@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget"
import "@kitware/vtk.js/Rendering/Profiles/Geometry"
import type vtkProp from "@kitware/vtk.js/Rendering/Core/Prop"

// Renk tipleri
type RED = number
type GREEN = number
type BLUE = number
type RGB = [RED, GREEN, BLUE]

export function useVtkScene(viewLocked: boolean = false) {
  // Ref'leri daha spesifik tiplerle ve null başlangıç değeriyle tanımlıyoruz
  const vtkContainerRef = useRef<HTMLDivElement>(null!)
  const genericRenderWindowRef = useRef<vtkGenericRenderWindow | null>(null)
  const rendererRef = useRef<vtkRenderer | null>(null)
  const renderWindowRef = useRef<vtkRenderWindow | null>(null)
  const actorRef = useRef<vtkProp | null>(null)
  const mapperRef = useRef<vtkMapper | null>(null)
  const floorActorRef = useRef<vtkProp | null>(null)
  const backgroundPlaneRef = useRef<vtkProp | null>(null)
  const gridActorRef = useRef<vtkProp | null>(null)
  const axesActorRef = useRef<vtkAxesActor | null>(null)
  const axesWidgetRef = useRef<any | null>(null)
  const viewLockedRef = useRef<boolean>(false)
  const gridPlaneSourcesRef = useRef<any[] | null>(null)
  const gridSubscriptionsRef = useRef<any[] | null>(null)

  useEffect(() => {
    if (vtkContainerRef.current && !genericRenderWindowRef.current) {
      const grw = vtkGenericRenderWindow.newInstance()
      grw.setContainer(vtkContainerRef.current)

      genericRenderWindowRef.current = grw
      rendererRef.current = grw.getRenderer()
      rendererRef.current.setBackground(1, 1, 1) // Default to white
      renderWindowRef.current = grw.getRenderWindow()

      // View lock based on prop
      viewLockedRef.current = viewLocked
      try {
        const interactor = grw.getRenderWindow().getInteractor()
        if (viewLockedRef.current) interactor?.disable?.()
        else interactor?.enable?.()
      } catch { }

      // VTK sahnesinin başlatıldığını belirtmek için bir ilk render yapalım
      rendererRef.current.getRenderWindow()?.render()
      console.log("VTK scene initialized")

      // Cleanup function
      return () => {
        console.log("Cleaning up VTK scene...")
        if (genericRenderWindowRef.current) {
          genericRenderWindowRef.current.delete()
          genericRenderWindowRef.current = null
        }
        rendererRef.current = null
        renderWindowRef.current = null
        console.log("VTK scene cleaned up")
      }
    }
  }, [vtkContainerRef])

  // Update view lock when prop changes
  useEffect(() => {
    if (!genericRenderWindowRef.current) return
    viewLockedRef.current = viewLocked
    try {
      const interactor = genericRenderWindowRef.current.getRenderWindow().getInteractor()
      if (viewLocked) interactor?.disable?.()
      else interactor?.enable?.()
    } catch { }
  }, [viewLocked])

  const setBackground = (color: RGB) => {
    if (rendererRef.current && renderWindowRef.current) {
      rendererRef.current.setBackground(color)
      renderWindowRef.current.render()
      console.log("Background color set to:", color)
    }
  }

  const clearFloor = () => {
    if (!rendererRef.current || !floorActorRef.current) return

    rendererRef.current.removeActor(floorActorRef.current)
    floorActorRef.current.delete()
    floorActorRef.current = null
  }

  const clearBackgroundPlane = () => {
    if (!rendererRef.current || !backgroundPlaneRef.current) return

    rendererRef.current.removeActor(backgroundPlaneRef.current)
    backgroundPlaneRef.current.delete()
    backgroundPlaneRef.current = null
  }

  const resize = () => {
    if (genericRenderWindowRef.current) {
      genericRenderWindowRef.current.resize()
      console.log("VTK window resized.")
    }
  }

  const applyStudioScene = (sceneId: string) => {
    // Clear existing floor and background plane
    clearFloor()
    clearBackgroundPlane()
    const renderer = rendererRef.current
    if (!renderer) return

    switch (sceneId) {
      case "plain-white": {
        renderer.setBackground(1, 1, 1);
        break;
      }
      case "3point-faded": {
        renderer.setBackground(0.96, 0.96, 0.975);
        break;
      }
      case "simple-office": {
        renderer.setBackground(0.9, 0.9, 0.9)
        const floorSource = vtkPlaneSource.newInstance({
          xResolution: 10,
          yResolution: 10,
        });
        floorSource.setOrigin(-5, -5, -1);
        floorSource.setPoint1(5, -5, -1);
        floorSource.setPoint2(-5, 5, -1);
        const floorMapper = vtkMapper.newInstance();
        floorMapper.setInputConnection(floorSource.getOutputPort());
        const floorActor = vtkActor.newInstance();
        floorActor.setMapper(floorMapper);
        floorActor.getProperty().setColor(0.8, 0.8, 0.8);
        renderer.addActor(floorActor);
        floorActorRef.current = floorActor;
        break;
      }
      case "warm-studio": {
        renderer.setBackground(0.98, 0.96, 0.9);
        break;
      }
      default: {
        renderer.setBackground(1, 1, 1);
        break;
      }
    }

    // Camera clipping range & redraw
    if (rendererRef.current && renderWindowRef.current) {
      rendererRef.current.resetCameraClippingRange()
      renderWindowRef.current.render()
    }
  }

  // Display feature helpers
  const setWireframe = (enabled: boolean) => {
    if (!actorRef.current || !renderWindowRef.current) return
    const prop: any = (actorRef.current as any).getProperty?.()
    if (!prop) return
    if (enabled) prop.setRepresentationToWireframe()
    else prop.setRepresentationToSurface()
    renderWindowRef.current.render()
  }

  const setSmoothShading = (enabled: boolean) => {
    if (!actorRef.current || !renderWindowRef.current) return
    const prop: any = (actorRef.current as any).getProperty?.()
    if (!prop) return
    if (enabled) {
      // Recompute normals if possible for better smooth shading
      try {
        const mapper: any = (actorRef.current as any).getMapper?.()
        const data = mapper?.getInputData?.()
        if (data) {
          import("@kitware/vtk.js/Filters/Core/PolyDataNormals").then((mod) => {
            const normals = (mod as any).default.newInstance({
              splitting: false,
            })
            normals.setInputData(data)
            normals.update()
            mapper.setInputData(normals.getOutputData())
            prop.setInterpolationToPhong?.()
            renderWindowRef.current!.render()
          })
        } else {
          prop.setInterpolationToPhong?.()
        }
      } catch {
        prop.setInterpolationToPhong?.()
      }
    } else {
      prop.setInterpolationToFlat?.()
    }
    renderWindowRef.current.render()
  }

  const showGrid = (_enabled: boolean) => {
    if (!rendererRef.current || !renderWindowRef.current) return
    if (gridActorRef.current) {
      if ((gridActorRef.current as any).actors) {
        ; (gridActorRef.current as any).actors.forEach((a: any) => {
          rendererRef.current!.removeActor(a)
          a.delete?.()
        })
      } else {
        rendererRef.current.removeActor(gridActorRef.current as any)
          ; (gridActorRef.current as any).delete?.()
      }
      gridActorRef.current = null
    }
    gridPlaneSourcesRef.current = null
    if (gridSubscriptionsRef.current) {
      gridSubscriptionsRef.current.forEach((s) => s?.unsubscribe?.())
      gridSubscriptionsRef.current = null
    }
    rendererRef.current.resetCameraClippingRange()
    renderWindowRef.current.render()
  }

  const showAxes = (enabled: boolean) => {
    if (!rendererRef.current || !renderWindowRef.current || !genericRenderWindowRef.current) return
    if (enabled) {
      if (axesWidgetRef.current) return // already active
      const axes = vtkAxesActor.newInstance()
        ; (axes as any).setTotalLength?.(1.5, 1.5, 1.5)
      axesActorRef.current = axes
      const widget = vtkOrientationMarkerWidget.newInstance({
        actor: axes,
        interactor: genericRenderWindowRef.current.getRenderWindow().getInteractor(),
      })
      widget.setViewportCorner(vtkOrientationMarkerWidget.Corners.BOTTOM_LEFT)
      widget.setViewportSize(0.18)
      widget.setMinPixelSize(80)
      widget.setMaxPixelSize(150)
      widget.setEnabled(true)
      axesWidgetRef.current = widget
    } else if (axesWidgetRef.current) {
      axesWidgetRef.current.setEnabled(false)
      axesWidgetRef.current.delete()
      axesWidgetRef.current = null
      if (axesActorRef.current) {
        ; (axesActorRef.current as any).delete?.()
        axesActorRef.current = null
      }
    }
    renderWindowRef.current.render()
  }

  const setProjection = (perspective: boolean) => {
    if (!rendererRef.current || !renderWindowRef.current) return
    const camera = rendererRef.current.getActiveCamera()
    if (perspective) {
      camera.setParallelProjection(false)
    } else {
      camera.setParallelProjection(true)
    }
    rendererRef.current.resetCameraClippingRange()
    renderWindowRef.current.render()
  }

  const resetCamera = () => {
    if (!rendererRef.current || !renderWindowRef.current) return
    rendererRef.current.resetCamera()
    rendererRef.current.resetCameraClippingRange()
    renderWindowRef.current.render()
  }

  const zoomIn = () => {
    if (!rendererRef.current || !renderWindowRef.current) return
    const camera = rendererRef.current.getActiveCamera()
    camera.zoom(1.2)
    rendererRef.current.resetCameraClippingRange()
    renderWindowRef.current.render()
  }

  const zoomOut = () => {
    if (!rendererRef.current || !renderWindowRef.current) return
    const camera = rendererRef.current.getActiveCamera()
    camera.zoom(0.8)
    rendererRef.current.resetCameraClippingRange()
    renderWindowRef.current.render()
  }

  const setView = (view: string) => {
    if (!rendererRef.current || !renderWindowRef.current) return
    const camera = rendererRef.current.getActiveCamera()
    const bounds = rendererRef.current.computeVisiblePropBounds()

    if (!bounds || bounds[0] > bounds[1]) return

    const center = [
      (bounds[0] + bounds[1]) / 2,
      (bounds[2] + bounds[3]) / 2,
      (bounds[4] + bounds[5]) / 2,
    ]

    const diagonal = Math.sqrt(
      Math.pow(bounds[1] - bounds[0], 2) +
      Math.pow(bounds[3] - bounds[2], 2) +
      Math.pow(bounds[5] - bounds[4], 2)
    )

    const distance = diagonal * 1.5

    camera.setFocalPoint(center[0], center[1], center[2])

    switch (view.toLowerCase()) {
      case "front":
        camera.setPosition(center[0], center[1], center[2] + distance)
        camera.setViewUp(0, 1, 0)
        break
      case "back":
        camera.setPosition(center[0], center[1], center[2] - distance)
        camera.setViewUp(0, 1, 0)
        break
      case "top":
        camera.setPosition(center[0], center[1] + distance, center[2])
        camera.setViewUp(0, 0, -1)
        break
      case "bottom":
        camera.setPosition(center[0], center[1] - distance, center[2])
        camera.setViewUp(0, 0, 1)
        break
      case "left":
        camera.setPosition(center[0] - distance, center[1], center[2])
        camera.setViewUp(0, 1, 0)
        break
      case "right":
        camera.setPosition(center[0] + distance, center[1], center[2])
        camera.setViewUp(0, 1, 0)
        break
      case "iso":
        camera.setPosition(
          center[0] + distance * 0.7,
          center[1] + distance * 0.7,
          center[2] + distance * 0.7
        )
        camera.setViewUp(0, 1, 0)
        break
    }

    rendererRef.current.resetCameraClippingRange()
    renderWindowRef.current.render()
  }

  // This file contains pure VTK functionality and should never be affected by theme/palette changes
  // Only the UI wrapper elements should respond to theme changes, not the 3D rendering area

  return {
    rendererRef: rendererRef,
    renderWindowRef: renderWindowRef,
    mapperRef,
    floorActorRef,
    backgroundPlaneRef,
    gridActorRef,
    axesActorRef,
    axesWidgetRef,
    vtkContainerRef,
    actorRef,
    setBackground,
    resize,
    clearFloor,
    clearBackgroundPlane,
    applyStudioScene,
    setWireframe,
    setSmoothShading,
    showGrid,
    showAxes,
    setProjection,
    resetCamera,
    zoomIn,
    zoomOut,
    setView,
  }
}
