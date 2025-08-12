"use client"

import { useRef, useEffect, useState } from "react"
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor"
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper"
import vtkSTLReader from "@kitware/vtk.js/IO/Geometry/STLReader"
import vtkLight from "@kitware/vtk.js/Rendering/Core/Light"
import vtkPlaneSource from "@kitware/vtk.js/Filters/Sources/PlaneSource"
import { useVtkScene } from "./scene"
import "@kitware/vtk.js/Rendering/Profiles/Geometry"
import vtkProp from "@kitware/vtk.js/Rendering/Core/Prop"

interface VtkAppProps {
  file: File | null
  viewMode?: string
}

export function VtkApp({ file, viewMode = "orbit" }: VtkAppProps) {
  const vtkContainerRef = useRef<HTMLDivElement>(null!)
  const { renderer, renderWindow, setBackground, addLight, resize } = useVtkScene(vtkContainerRef)

  const actorRef = useRef<vtkProp | null>(null)
  const mapperRef = useRef<vtkMapper | null>(null)
  const readerRef = useRef<vtkSTLReader | null>(null)
  const lightsRef = useRef<vtkLight[]>([])
  const floorActorRef = useRef<vtkProp | null>(null)
  const backgroundPlaneRef = useRef<vtkProp | null>(null)

  const [statusMessage, setStatusMessage] = useState<string>("Hazır. Lütfen bir STL dosyası seçin.")

  // Clear all lights function
  const clearAllLights = () => {
    if (!renderer.current) return

    lightsRef.current.forEach((light) => {
      renderer.current?.removeLight(light)
    })
    lightsRef.current = []
  }

  // Clear floor function
  const clearFloor = () => {
    if (!renderer.current || !floorActorRef.current) return

    renderer.current.removeActor(floorActorRef.current)
    floorActorRef.current.delete()
    floorActorRef.current = null
  }

  // Clear background plane function
  const clearBackgroundPlane = () => {
    if (!renderer.current || !backgroundPlaneRef.current) return

    renderer.current.removeActor(backgroundPlaneRef.current)
    backgroundPlaneRef.current.delete()
    backgroundPlaneRef.current = null
  }

  // Apply studio scene function
  const applyStudioScene = (sceneId: string) => {
    if (!renderer.current || !renderWindow.current) return

    // Clear existing lights, floor, and background plane
    clearAllLights()
    clearFloor()
    clearBackgroundPlane()

    switch (sceneId) {
      case "plain-white":
        // Arka planı saf beyaza ayarla
        renderer.current.setBackground(1, 1, 1) // RGB(255, 255, 255)

        // Ortam ışığı ekle (çok hafif)
        const ambientLight1 = vtkLight.newInstance()
        ambientLight1.setLightTypeToSceneLight()
        ambientLight1.setColor(0.1, 0.1, 0.1) // Çok hafif gri
        ambientLight1.setIntensity(0.1)
        renderer.current.addLight(ambientLight1)
        lightsRef.current.push(ambientLight1)

        // Ana yönlü ışık ekle (sağ üstten, yumuşak)
        const directionalLight1 = vtkLight.newInstance()
        directionalLight1.setLightTypeToSceneLight()
        directionalLight1.setPosition(10, 10, 10) // Sağ üstten
        directionalLight1.setFocalPoint(0, 0, 0) // Merkeze doğru bakar
        directionalLight1.setColor(1, 1, 1) // Beyaz ışık
        directionalLight1.setIntensity(0.9) // Yeterli yoğunlukta
        renderer.current.addLight(directionalLight1)
        lightsRef.current.push(directionalLight1)
        break

      case "3point-faded":
        // Arka planı dikey degradeye ayarla
        renderer.current.setBackground(0.941, 0.941, 0.961)
        renderer.current.setBackground2(1, 1, 1)

        // Ortam ışığı ekle (yeterli miktarda)
        const ambientLight2 = vtkLight.newInstance()
        ambientLight2.setLightTypeToSceneLight()
        ambientLight2.setColor(0.3, 0.3, 0.3) // Orta gri
        ambientLight2.setIntensity(0.3)
        renderer.current.addLight(ambientLight2)
        lightsRef.current.push(ambientLight2)

        // Ana yönlü ışık ekle (sağ üstten)
        const mainDirectionalLight = vtkLight.newInstance()
        mainDirectionalLight.setLightTypeToSceneLight()
        mainDirectionalLight.setPosition(10, 10, 10)
        mainDirectionalLight.setFocalPoint(0, 0, 0)
        mainDirectionalLight.setColor(1, 1, 1)
        mainDirectionalLight.setIntensity(0.8)
        renderer.current.addLight(mainDirectionalLight)
        lightsRef.current.push(mainDirectionalLight)

        // Ek dolgu ışığı (sol alttan, çok hafif)
        const fillLight = vtkLight.newInstance()
        fillLight.setLightTypeToSceneLight()
        fillLight.setPosition(-10, -10, 5)
        fillLight.setFocalPoint(0, 0, 0)
        fillLight.setColor(1, 1, 1)
        fillLight.setIntensity(0.2)
        renderer.current.addLight(fillLight)
        lightsRef.current.push(fillLight)
        break

      case "simple-office":
        // Arka plan rengi (açık gri duvarlar için)
        renderer.current.setBackground(0.9, 0.9, 0.9)

        // Zemin oluştur ve rengini ayarla
        const floorSource = vtkPlaneSource.newInstance({
          xResolution: 10,
          yResolution: 10,
        })
        floorSource.setOrigin(-5, -5, -1)
        floorSource.setPoint1(5, -5, -1)
        floorSource.setPoint2(-5, 5, -1)

        const floorMapper = vtkMapper.newInstance()
        floorMapper.setInputConnection(floorSource.getOutputPort())

        const floorActor = vtkActor.newInstance()
        floorActor.setMapper(floorMapper)
        floorActor.getProperty().setColor(0.8, 0.8, 0.8) // Açık gri zemin
        renderer.current.addActor(floorActor)
        floorActorRef.current = floorActor

        // Ortam ışığı ekle (genel aydınlık)
        const ambientLight3 = vtkLight.newInstance()
        ambientLight3.setLightTypeToSceneLight()
        ambientLight3.setColor(0.2, 0.2, 0.2)
        ambientLight3.setIntensity(0.2)
        renderer.current.addLight(ambientLight3)
        lightsRef.current.push(ambientLight3)

        // Doğal pencere ışığı (geniş ve yumuşak, sol üstten)
        const windowLight = vtkLight.newInstance()
        windowLight.setLightTypeToSceneLight()
        windowLight.setPosition(-10, 5, 10) // Sol üstten gelen ışık
        windowLight.setFocalPoint(0, 0, 0)
        windowLight.setColor(0.95, 0.95, 1) // Hafif mavimsi beyaz (gün ışığı)
        windowLight.setIntensity(0.8)
        renderer.current.addLight(windowLight)
        lightsRef.current.push(windowLight)
        break

      case "warm-studio":
        // Arka planı sıcak bej tonuna ayarla
        renderer.current.setBackground(0.98, 0.96, 0.9) // RGB(250, 245, 230)

        const warmAmbientLight = vtkLight.newInstance()
        warmAmbientLight.setLightTypeToSceneLight()
        warmAmbientLight.setColor(0.8, 0.7, 0.6) // Sıcak, hafif turuncumsu
        warmAmbientLight.setIntensity(0.7) // Yüksek yoğunlukta ortam ışığı
        renderer.current.addLight(warmAmbientLight)
        lightsRef.current.push(warmAmbientLight)

        // Yumuşak ana ışık (düşük kontrast)
        const softMainLight = vtkLight.newInstance()
        softMainLight.setLightTypeToSceneLight()
        softMainLight.setPosition(8, 8, 8)
        softMainLight.setFocalPoint(0, 0, 0)
        softMainLight.setColor(1, 0.95, 0.9) // Hafif sarımsı beyaz
        softMainLight.setIntensity(0.5) // Orta yoğunluk
        renderer.current.addLight(softMainLight)
        lightsRef.current.push(softMainLight)
        break

      default:
        // Default to plain white
        renderer.current.setBackground(1, 1, 1)
        break
    }

    // Render the scene
    renderWindow.current.render()
    console.log(`Applied studio scene: ${sceneId}`)
  }

  // Listen for studio scene changes
  useEffect(() => {
    const handleStudioSceneChange = (event: CustomEvent) => {
      applyStudioScene(event.detail.sceneId)
    }

    window.addEventListener("applyStudioScene", handleStudioSceneChange as EventListener)

    return () => {
      window.removeEventListener("applyStudioScene", handleStudioSceneChange as EventListener)
    }
  }, [renderer, renderWindow])

  // Listen for custom background changes
  useEffect(() => {
    const handleCustomBackgroundChange = (event: CustomEvent) => {
      if (!renderer.current || !renderWindow.current) return

      // Clear background plane when applying custom color
      clearBackgroundPlane()

      const color = event.detail.color
      // Hex color'u RGB'ye çevir
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        return result
          ? {
              r: Number.parseInt(result[1], 16) / 255,
              g: Number.parseInt(result[2], 16) / 255,
              b: Number.parseInt(result[3], 16) / 255,
            }
          : { r: 1, g: 1, b: 1 }
      }

      const rgb = hexToRgb(color)

      // Sadece background rengini değiştir, ışıkları koruma
      renderer.current.setBackground(rgb.r, rgb.g, rgb.b)

      // Render the scene
      renderWindow.current.render()
      console.log(`Applied custom background color: ${color}`)
    }

    window.addEventListener("applyCustomBackground", handleCustomBackgroundChange as EventListener)

    return () => {
      window.removeEventListener("applyCustomBackground", handleCustomBackgroundChange as EventListener)
    }
  }, [renderer, renderWindow])

  // Listen for background image changes
  useEffect(() => {
    const handleBackgroundImageChange = (event: CustomEvent) => {
      if (!renderer.current || !renderWindow.current) return

      const { imageFile } = event.detail

      if (imageFile) {
        // Create image element
        const backgroundImage = new Image()
        backgroundImage.crossOrigin = "anonymous"

        backgroundImage.onload = () => {
          try {
            // Clear any existing background plane (if any)
            clearBackgroundPlane()

            // VTK renderWindow'da native background image API yok; container div'e CSS background uygula
            if (vtkContainerRef.current) {
              vtkContainerRef.current.style.backgroundImage = `url('${backgroundImage.src}')`
              vtkContainerRef.current.style.backgroundSize = "cover"
              vtkContainerRef.current.style.backgroundPosition = "center"
            }
            // Şeffaf arka plan için renderer clear color alpha'yı ayarlamak mümkün değil burada; sadece render et
            if (renderWindow.current) {
              renderWindow.current.render()
            }

            console.log("Background image applied successfully:", imageFile.name)
          } catch (error) {
            console.error("Error applying background image:", error)
            // Fallback to white background
            renderer.current?.setBackground(1, 1, 1)
            renderWindow.current!.render()
          }
        }

        backgroundImage.onerror = () => {
          console.error("Failed to load background image")
          // Fallback to white background
          renderer.current?.setBackground(1, 1, 1)
          renderWindow.current!.render()
        }

        // Load image from file
        const reader = new FileReader()
        reader.onload = (e) => {
          if (e.target?.result) {
            backgroundImage.src = e.target.result as string
          }
        }
        reader.readAsDataURL(imageFile)
      } else {
        // Clear background image - revert to solid color background
        if (vtkContainerRef.current) {
          vtkContainerRef.current.style.backgroundImage = "none"
        }
        renderer.current.setBackground(1, 1, 1)
        renderWindow.current.render()
      }

      console.log("Background image change processed")
    }

    window.addEventListener("applyBackgroundImage", handleBackgroundImageChange as EventListener)

    return () => {
      window.removeEventListener("applyBackgroundImage", handleBackgroundImageChange as EventListener)
    }
  }, [renderer, renderWindow])

  // Listen for camera view change events
  useEffect(() => {
    const handleSetView = (event: CustomEvent) => {
      if (!renderer.current || !renderWindow.current) return
      const cam = renderer.current.getActiveCamera()
      const view: string = event.detail.view

      // Önce mevcut sahneye göre zoom-to-fit yap (VTK'nin kendi algoritması)
      renderer.current.resetCamera()
      renderer.current.resetCameraClippingRange()

      const center = cam.getFocalPoint() as [number, number, number]
      const currentPos = cam.getPosition() as [number, number, number]
      // Reset sonrası mesafeyi koru
      const dx = currentPos[0] - center[0]
      const dy = currentPos[1] - center[1]
      const dz = currentPos[2] - center[2]
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1

      // Yön vektörleri (CAD benzeri eksenler: +Z = Top, -Y = Front varsayımı)
      let dir: [number, number, number] = [0, -1, 0] // Front default
      let up: [number, number, number] = [0, 0, 1]

      switch (view.toLowerCase()) {
        case "front":
          dir = [0, -1, 0]
          up = [0, 0, 1]
          break
        case "back":
          dir = [0, 1, 0]
          up = [0, 0, 1]
          break
        case "left":
          dir = [-1, 0, 0]
          up = [0, 0, 1]
          break
        case "right":
          dir = [1, 0, 0]
          up = [0, 0, 1]
          break
        case "top":
          dir = [0, 0, 1]
          up = [0, 1, 0]
          break
        case "bottom":
          dir = [0, 0, -1]
          up = [0, -1, 0]
          break
        case "iso":
        case "isometric": {
          const inv = 1 / Math.sqrt(3)
          dir = [1 * inv, -1 * inv, 1 * inv] // (X+, Y-, Z+)
          up = [0, 0, 1]
          break
        }
        default:
          break
      }

      // Yeni pozisyon = center - dir * dist
      const newPos: [number, number, number] = [
        center[0] - dir[0] * dist,
        center[1] - dir[1] * dist,
        center[2] - dir[2] * dist,
      ]

      cam.setPosition(...newPos)
      cam.setFocalPoint(...center)
      cam.setViewUp(...up)
      renderer.current.resetCameraClippingRange()
      renderWindow.current.render()
    }

    window.addEventListener("setView", handleSetView as EventListener)
    return () => window.removeEventListener("setView", handleSetView as EventListener)
  }, [renderer, renderWindow])

  // Listen for zoom events
  useEffect(() => {
    const handleZoomIn = () => {
      if (!renderer.current || !renderWindow.current) return
      const camera = renderer.current.getActiveCamera()
      camera.zoom(1.2)
      renderWindow.current.render()
    }

    const handleZoomOut = () => {
      if (!renderer.current || !renderWindow.current) return
      const camera = renderer.current.getActiveCamera()
      camera.zoom(0.8)
      renderWindow.current.render()
    }

    const handleZoomToFit = () => {
      if (!renderer.current || !renderWindow.current) return
      renderer.current.resetCamera()
      renderer.current.resetCameraClippingRange()
      renderWindow.current.render()
    }

    const handleBoxZoom = () => {
      // Box zoom implementation would require more complex interaction handling
      console.log("Box zoom activated - drag to select area")
    }

    window.addEventListener("zoomIn", handleZoomIn)
    window.addEventListener("zoomOut", handleZoomOut)
    window.addEventListener("zoomToFit", handleZoomToFit)
    window.addEventListener("boxZoom", handleBoxZoom)

    return () => {
      window.removeEventListener("zoomIn", handleZoomIn)
      window.removeEventListener("zoomOut", handleZoomOut)
      window.removeEventListener("zoomToFit", handleZoomToFit)
      window.removeEventListener("boxZoom", handleBoxZoom)
    }
  }, [renderer, renderWindow])

  // Listen for camera reset events
  useEffect(() => {
    const handleResetCamera = () => {
      if (!renderer.current || !renderWindow.current) return

      // Reset camera to fit the scene
      renderer.current.resetCamera()
      renderer.current.resetCameraClippingRange()

      // Set a nice isometric view as default
      const camera = renderer.current.getActiveCamera()
      const center = camera.getFocalPoint()
      const currentPos = camera.getPosition()

      // Calculate distance to maintain
      const dx = currentPos[0] - center[0]
      const dy = currentPos[1] - center[1]
      const dz = currentPos[2] - center[2]
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1

      // Set isometric view
      const inv = 1 / Math.sqrt(3)
      const dir = [1 * inv, -1 * inv, 1 * inv]
      const up = [0, 0, 1]

      const newPos = [center[0] - dir[0] * dist, center[1] - dir[1] * dist, center[2] - dir[2] * dist]

      camera.setPosition(...newPos)
      camera.setFocalPoint(...center)
      camera.setViewUp(...up)
      renderer.current.resetCameraClippingRange()
      renderWindow.current.render()
    }

    window.addEventListener("resetCamera", handleResetCamera)
    return () => window.removeEventListener("resetCamera", handleResetCamera)
  }, [renderer, renderWindow])

  // Sahne başlangıç ayarları (Default Plain White)
  useEffect(() => {
    if (!renderer.current || !renderWindow.current) return

    // Apply default plain white scene
    applyStudioScene("plain-white")
  }, [renderer, renderWindow])

  // Pencere boyutlandırma yöneticisi
  useEffect(() => {
    if (!resize) return
    const handleWindowResize = () => resize()
    window.addEventListener("resize", handleWindowResize)
    handleWindowResize() // İlk boyutu ayarlamak için bir kere çağır

    return () => window.removeEventListener("resize", handleWindowResize)
  }, [resize])

  // Enhanced zoom kontrolü için useEffect ekle
  useEffect(() => {
    if (!renderer.current || !renderWindow.current) return

    const handleWheel = (event: WheelEvent) => {
      // Only handle wheel events in zoom mode or default orbit mode
      if (viewMode !== "zoom" && viewMode !== "orbit") return

      event.preventDefault()

      const camera = renderer.current.getActiveCamera()
      const position = camera.getPosition()
      const focalPoint = camera.getFocalPoint()

      // Mevcut mesafeyi hesapla
      const dx = position[0] - focalPoint[0]
      const dy = position[1] - focalPoint[1]
      const dz = position[2] - focalPoint[2]
      const currentDistance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      // Zoom faktörü (wheel delta'ya göre)
      const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9
      const newDistance = currentDistance * zoomFactor

      // Zoom sınırları (minimum ve maksimum mesafe)
      const minDistance = 0.1
      const maxDistance = 100

      // Sınırları kontrol et
      if (newDistance < minDistance || newDistance > maxDistance) {
        return // Sınır dışındaysa zoom yapma
      }

      // Yeni pozisyonu hesapla
      const direction = [dx / currentDistance, dy / currentDistance, dz / currentDistance]
      const newPosition = [
        focalPoint[0] + direction[0] * newDistance,
        focalPoint[1] + direction[1] * newDistance,
        focalPoint[2] + direction[2] * newDistance,
      ]

      camera.setPosition(...newPosition)
      renderer.current.resetCameraClippingRange()
      
      renderWindow.current?.render()
    }

    const container = vtkContainerRef.current
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false })

      return () => {
        container.removeEventListener("wheel", handleWheel)
      }
    }
  }, [renderer, renderWindow, viewMode])

  // Container boyut değişikliklerini izle
  useEffect(() => {
    if (!resize || !vtkContainerRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      // Kısa bir gecikme ile resize çağır (DOM güncellemelerini bekle)
      setTimeout(() => {
        resize()
      }, 100)
    })
    

    resizeObserver.observe(vtkContainerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [resize])

  // STL Dosyası yükleme mantığı
  useEffect(() => {
    if (!file || !renderer.current || !renderWindow.current) {
      return
    }

    setStatusMessage("STL dosyası okunuyor...")
    const fileReader = new FileReader()
    const reader = vtkSTLReader.newInstance()
    readerRef.current = reader

    fileReader.onload = (event) => {
      if (!renderer.current || !renderWindow.current || !event.target?.result) {
        setStatusMessage("Dosya okunurken bir hata oluştu.")
        return
      }

      console.log("Dosya başarıyla okundu. VTK pipeline başlatılıyor...")

      const arrayBuffer = event.target.result as ArrayBuffer
      reader.parseAsArrayBuffer(arrayBuffer)
      const source = reader.getOutputData(0)

      if (!source || source.getPoints().getNumberOfPoints() === 0) {
        setStatusMessage("Hata: STL dosyası geçersiz veya boş.")
        console.error("Geçersiz STL kaynağı.")
        return
      }
      console.log("STL dosyası başarıyla parse edildi.")

      // Önceki aktörü ve mapper'ı temizle
      if (actorRef.current) {
        renderer.current.removeActor(actorRef.current)
        actorRef.current.delete()
        actorRef.current = null
      }
      if (mapperRef.current) {
        mapperRef.current.delete()
        mapperRef.current = null
      }
      console.log("Önceki aktör ve mapper temizlendi.")

      const mapper = vtkMapper.newInstance({ scalarVisibility: false })
      mapper.setInputData(source)
      mapperRef.current = mapper

      const actor = vtkActor.newInstance()
      actor.setMapper(mapper)

      // Default material properties
      const property = actor.getProperty()
      property.setColor(0.75, 0.75, 0.75) // Gümüş rengi
      actorRef.current = actor

      console.log("Yeni mapper ve aktör oluşturuldu.")

      // Aktörü sahneye ekle
      renderer.current.addActor(actor)
      console.log("Aktör sahneye eklendi. Sahnedeki aktör sayısı:", renderer.current.getActors().length)

      // Kamerayı sıfırla
      renderer.current.resetCamera()
      renderer.current.resetCameraClippingRange()
      console.log("Kamera sıfırlandı. Kamera pozisyonu:", renderer.current.getActiveCamera().getPosition())

      // Son olarak, sahneyi render et
      renderWindow.current.render()
      console.log("Final render çağrıldı. Modelin görünmesi gerekiyor.")

      setStatusMessage("STL dosyası başarıyla yüklendi.")
    }

    fileReader.onerror = () => {
      setStatusMessage("Dosya okunamadı.")
      console.error("FileReader error.")
    }

    fileReader.readAsArrayBuffer(file)

    return () => {
      if (readerRef.current) {
        readerRef.current.delete()
        readerRef.current = null
      }
    }
  }, [file, renderer, renderWindow])

  // Cleanup function
  useEffect(() => {
    return () => {
      clearAllLights()
      clearFloor()
      clearBackgroundPlane()
    }
  }, [])

  return (
    <div className="w-full h-full flex flex-col relative bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
      <div
        ref={vtkContainerRef}
        className="w-full h-full flex-grow min-h-[400px]"
        style={{
          touchAction: "none",
          minWidth: "300px",
          maxWidth: "100%",
          maxHeight: "100vh",
          cursor:
            viewMode === "pan"
              ? "grab"
              : viewMode === "zoom"
                ? "zoom-in"
                : viewMode === "select"
                  ? "pointer"
                  : "default",
        }}
      />
      <div className="absolute bottom-0 left-0 w-full bg-gray-50/80 backdrop-blur-sm text-gray-800 text-xs px-3 py-1 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span>{statusMessage}</span>
          <span className="text-gray-500">Mode: {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}</span>
        </div>
      </div>
    </div>
  )
}
