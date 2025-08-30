"use client"

import React, { useState, useEffect, useRef } from "react"
import emailjs from "@emailjs/browser"

import { VtkApp } from "@/components/vtk"
import { Button } from "@/components/ui/button"
import { createFileRoute } from "@tanstack/react-router"
import {
  Upload,
  File,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Eye,
  Palette,
  Sun,
  Info,
  Camera,
  Lightbulb,
  ImageIcon,
  Layers,
  Lock,
  Clock,
  X,
  Target,
  Navigation,
  Maximize,
  Move3d,
  Box,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { ScenesTab } from "@/components/tabs/sceneTabs"
import { LightsTab } from "@/components/tabs/LightsTab"
import { MaterialsTab } from "@/components/tabs/MaterialsTab"
import { OutputTab } from "@/components/tabs/OutputTab"
import { CameraTab } from "@/components/tabs/CameraTab"
import { useVtkScene } from "@/components/scene"

export const Route = createFileRoute("/app")({
  component: AppPage,
})

function AppPage() {
  const { t } = useTranslation()
  const {
    vtkContainerRef,
    rendererRef,
    renderWindowRef,
    actorRef,
    mapperRef,
    readerRef,
    lightsRef,
    floorActorRef,
    backgroundPlaneRef,
    setBackground,
    addLight,
    resize,
    clearAllLights,
    clearFloor,
    clearBackgroundPlane,
    applyStudioScene,
    captureImage,
  } = useVtkScene()
  const [showNavigationModal, setShowNavigationModal] = useState(false)
  const [modalPosition, setModalPosition] = useState({ x: 100, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [activeView, setActiveView] = useState("ISO") // Track active view

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab] = useState("scenes")
  const [showUnavailableModal, setShowUnavailableModal] = useState(false)
  const [clickedFeature, setClickedFeature] = useState("")
  const [wireframe, setWireframe] = useState(false)
  const [axes, setAxes] = useState(false)
  const [smooth, setSmooth] = useState(false)
  const [perspective, setPerspective] = useState(false) // default parallel
  const [viewLocked, setViewLocked] = useState(false)

  const isDeveloper = false
  // const [isDeveloper, setIsDeveloper] = useState(false);

  // Unified file input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Unified file change handler
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0])
    }
  }

  // Open file dialog programmatically
  const openFileDialog = () => {
    // Reset the file input value to allow re-selection of the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    fileInputRef.current?.click()
  }

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files && files[0]) {
      setSelectedFile(files[0])
    }
  }

  // Handle view change
  const handleViewChange = (view: string) => {
    setActiveView(view)
    const event = new CustomEvent("setView", { detail: { view } })
    window.dispatchEvent(event)
  }

  // AYRIM: Reset View (aktif açıya dön) vs Zoom to Fit (modeli sığdır)
  const handleResetView = () => {
    const event = new CustomEvent("setView", { detail: { view: activeView } })
    window.dispatchEvent(event)
  }

  // VTK renderer.resetCamera() mantığını tetikleyecek (yönü koruyarak fit eden) özel event
  const handleCameraFitAll = () => {
    // Current camera orientation preserved; VtkApp listener uses resetCamera which fits bounds.
    window.dispatchEvent(new CustomEvent("zoomToFit"))
  }

  // Tab definitions (Scenes always available; others depend on dev mode)
  const tabs = [
    { id: "scenes", label: t("app_tabs_scenes"), icon: Layers, available: true },
    { id: "lights", label: t("app_tabs_lights"), icon: Lightbulb, available: isDeveloper },
    { id: "camera", label: t("app_tabs_camera"), icon: Camera, available: isDeveloper },
    {
      id: "materials",
      label: t("app_tabs_materials"),
      icon: Palette,
      available: isDeveloper,
    },
    { id: "output", label: t("app_tabs_output"), icon: ImageIcon, available: isDeveloper },
  ]

  const handleTabClick = (tab: any) => {
    if (tab.available) {
      setActiveTab(tab.id)
    } else {
      setClickedFeature(tab.label)
      setShowUnavailableModal(true)
    }
  }

  const renderTabContent = () => {
    const currentTab = tabs.find((tab) => tab.id === activeTab)

    if (!currentTab?.available) {
      return (
        <ScenesTab
          onFileChange={handleFileChange}
          onBrowseClick={openFileDialog}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          isDragOver={isDragOver}
          selectedFile={selectedFile}
          perspective={perspective}
        />
      )
    }

    switch (activeTab) {
      case "scenes":
        return (
          <ScenesTab
            onFileChange={handleFileChange}
            onBrowseClick={openFileDialog}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            isDragOver={isDragOver}
            selectedFile={selectedFile}
            perspective={perspective}
          />
        )
      case "lights":
        return <LightsTab />
      case "camera":
        return <CameraTab />
      case "materials":
        return <MaterialsTab />
      case "output":
        return <OutputTab />
      default:
        return (
          <ScenesTab
            onFileChange={handleFileChange}
            onBrowseClick={openFileDialog}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            isDragOver={isDragOver}
            selectedFile={selectedFile}
            perspective={perspective}
          />
        )
    }
  }

  // Navigation modal drag handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && viewerRef.current && panelRef.current) {
        const parentRect = viewerRef.current.getBoundingClientRect()
        const panelRect = panelRef.current.getBoundingClientRect()
        let newX = e.clientX - dragOffset.x - parentRect.left
        let newY = e.clientY - dragOffset.y - parentRect.top
        // Clamp inside viewer
        newX = Math.max(0, Math.min(newX, parentRect.width - panelRect.width))
        newY = Math.max(0, Math.min(newY, parentRect.height - panelRect.height))
        setModalPosition({ x: newX, y: newY })
      }
    }
    const handleMouseUp = () => setIsDragging(false)
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, dragOffset])

  // Quick view grid layout
  const quickViewGrid = [
  [null, t("app_navigation_top"), null],
  [t("app_navigation_left"), t("app_navigation_front"), t("app_navigation_right")],
  [null, t("app_navigation_bottom"), t("app_navigation_back")],
  ]

  const handleTryVizCad = () => {
    const dragonModelPath = "/dragon.stl";
    fetch(dragonModelPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load the dragon model.");
        }
        return response.blob();
      })
      .then((blob) => {
        const file = new window.File([blob], "dragon.stl", { type: blob.type });
        setSelectedFile(file);
      })
      .catch((error) => {
        console.error("Error loading the dragon model:", error);
      });
  } 

  return (
    <div
      className="relative min-h-[1000px] h-fit bg-gray-100 flex flex-col pt-14 sm:pt-16"
      style={
        {
          // force light palette for this subtree regardless of global .dark
          ["--background"]: "255 255 255",
          ["--foreground"]: "15 23 42",
          ["--card"]: "255 255 255",
          ["--card-foreground"]: "15 23 42",
          ["--muted"]: "248 250 252",
          ["--muted-foreground"]: "100 116 139",
          ["--border"]: "226 232 240",
          ["--input"]: "226 232 240",
          // Explicit visual overrides so child elements (text, svgs) keep light colors
          color: "rgb(15 23 42)",
          backgroundColor: "rgb(255 255 255)",
          borderColor: "rgb(226 232 240)",
          fill: "rgb(15 23 42)",
          stroke: "rgb(15 23 42)",
        } as React.CSSProperties
      }
    >
      {/* Unavailable Feature Modal */}
      {showUnavailableModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="relative bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex flex-col items-center text-center gap-6">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center border"
                style={{
                  backgroundColor: "rgb(var(--primary) / 0.08)",
                  borderColor: "rgb(var(--primary) / 0.16)",
                }}
              >
                <Lock className="w-10 h-10" style={{ color: "rgb(var(--primary))" }} />
              </div>

              <div className="space-y-3">
                <h3 className="text-2xl font-semibold text-gray-900">{t("app_unavailable_title", { feature: clickedFeature })}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {t("app_unavailable_desc", { feature: clickedFeature.toLowerCase() })}
                </p>
              </div>

              <div
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border"
                style={{
                  color: "rgb(var(--primary))",
                  backgroundColor: "rgb(var(--primary) / 0.08)",
                  borderColor: "rgb(var(--primary) / 0.2)",
                }}
              >
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">{t("app_unavailable_coming")}</span>
              </div>

              <div className="flex gap-3 w-full">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => setShowUnavailableModal(false)}
                >
                  {t("app_unavailable_gotIt")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setShowUnavailableModal(false);
                    const email = prompt(t("app_unavailable_prompt"));
                    if (email && email.includes("@")) {
                      const templateParams = {
                        user_email: email,
                        feature: clickedFeature,
                      };

                      emailjs
                        .send("service_7d3dqff", "template_iyg3c0t", templateParams, "2EhLYfAt6PzN8J5Ue")
                        .then(
                          () => {
                            alert(t("app_unavailable_success"));
                          },
                          (error: { text: string }) => {
                            alert(t("app_unavailable_error", { error: error.text }));
                          },
                        );
                    } else if (email !== null) {
                      alert(t("app_unavailable_invalidEmail"))
                    }
                  }}
                  style={{
                    backgroundColor: "rgb(var(--primary))",
                  }}
                >
                  {t("app_unavailable_notifyMe")}
                </Button>
              </div>
            </div>

            <button
              onClick={() => setShowUnavailableModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNavigationModal(true)}
            className="p-2"
            title="Navigation Panel"
          >
            <Navigation className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium text-gray-700">
            {selectedFile ? selectedFile.name : t("app_toolbar_noFile")}
          </div>
          {/* Developer mode toggle hidden in production
          <button
            onClick={() => {
              setIsDeveloper((prev) => {
                const next = !prev;
                if (!next && activeTab !== "scenes") setActiveTab("scenes");
                return next;
              });
            }}
            className={`text-xs px-2 py-1 rounded-full font-medium border transition-colors ${
              isDeveloper
                ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200"
                : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200"
            }`}
            title="Developer mode toggle"
          >
            {isDeveloper ? "Developer ON" : "Developer OFF"}
          </button>
          */}
        </div>

        <div className="flex items-center gap-2">
          {/* File Operations */}
          <Button
            variant="ghost"
            size="sm"
            className="bg-primary text-white font-medium px-6 py-3 rounded-lg shadow-md hover:bg-primary/90 transition-all duration-200"
            onClick={() => {
              const dragonModelPath = "/public/Dragon 2.5.stl"
              fetch(dragonModelPath)
                .then((response) => response.blob())
                .then((blob) => {
                  const file = new window.File([blob], "Dragon 2.5.stl", { type: "application/octet-stream" })
                  setSelectedFile(file)
                })
                .catch((error) => {
                  console.error("Error loading dragon model:", error)
                })
            }}
          >
            {t("app_toolbar_tryVizCad")}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Render Studio */}
        <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 relative`}>
          {/* Sidebar kapalıyken sol kenarda ince toggle */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-full shadow hover:bg-gray-50 hover:text-gray-900 transition-colors"
              title={t("app_sidebar_open")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          
          {sidebarOpen && (
            <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm">
              {/* Tab Navigation */}
              <div className="border-b border-gray-200">
                <div className="flex">
                  {tabs.map((tab) => {
                    const Icon = tab.icon
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabClick(tab)}
                        className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 text-xs font-medium transition-all duration-200 relative group ${
                          !tab.available
                            ? "text-gray-400 cursor-pointer opacity-60 hover:opacity-80"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                        }`}
                        style={
                          activeTab === tab.id && tab.available
                            ? {
                                color: "rgb(var(--primary))",
                                backgroundColor: "rgb(var(--primary) / 0.08)",
                                borderBottom: "2px solid",
                                borderBottomColor: "rgb(var(--primary) / 0.3)",
                              }
                            : undefined
                        }
                      >
                        <div className="relative">
                          <Icon className={`h-4 w-4 ${!tab.available ? "opacity-50" : ""}`} />
                          {!tab.available && (
                            <div
                              className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: "rgb(var(--primary))" }}
                            >
                              <Lock className="w-2 h-2 text-white" />
                            </div>
                          )}
                        </div>
                        <span className={!tab.available ? "opacity-50" : ""}>{tab.label}</span>

                        {/* Tooltip for unavailable tabs */}
                        {!tab.available && (
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                            <div className="text-center">
                              <div className="font-medium">{tab.label} Module</div>
                              <div className="text-gray-300 mt-1">Coming in Q2 2025</div>
                            </div>
                            <div
                              className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                              style={{ borderTopColor: "rgb(var(--border))" }}
                            ></div>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto transition-all duration-300">
                {renderTabContent()}
              </div>
            </div>
          )}
          
          {/* Toggle Button - Sidebar container'ının içinde (sadece sidebar açıkken göster) */}
          {sidebarOpen && (
            <Button
              onClick={() => setSidebarOpen(false)}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 bg-white border border-gray-200 rounded-full shadow p-1 flex items-center justify-center hover:bg-gray-50 hover:text-gray-900 transition-colors z-50"
              style={{ width: 28, height: 28 }}
              title={t("app_sidebar_close")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  d="M15 19l-7-7 7-7" 
                />
              </svg>
            </Button>
          )}
        </div>

        <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
          {selectedFile ? (
            <div className="flex-1 p-4 min-h-0">
              <div
                ref={viewerRef}
                className="w-full h-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden relative min-h-[500px]"
              >
                {/* Floating Navigation Panel inside viewer */}
                {showNavigationModal && (
                  <div
                    ref={panelRef}
                    className="absolute z-20 w-[360px] max-w-[90%] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden select-none"
                    style={{ left: modalPosition.x, top: modalPosition.y }}
                  >
                    {/* Header (draggable) */}
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-900/5 to-gray-900/10 border-b cursor-grab active:cursor-grabbing"
                      onMouseDown={(e) => {
                        if (panelRef.current) {
                          const rect = panelRef.current.getBoundingClientRect()
                          setIsDragging(true)
                          setDragOffset({
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top,
                          })
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center shadow"
                          style={{
                            backgroundColor: "rgb(var(--primary))",
                          }}
                        >
                          <Navigation className="w-4 h-4" style={{ color: "rgb(var(--primary-foreground))" }} />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-800">{t("app_navigation_title")}</h3>
                      </div>
                      <button
                        onClick={() => setShowNavigationModal(false)}
                        className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1 transition"
                      >
                        <X className="w-4 h-4" style={{ color: "rgb(107,114,128)" }} />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-6">
                      {/* Quick Views */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <Target className="w-4 h-4" style={{ color: "rgb(var(--primary))" }} />
                          {t("app_navigation_quickViews")}
                        </h4>
                        <div className="grid grid-cols-3 gap-2 max-w-[180px]">
                          {quickViewGrid.map((row, rowIndex) =>
                            row.map((view, colIndex) => {
                              if (!view) {
                                return (
                                  <div key={`${rowIndex}-${colIndex}`} className="w-12 h-10">
                                    {rowIndex === 0 && colIndex === 2 && (
                                      <button
                                        className={`w-12 h-10 text-xs font-medium rounded-md transition`}
                                        style={
                                          activeView === "ISO"
                                            ? {
                                                backgroundColor: "rgb(var(--primary))",
                                                color: "rgb(var(--primary-foreground))",
                                                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                              }
                                            : undefined
                                        }
                                        onClick={() => handleViewChange("ISO")}
                                      >
                                        ISO
                                      </button>
                                    )}
                                  </div>
                                )
                              }
                              return (
                                <button
                                  key={`${rowIndex}-${colIndex}`}
                                  className={`w-12 h-10 text-xs font-medium rounded-md transition`}
                                  style={
                                    activeView === view
                                      ? {
                                          backgroundColor: "rgb(var(--primary))",
                                          color: "rgb(var(--primary-foreground))",
                                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                        }
                                      : undefined
                                  }
                                  onClick={() => handleViewChange(view)}
                                >
                                  {t(`app_navigation_${view.toLowerCase()}`)}
                                </button>
                              )
                            }),
                          )}
                        </div>
                      </div>

                      {/* Display Options */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <Eye className="w-4 h-4" style={{ color: "rgb(var(--primary))" }} />
                          {t("app_navigation_display")}
                        </h4>
                        <div className="space-y-2">
                          {(["Wireframe", "Axes", "Smooth Shading", "Perspective"] as const).map((label) => {
                            const checked =
                              label === "Wireframe"
                                ? wireframe
                                : label === "Axes"
                                  ? axes
                                  : label === "Smooth Shading"
                                    ? smooth
                                    : perspective
                            return (
                              <div key={label} className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">{t(`app_navigation_${label.replace(/\s/g, "").toLowerCase()}`)}</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={checked}
                                    onChange={(e) => {
                                      const enabled = e.target.checked
                                      if (label === "Wireframe") {
                                        setWireframe(enabled)
                                        window.dispatchEvent(
                                          new CustomEvent("toggleWireframe", {
                                            detail: { enabled },
                                          }),
                                        )
                                      } else if (label === "Axes") {
                                        setAxes(enabled)
                                        window.dispatchEvent(
                                          new CustomEvent("toggleAxes", {
                                            detail: { enabled },
                                          }),
                                        )
                                      } else if (label === "Smooth Shading") {
                                        setSmooth(enabled)
                                        window.dispatchEvent(
                                          new CustomEvent("toggleSmoothShading", { detail: { enabled } }),
                                        )
                                      } else if (label === "Perspective") {
                                        setPerspective(enabled)
                                        window.dispatchEvent(
                                          new CustomEvent("toggleProjection", { detail: { perspective: enabled } }),
                                        )
                                      }
                                    }}
                                  />
                                  <div
                                    className="w-8 h-4 rounded-full relative"
                                    style={{ backgroundColor: checked ? "rgb(var(--primary))" : "rgb(229 231 235)" }}
                                  >
                                    <div
                                      className="absolute top-0 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                      style={{ transform: checked ? "translateX(100%)" : "translateX(0)" }}
                                    />
                                  </div>
                                </label>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Navigation Actions */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <RotateCcw className="w-4 h-4" style={{ color: "rgb(var(--primary))" }} />
                          {t("app_navigation_title")}
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-xs rounded-md flex items-center justify-center gap-1"
                            onClick={handleResetView}
                          >
                            <RotateCcw className="w-3 h-3" />
                            {t("app_navigation_reset")}
                          </button>
                          <button
                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-xs rounded-md flex items-center justify-center gap-1"
                            onClick={handleCameraFitAll}
                          >
                            <Maximize className="w-3 h-3" />
                            {t("app_navigation_fitAll")}
                          </button>
                        </div>
                      </div>

                      {/* Tools */}
                    </div>
                  </div>
                )}
                {/* Controls bar (navigation button still opens/closes) */}
                <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md rounded-full px-4 py-2 shadow-xl border border-gray-200 text-black">
                    {/* Navigation Button */}
                    <button
                      onClick={() => setShowNavigationModal(true)}
                      className="p-2 text-black/70 hover:text-black hover:bg-gray-100 rounded-full transition-all duration-200"
                      title="Navigation Panel"
                    >
                      <Navigation className="h-4 w-4" />
                    </button>

                    <div className="w-px h-6 bg-white/20 mx-1"></div>

                    {/* View Presets */}
                    <div className="flex items-center gap-1">
                      {(["Front", "Back", "Left", "Right", "Top", "Bottom", "ISO"]).map((view) => (
                        <button
                          key={view}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                            activeView === view
                              ? "text-white shadow-lg"
                              : "text-black/60 hover:text-black hover:bg-gray-100"
                          }`}
                          style={activeView === view ? { backgroundColor: "rgb(var(--primary))" } : undefined}
                          onClick={() => handleViewChange(view)}
                        >
                          {t(`app_navigation_${view.toLowerCase()}`)}
                        </button>
                      ))}
                    </div>

                    {/* View Lock */}
                    <div className="flex items-center gap-1">
                      <button
                        className={`p-2 rounded-full transition-all duration-200 ${
                          viewLocked ? "bg-red-500 text-white" : "text-black/70 hover:text-black hover:bg-gray-100"
                        }`}
                        title={viewLocked ? t("app_navigation_unlockView") : t("app_navigation_lockView")}
                        onClick={() => {
                          const next = !viewLocked
                          setViewLocked(next)
                          window.dispatchEvent(
                            new CustomEvent("toggleViewLock", {
                              detail: { enabled: next },
                            }),
                          )
                        }}
                      >
                        <Lock className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="w-px h-6 bg-white/20 mx-1"></div>

                    {/* View Tools */}
                    <div className="flex items-center gap-1">
                      <button
                        className={`p-2 rounded-full transition-all duration-200 ${
                          wireframe ? "text-white" : "text-black/70 hover:text-black hover:bg-gray-100"
                        }`}
                        style={wireframe ? { backgroundColor: "rgb(var(--primary))" } : undefined}
                        title={t("app_navigation_toggleWireframe")}
                        onClick={() => {
                          const next = !wireframe
                          setWireframe(next)
                          window.dispatchEvent(
                            new CustomEvent("toggleWireframe", {
                              detail: { enabled: next },
                            }),
                          )
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        className={`p-2 rounded-full transition-all duration-200 ${
                          axes ? "text-white" : "text-black/70 hover:text-black hover:bg-gray-100"
                        }`}
                        style={axes ? { backgroundColor: "rgb(var(--primary))" } : undefined}
                        title={t("app_navigation_toggleAxes")}
                        onClick={() => {
                          const next = !axes
                          setAxes(next)
                          window.dispatchEvent(
                            new CustomEvent("toggleAxes", {
                              detail: { enabled: next },
                            }),
                          )
                        }}
                      >
                        <Move3d className="h-4 w-4" />
                      </button>
                      <button
                        className={`p-2 rounded-full transition-all duration-200 ${
                          smooth ? "text-white" : "text-black/70 hover:text-black hover:bg-gray-100"
                        }`}
                        style={smooth ? { backgroundColor: "rgb(var(--primary))" } : undefined}
                        title={t("app_navigation_smoothFlat")}
                        onClick={() => {
                          const next = !smooth
                          setSmooth(next)
                          window.dispatchEvent(
                            new CustomEvent("toggleSmoothShading", {
                              detail: { enabled: next },
                            }),
                          )
                        }}
                      >
                        <Sun className="h-4 w-4" />
                      </button>
                      <button
                        className={`p-2 rounded-full transition-all duration-200 ${
                          perspective ? "text-white" : "text-black/70 hover:text-black hover:bg-gray-100"
                        }`}
                        style={perspective ? { backgroundColor: "rgb(var(--primary))" } : undefined}
                        title={perspective ? t("app_navigation_switchToParallel") : t("app_navigation_switchToPerspective")}
                        onClick={() => {
                          const next = !perspective
                          setPerspective(next)
                          window.dispatchEvent(
                            new CustomEvent("toggleProjection", {
                              detail: { perspective: next },
                            }),
                          )
                        }}
                      >
                        <Box className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="w-px h-6 bg-white/20 mx-1"></div>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1">
                      <button
                        className="p-2 text-black/70 hover:text-black hover:bg-gray-100 rounded-full transition-all duration-200"
                        title={t("app_navigation_zoomIn")}
                        onClick={() => {
                          const event = new CustomEvent("zoomIn")
                          window.dispatchEvent(event)
                        }}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      <button
                        className="p-2 text-black/70 hover:text-black hover:bg-gray-100 rounded-full transition-all duration-200"
                        title={t("app_navigation_zoomOut")}
                        onClick={() => {
                          const event = new CustomEvent("zoomOut")
                          window.dispatchEvent(event)
                        }}
                      >
                        <ZoomOut className="h-4 w-4" />
                      </button>
                      <button
                        className="p-2 text-black/70 hover:text-black hover:bg-gray-100 rounded-full transition-all duration-200"
                        title={t("app_navigation_zoomToFit")}
                        onClick={handleCameraFitAll}
                      >
                        <Maximize className="h-4 w-4" />
                      </button>
                      <button
                        className="p-2 text-black/70 hover:text-black hover:bg-gray-100 rounded-full transition-all duration-200"
                        title={t("app_navigation_resetView")}
                        onClick={handleResetView}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <VtkApp file={selectedFile} displayState={{ wireframe, grid: false, axes, smooth }} />
                {selectedFile && (
                  <button
                    onClick={() => captureImage?.({ scale: 2, format: "png" })}
                        title={t("app_navigation_captureScreenshot")}
                    className="absolute top-6 right-6 z-10 p-3 rounded-full bg-white shadow-lg border border-gray-200 text-black/70 hover:text-black hover:shadow-xl hover:border-gray-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md mx-auto p-8">
                <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Upload className="h-12 w-12 text-gray-400" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("app_welcome_title")}</h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {t("app_welcome_desc")}
                </p>
                <div className="space-y-3">
                  <Button
                    className="px-6 py-3"
                    onClick={openFileDialog}
                    style={{
                      backgroundColor: "rgb(var(--primary))",
                      color: "white",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgb(var(--primary-hover))"
                      e.currentTarget.style.color = "white"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "rgb(var(--primary))"
                      e.currentTarget.style.color = "white"
                    }}
                  >
                    <Upload className="h-4 w-4 mr-2" style={{ color: "white" }} />
                    {t("app_welcome_upload")}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".stl,.obj,.ply,.3mf"
                    onChange={handleFileChange}
                  />
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{t("app_welcome_supportedFormats")}</span>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">{t("app_welcome_stl")}</span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">{t("app_welcome_obj")}</span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">{t("app_welcome_ply")}</span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">{t("app_welcome_mf")}</span>
                    </div>
                  </div>  
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-sm text-gray-600 h-10 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-gray-600">{t("app_status_ready")}</span>
          {selectedFile && (
            <>
              <span>•</span>
              <span>{t("app_status_model")}: {selectedFile.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>{t("app_status_resolution")}: 1920x1080</span>
          <span>•</span>
          <span>{t("app_status_quality")}: {t("app_status_qualityHigh")}</span>
          <Button variant="ghost" size="sm" className="p-1">
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
