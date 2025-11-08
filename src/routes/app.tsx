"use client";

import React, { useState, useEffect, useRef } from "react";
import emailjs from "@emailjs/browser";

import { VtkApp } from "@/components/VtkApp.client";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ScenesTab } from "@/components/tabs/sceneTabs";
import { LightsTab } from "@/components/tabs/LightsTab";
import { AppearanceTab } from "@/components/tabs/AppearanceTab";
import { OutputTab } from "@/components/tabs/OutputTab";
import { CameraTab } from "@/components/tabs/CameraTab";
import { detectLanguage, seoContent } from "@/utils/language";

// API Configuration
const API_BASE_URL = "http://localhost:8787/api";

export const Route = createFileRoute("/app")({
  validateSearch: (search: Record<string, unknown>) =>
    ({
      model: typeof search.model === "string" ? search.model : undefined,
      name: typeof search.name === "string" ? search.name : undefined,
      author: typeof search.author === "string" ? search.author : undefined,
      modelId: typeof search.modelId === "string" ? search.modelId : undefined,
    } as { model?: string; name?: string; author?: string; modelId?: string }),
  head: () => {
    const lang = detectLanguage();
    const content = seoContent[lang].app;

    return {
      title: content.title,
      meta: [
        {
          name: "description",
          content: content.description,
        },
        {
          name: "keywords",
          content: content.keywords,
        },
        {
          property: "og:title",
          content: content.ogTitle,
        },
        {
          property: "og:description",
          content: content.ogDescription,
        },
        {
          property: "og:url",
          content: "https://vizcad.com/app",
        },
        {
          property: "og:image",
          content: `https://vizcad.com/og-app-${lang}.png`,
        },
        {
          name: "twitter:title",
          content: content.twitterTitle,
        },
        {
          name: "twitter:description",
          content: content.twitterDescription,
        },
        {
          name: "twitter:image",
          content: `https://vizcad.com/twitter-app-${lang}.png`,
        },
        {
          name: "robots",
          content: "noindex, nofollow",
        },
      ],
      links: [
        {
          rel: "canonical",
          href: "https://vizcad.com/app",
        },
      ],
    };
  },
  component: AppPage,
});

function AppPage() {
  const { t } = useTranslation();
  const { model, name, author, modelId } = Route.useSearch();
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeView, setActiveView] = useState("ISO"); // Track active view

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("scenes");
  const [showUnavailableModal, setShowUnavailableModal] = useState(false);
  const [clickedFeature, setClickedFeature] = useState("");
  const [wireframe, setWireframe] = useState(false);
  const [axes, setAxes] = useState(false);
  const [smooth, setSmooth] = useState(false);
  const [perspective, setPerspective] = useState(false); // default parallel
  const [viewLocked, setViewLocked] = useState(false);

  // Camera controls ref
  const cameraControlsRef = useRef<{
    resetCamera: () => void
    zoomIn: () => void
    zoomOut: () => void
    setView: (view: string) => void
    applyStudioScene: (sceneId: string) => void
    setBackground: (color: [number, number, number]) => void
  } | null>(null)

  const isDeveloper = false;
  // const [isDeveloper, setIsDeveloper] = useState(false);

  // Unified file input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const welcomeRef = useRef<HTMLDivElement>(null);

  // Unified file change handler
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  // Load model from URL parameter
  useEffect(() => {
    if (model) {
      console.log("Loading model from URL parameter:", model);
      console.log(
        "Additional params - name:",
        name,
        "author:",
        author,
        "modelId:",
        modelId
      );

      // Fetch the model from the URL and create a File object
      const loadModelFromUrl = async () => {
        try {
          // For development: map store URLs to demo files
          let modelUrl = model;
          let tryAlternativeEndpoint = false;

          if (model.startsWith("/uploads/")) {
            // For store models, use demo files instead of API
            console.log("Store model detected, using demo file fallback");
            modelUrl = "/dragon.stl"; // Use demo dragon file
            console.log("Using demo file:", modelUrl);
          } else if (model.startsWith("http://localhost:3000/uploads/")) {
            // Convert frontend uploads path to demo file
            console.log(
              "Frontend uploads path detected, using demo file fallback"
            );
            modelUrl = "/dragon.stl";
            console.log("Using demo file:", modelUrl);
          } else {
            // For direct URLs, try API endpoints
            if (model.startsWith("/uploads/")) {
              const fileName = model.replace("/uploads/", "");
              modelUrl = `${API_BASE_URL}/files/${fileName}`;
              console.log(
                "Converting uploads path to API file endpoint:",
                modelUrl
              );
              tryAlternativeEndpoint = true;
            }
          }

          let response = await fetch(modelUrl);

          // If API endpoints fail, try fallback to demo files
          if (!response.ok && tryAlternativeEndpoint) {
            console.log("API endpoints failed, using demo file fallback");
            modelUrl = "/dragon.stl";
            response = await fetch(modelUrl);
          }

          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}: ${response.statusText} - Could not load model file`
            );
          }
          const blob = await response.blob();

          // Check if blob is valid and has content
          if (!blob || blob.size === 0) {
            throw new Error("Model file is empty or could not be downloaded");
          }

          console.log("Model blob size:", blob.size, "bytes");
          console.log("Model blob type:", blob.type);

          // Check if we actually got an STL file or an HTML error page
          if (blob.type.includes("html") || blob.type.includes("text/html")) {
            throw new Error(
              "Server returned HTML instead of STL file. File may not exist or path is incorrect."
            );
          }

          // Try to read first few bytes to validate content
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          console.log(
            "First 20 bytes:",
            Array.from(uint8Array.slice(0, 20))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(" ")
          );

          // Check for STL signatures
          const textDecoder = new TextDecoder();
          const firstBytes = textDecoder.decode(uint8Array.slice(0, 80));
          console.log("First 80 bytes as text:", firstBytes);

          // Check if content looks like HTML (common error case)
          if (
            firstBytes.toLowerCase().includes("<!doctype") ||
            firstBytes.toLowerCase().includes("<html") ||
            firstBytes.toLowerCase().includes("<head")
          ) {
            throw new Error(
              "Server returned HTML error page instead of STL file. Check if the file URL is correct."
            );
          }

          // Binary STL starts with 80-byte header, then 4-byte triangle count
          let isValidBinarySTL = false;
          if (uint8Array.length >= 84) {
            const triangleCount = new DataView(arrayBuffer, 80, 4).getUint32(
              0,
              true
            ); // little endian
            console.log(
              "Binary STL triangle count (if binary):",
              triangleCount
            );

            // Expected file size for binary STL: 80 (header) + 4 (count) + 50*triangles
            const expectedSize = 84 + 50 * triangleCount;
            console.log(
              "Expected binary STL size:",
              expectedSize,
              "Actual size:",
              arrayBuffer.byteLength
            );

            // Validate if this could be a valid binary STL
            if (
              triangleCount > 0 &&
              triangleCount < 10000000 && // Reasonable triangle count
              Math.abs(expectedSize - arrayBuffer.byteLength) < 100
            ) {
              // Allow small variance
              isValidBinarySTL = true;
            }
          }

          // ASCII STL starts with "solid" keyword
          const isValidASCIISTL =
            firstBytes.toLowerCase().startsWith("solid") &&
            firstBytes.toLowerCase().includes("facet");

          if (isValidBinarySTL) {
            console.log("Detected valid binary STL format");
          } else if (isValidASCIISTL) {
            console.log("Detected valid ASCII STL format");
          } else {
            console.log("WARNING: File may not be a valid STL format");
            // Don't throw error here, let VTK try to parse it
          }

          // Create blob again from arrayBuffer to ensure it's properly formed
          const validatedBlob = new Blob([arrayBuffer], {
            type: "application/octet-stream",
          });

          // Extract filename from URL or use provided name - clean up URL first
          let fileName = name;
          if (!fileName) {
            // Clean the URL by removing query parameters and fragments
            const cleanUrl = model.split("?")[0].split("#")[0];
            fileName = cleanUrl.split("/").pop() || "model.stl";
          }

          // If still no extension or weird filename, try to detect from content-type or default to STL
          let fileExtension = fileName.split(".").pop()?.toLowerCase();

          // If no valid extension found, try to determine from blob type or default to stl
          if (
            !fileExtension ||
            fileExtension === fileName.toLowerCase() ||
            fileExtension.length > 5
          ) {
            console.log(
              "Invalid or no extension found, checking blob type:",
              blob.type
            );
            if (blob.type.includes("stl") || blob.type.includes("model")) {
              fileExtension = "stl";
              fileName = fileName.includes(".") ? fileName : `${fileName}.stl`;
            } else {
              // For store models, default to STL (most common 3D format)
              console.log("Defaulting to STL format for store model");
              fileExtension = "stl";
              const baseName = fileName.split(".")[0] || "model";
              fileName = `${baseName}.stl`;
            }
          }

          console.log("Final filename:", fileName);
          console.log("Detected extension:", fileExtension);

          // Validate file extension with more lenient check for store models
          const validExtensions = ["stl", "ply", "obj"];
          if (!fileExtension || !validExtensions.includes(fileExtension)) {
            // Last resort: if this is a store model and we can't determine extension, assume STL
            if (model.includes("/uploads/") || model.includes("store")) {
              console.log("Store model detected, forcing STL format");
              fileExtension = "stl";
              fileName = `${fileName.split(".")[0] || "model"}.stl`;
            } else {
              throw new Error(
                `Unsupported file format: ${fileExtension}. Only STL, PLY, and OBJ files are supported.`
              );
            }
          }

          // Create a File object from the validatedBlob
          const file = new window.File([validatedBlob], fileName, {
            type: "application/octet-stream",
          }) as File;

          console.log("Model loaded successfully:", fileName);
          if (author) {
            console.log("Model author:", author);
          }
          setSelectedFile(file);

          // Show success message in console
          const successMessage = name
            ? `✅ Store model "${name}" ${
                author ? `by ${author}` : ""
              } loaded successfully!`
            : `✅ Model loaded successfully from store!`;

          console.log(successMessage);
        } catch (error) {
          console.error("Error loading model from URL:", error);

          let errorMessage = "Failed to load model";
          if (error instanceof Error) {
            if (error.message.includes("CORS")) {
              errorMessage =
                "CORS error: Model file cannot be accessed from this domain";
            } else if (
              error.message.includes("404") ||
              error.message.includes("Not Found")
            ) {
              errorMessage = "Model file not found on server";
            } else if (
              error.message.includes("403") ||
              error.message.includes("Forbidden")
            ) {
              errorMessage = "Access denied to model file";
            } else if (error.message.includes("empty")) {
              errorMessage = "Model file is empty or corrupted";
            } else {
              errorMessage = `Failed to load model: ${error.message}`;
            }
          }

          alert(errorMessage);
        }
      };

      loadModelFromUrl();
    }
  }, [model, name, author, modelId]);

  // Open file dialog programmatically
  const openFileDialog = () => {
    // Reset the file input value to allow re-selection of the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      setTimeout(() => fileInputRef.current?.click(), 0);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      setSelectedFile(files[0]);
    }
  };

  // Handle view change
  const handleViewChange = (view: string) => {
    const capitalizedView =
      view.charAt(0).toUpperCase() + view.slice(1).toLowerCase();
    setActiveView(capitalizedView);
    cameraControlsRef.current?.setView(view);
  };

  // AYRIM: Reset View (aktif açıya dön) vs Zoom to Fit (modeli sığdır)
  const handleResetView = () => {
    cameraControlsRef.current?.setView(activeView.toLowerCase());
  };

  // VTK renderer.resetCamera() mantığını tetikleyecek (yönü koruyarak fit eden) özel event
  const handleCameraFitAll = () => {
    cameraControlsRef.current?.resetCamera();
  };

  // Tab definitions (Scenes always available; others depend on dev mode)
  const tabs = [
    {
      id: "scenes",
      label: t("app_tabs_scenes"),
      icon: Layers,
      available: true,
    },
    {
      id: "appearance",
      label: t("app_tabs_appearance"),
      icon: Palette,
      available: isDeveloper,
    },
    {
      id: "lights",
      label: t("app_tabs_lights"),
      icon: Lightbulb,
      available: isDeveloper,
    },
    {
      id: "output",
      label: t("app_tabs_output"),
      icon: ImageIcon,
      available: isDeveloper,
    },
  ];

  const handleTabClick = (tab: any) => {
    if (tab.available) {
      setActiveTab(tab.id);
    } else {
      setClickedFeature(tab.label);
      setShowUnavailableModal(true);
    }
  };

  const renderTabContent = () => {
    const currentTab = tabs.find((tab) => tab.id === activeTab);

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
          onApplyStudioScene={(sceneId) => {
            cameraControlsRef.current?.applyStudioScene?.(sceneId);
          }}
          onSetBackground={(color) => {
            cameraControlsRef.current?.setBackground?.(color);
          }}
        />
      );
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
            onApplyStudioScene={(sceneId) => {
              cameraControlsRef.current?.applyStudioScene?.(sceneId);
            }}
            onSetBackground={(color) => {
              cameraControlsRef.current?.setBackground?.(color);
            }}
          />
        );
      case "lights":
        return <LightsTab />;
      case "camera":
        return <CameraTab />;
      case "appearance":
        return <AppearanceTab />;
      case "output":
        return <OutputTab />;
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
        );
    }
  };

  // Navigation modal drag handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && viewerRef.current && panelRef.current) {
        const parentRect = viewerRef.current.getBoundingClientRect();
        const panelRect = panelRef.current.getBoundingClientRect();
        let newX = e.clientX - dragOffset.x - parentRect.left;
        let newY = e.clientY - dragOffset.y - parentRect.top;
        // Clamp inside viewer
        newX = Math.max(0, Math.min(newX, parentRect.width - panelRect.width));
        newY = Math.max(
          0,
          Math.min(newY, parentRect.height - panelRect.height)
        );
        setModalPosition({ x: newX, y: newY });
      }
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Close sidebar on small (phone) screens by default and keep it responsive across rotation
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkIsPhone = () => {
      // Use the smaller viewport dimension so rotation (portrait/landscape) is handled
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      const isPhone = minDim <= 640;
      setSidebarOpen(!isPhone);
    };

    // Run once on mount to set initial state
    checkIsPhone();

    window.addEventListener("resize", checkIsPhone);
    window.addEventListener("orientationchange", checkIsPhone);

    return () => {
      window.removeEventListener("resize", checkIsPhone);
      window.removeEventListener("orientationchange", checkIsPhone);
    };
  }, []);

  // When on phone and menus (sidebar) are closed, center the scene or welcome text
  useEffect(() => {
    if (typeof window === "undefined") return;
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    const isPhone = minDim <= 640;
    if (!isPhone || sidebarOpen) return;

    if (selectedFile) {
      // Center the VTK scene camera for mobile with menus closed
      cameraControlsRef.current?.resetCamera();
    } else {
      // No file -> welcome text. Scroll the welcome container so text is centered in viewport.
      try {
        if (welcomeRef.current) {
          welcomeRef.current.scrollIntoView({
            block: "center",
            inline: "center",
            behavior: "smooth",
          });
        } else {
          pageRef.current?.scrollIntoView({
            block: "center",
            inline: "center",
            behavior: "auto",
          });
        }
      } catch (e) {
        window.scrollTo({ top: 0 });
      }
    }
  }, [sidebarOpen, selectedFile]);

  // Quick view grid layout
  const quickViewGrid = [
    [null, "top", null],
    ["left", "front", "right"],
    [null, "bottom", "back"],
  ];

  const handleTryVizCad = () => {
    const dragonModelPath = "/dragon.stl"; // Boşluksuz dosya adı
    console.log("Trying to load dragon model from:", dragonModelPath);

    fetch(dragonModelPath)
      .then((response) => {
        console.log("Fetch response:", response);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        console.log("Blob received:", blob);
        const file = new window.File([blob], "dragon.stl", {
          type: blob.type || "application/octet-stream",
        });
        console.log("File created:", file);
        setSelectedFile(file);
        console.log("File set as selected file");
      })
      .catch((error) => {
        console.error("Error loading the dragon model:", error);
        alert(`Failed to load dragon model: ${error.message}`);
      });
  };

  return (
    <div
      ref={pageRef}
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
                <Lock
                  className="w-10 h-10"
                  style={{ color: "rgb(var(--primary))" }}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-2xl font-semibold text-gray-900">
                  {t("app_unavailable_title", { feature: clickedFeature })}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {t("app_unavailable_desc", {
                    feature: clickedFeature.toLowerCase(),
                  })}
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
                <span className="text-sm font-medium">
                  {t("app_unavailable_coming")}
                </span>
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
                        .send(
                          "service_7d3dqff",
                          "template_iyg3c0t",
                          templateParams,
                          "2EhLYfAt6PzN8J5Ue"
                        )
                        .then(
                          () => {
                            alert(t("app_unavailable_success"));
                          },
                          (error: { text: string }) => {
                            alert(
                              t("app_unavailable_error", { error: error.text })
                            );
                          }
                        );
                    } else if (email !== null) {
                      alert(t("app_unavailable_invalidEmail"));
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
              const dragonModelPath = "/dragon.stl";
              fetch(dragonModelPath)
                .then((response) => response.blob())
                .then((blob) => {
                  const file = new window.File([blob], "dragon.stl", {
                    type: "application/octet-stream",
                  });
                  setSelectedFile(file);
                })
                .catch((error) => {
                  console.error("Error loading dragon model:", error);
                });
            }}
          >
            {t("app_toolbar_tryVizCad")}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Render Studio */}
        <div
          className={`${
            sidebarOpen ? "w-80" : "w-0"
          } transition-all duration-300 relative`}
        >
          {/* Sidebar kapalıyken sol kenarda ince toggle */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-full shadow hover:bg-gray-50 hover:text-gray-900 transition-colors"
              title={t("app_sidebar_open")}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          )}

          {sidebarOpen && (
            <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm">
              {/* Tab Navigation */}
              <div className="border-b border-gray-200">
                <div className="flex">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
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
                          <Icon
                            className={`h-4 w-4 ${
                              !tab.available ? "opacity-50" : ""
                            }`}
                          />
                          {!tab.available && (
                            <div
                              className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: "rgb(var(--primary))" }}
                            >
                              <Lock className="w-2 h-2 text-white" />
                            </div>
                          )}
                        </div>
                        <span className={!tab.available ? "opacity-50" : ""}>
                          {tab.label}
                        </span>

                        {/* Tooltip for unavailable tabs */}
                        {!tab.available && (
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                            <div className="text-center">
                              <div className="font-medium">
                                {tab.label} Module
                              </div>
                              <div className="text-gray-300 mt-1">
                                Coming in Q2 2025
                              </div>
                            </div>
                            <div
                              className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                              style={{ borderTopColor: "rgb(var(--border))" }}
                            ></div>
                          </div>
                        )}
                      </button>
                    );
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
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
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
                          const rect = panelRef.current.getBoundingClientRect();
                          setIsDragging(true);
                          setDragOffset({
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top,
                          });
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
                          <Navigation
                            className="w-4 h-4"
                            style={{ color: "rgb(var(--primary-foreground))" }}
                          />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-800">
                          {t("app_navigation_title")}
                        </h3>
                      </div>
                      <button
                        onClick={() => setShowNavigationModal(false)}
                        className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1 transition"
                      >
                        <X
                          className="w-4 h-4"
                          style={{ color: "rgb(107,114,128)" }}
                        />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-6">
                      {/* Quick Views */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <Target
                            className="w-4 h-4"
                            style={{ color: "rgb(var(--primary))" }}
                          />
                          {t("app_navigation_quickViews")}
                        </h4>
                        <div className="grid grid-cols-3 gap-2 max-w-[180px]">
                          {quickViewGrid.map((row, rowIndex) =>
                            row.map((view, colIndex) => {
                              if (!view) {
                                return (
                                  <div
                                    key={`${rowIndex}-${colIndex}`}
                                    className="w-12 h-10"
                                  >
                                    {rowIndex === 0 && colIndex === 2 && (
                                      <button
                                        className={`w-12 h-10 text-xs font-medium rounded-md transition`}
                                        style={
                                          activeView === "Iso"
                                            ? {
                                                backgroundColor:
                                                  "rgb(var(--primary))",
                                                color:
                                                  "rgb(var(--primary-foreground))",
                                                boxShadow:
                                                  "0 1px 2px rgba(0,0,0,0.05)",
                                              }
                                            : undefined
                                        }
                                        onClick={() => handleViewChange("iso")}
                                      >
                                        ISO
                                      </button>
                                    )}
                                  </div>
                                );
                              }
                              return (
                                <button
                                  key={`${rowIndex}-${colIndex}`}
                                  className={`w-12 h-10 text-xs font-medium rounded-md transition`}
                                  style={
                                    activeView === view
                                      ? {
                                          backgroundColor:
                                            "rgb(var(--primary))",
                                          color:
                                            "rgb(var(--primary-foreground))",
                                          boxShadow:
                                            "0 1px 2px rgba(0,0,0,0.05)",
                                        }
                                      : undefined
                                  }
                                  onClick={() => handleViewChange(view)}
                                >
                                  {t(`app_navigation_${view.toLowerCase()}`)}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Display Options */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <Eye
                            className="w-4 h-4"
                            style={{ color: "rgb(var(--primary))" }}
                          />
                          {t("app_navigation_display")}
                        </h4>
                        <div className="space-y-2">
                          {(
                            [
                              "Wireframe",
                              "Axes",
                              "Smooth Shading",
                              "Perspective",
                            ] as const
                          ).map((label) => {
                            const checked =
                              label === "Wireframe"
                                ? wireframe
                                : label === "Axes"
                                ? axes
                                : label === "Smooth Shading"
                                ? smooth
                                : perspective;
                            return (
                              <div
                                key={label}
                                className="flex items-center justify-between"
                              >
                                <span className="text-xs text-gray-600">
                                  {t(
                                    `app_navigation_${label
                                      .replace(/\s/g, "")
                                      .toLowerCase()}`
                                  )}
                                </span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={checked}
                                    onChange={(e) => {
                                      const enabled = e.target.checked;
                                      if (label === "Wireframe") {
                                        setWireframe(enabled);
                                      } else if (label === "Axes") {
                                        setAxes(enabled);
                                      } else if (label === "Smooth Shading") {
                                        setSmooth(enabled);
                                      } else if (label === "Perspective") {
                                        setPerspective(enabled);
                                      }
                                    }}
                                  />
                                  <div
                                    className="w-8 h-4 rounded-full relative"
                                    style={{
                                      backgroundColor: checked
                                        ? "rgb(var(--primary))"
                                        : "rgb(229 231 235)",
                                    }}
                                  >
                                    <div
                                      className="absolute top-0 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                      style={{
                                        transform: checked
                                          ? "translateX(100%)"
                                          : "translateX(0)",
                                      }}
                                    />
                                  </div>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Navigation Actions */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <RotateCcw
                            className="w-4 h-4"
                            style={{ color: "rgb(var(--primary))" }}
                          />
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
                      {[
                        "front",
                        "back",
                        "left",
                        "right",
                        "top",
                        "bottom",
                        "iso",
                      ].map((view) => (
                        <button
                          key={view}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                            activeView ===
                            view.charAt(0).toUpperCase() +
                              view.slice(1).toLowerCase()
                              ? "text-white shadow-lg"
                              : "text-black/60 hover:text-black hover:bg-gray-100"
                          }`}
                          style={
                            activeView ===
                            view.charAt(0).toUpperCase() +
                              view.slice(1).toLowerCase()
                              ? { backgroundColor: "rgb(var(--primary))" }
                              : undefined
                          }
                          onClick={() => handleViewChange(view)}
                        >
                          {t(`app_navigation_${view}`)}
                        </button>
                      ))}
                    </div>

                    {/* View Lock */}
                    <div className="flex items-center gap-1">
                      <button
                        className={`p-2 rounded-full transition-all duration-200 ${
                          viewLocked
                            ? "bg-red-500 text-white"
                            : "text-black/70 hover:text-black hover:bg-gray-100"
                        }`}
                        title={
                          viewLocked
                            ? t("app_navigation_unlockView")
                            : t("app_navigation_lockView")
                        }
                        onClick={() => {
                          const next = !viewLocked;
                          setViewLocked(next);
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
                          wireframe
                            ? "text-white"
                            : "text-black/70 hover:text-black hover:bg-gray-100"
                        }`}
                        style={
                          wireframe
                            ? { backgroundColor: "rgb(var(--primary))" }
                            : undefined
                        }
                        title={t("app_navigation_toggleWireframe")}
                        onClick={() => {
                          const next = !wireframe;
                          setWireframe(next);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        className={`p-2 rounded-full transition-all duration-200 ${
                          axes
                            ? "text-white"
                            : "text-black/70 hover:text-black hover:bg-gray-100"
                        }`}
                        style={
                          axes
                            ? { backgroundColor: "rgb(var(--primary))" }
                            : undefined
                        }
                        title={t("app_navigation_toggleAxes")}
                        onClick={() => {
                          const next = !axes;
                          setAxes(next);
                        }}
                      >
                        <Move3d className="h-4 w-4" />
                      </button>
                      <button
                        className={`p-2 rounded-full transition-all duration-200 ${
                          smooth
                            ? "text-white"
                            : "text-black/70 hover:text-black hover:bg-gray-100"
                        }`}
                        style={
                          smooth
                            ? { backgroundColor: "rgb(var(--primary))" }
                            : undefined
                        }
                        title={t("app_navigation_smoothFlat")}
                        onClick={() => {
                          const next = !smooth;
                          setSmooth(next);
                        }}
                      >
                        <Sun className="h-4 w-4" />
                      </button>
                      <button
                        className={`p-2 rounded-full transition-all duration-200 ${
                          perspective
                            ? "text-white"
                            : "text-black/70 hover:text-black hover:bg-gray-100"
                        }`}
                        style={
                          perspective
                            ? { backgroundColor: "rgb(var(--primary))" }
                            : undefined
                        }
                        title={
                          perspective
                            ? t("app_navigation_switchToParallel")
                            : t("app_navigation_switchToPerspective")
                        }
                        onClick={() => {
                          const next = !perspective;
                          setPerspective(next);
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
                          cameraControlsRef.current?.zoomIn();
                        }}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      <button
                        className="p-2 text-black/70 hover:text-black hover:bg-gray-100 rounded-full transition-all duration-200"
                        title={t("app_navigation_zoomOut")}
                        onClick={() => {
                          cameraControlsRef.current?.zoomOut();
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

                <VtkApp
                  file={selectedFile}
                  displayState={{ wireframe, grid: false, axes, smooth }}
                  viewLocked={viewLocked}
                  perspective={perspective}
                  onCameraReady={(controls) => {
                    cameraControlsRef.current = controls;
                  }}
                />
                {selectedFile && (
                  <button
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
              <div
                ref={welcomeRef}
                className="text-center max-w-md mx-auto p-8"
              >
                <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Upload className="h-12 w-12 text-gray-400" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  {t("app_welcome_title")}
                </h2>
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
                      e.currentTarget.style.backgroundColor =
                        "rgb(var(--primary-hover))";
                      e.currentTarget.style.color = "white";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "rgb(var(--primary))";
                      e.currentTarget.style.color = "white";
                    }}
                  >
                    <Upload
                      className="h-4 w-4 mr-2"
                      style={{ color: "white" }}
                    />
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
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                        {t("app_welcome_stl")}
                      </span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                        {t("app_welcome_obj")}
                      </span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                        {t("app_welcome_ply")}
                      </span>
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
              <span>
                {t("app_status_model")}: {selectedFile.name}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>{t("app_status_resolution")}: 1920x1080</span>
          <span>•</span>
          <span>
            {t("app_status_quality")}: {t("app_status_qualityHigh")}
          </span>
          <Button variant="ghost" size="sm" className="p-1">
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
