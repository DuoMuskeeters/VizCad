"use client"

import type React from "react"

import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search,
  Download,
  Eye,
  Grid3X3,
  List,
  Package,
  Cpu,
  Home,
  Gamepad2,
  Wrench,
  Palette,
  Zap,
  Heart,
  Share2,
} from "lucide-react"
import { useState, useMemo, useEffect } from "react"
import { useTranslation } from "react-i18next"
import ThumbnailGenerator from "@/components/ThumbnailGenerator.client"

export const Route = createFileRoute("/store")({
  component: StorePage,
})

interface StlModel {
  id: number
  name: string
  description: string
  category: string
  file_url: string
  file_size: number
  file_type: string
  price: number
  tags: string
  created_by: string
  thumbnail_url?: string
  created_at: string
  updated_at: string
}

interface ApiResponse {
  success: boolean
  count: number
  models: StlModel[]
}

// API functions
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787/api"

const fetchModels = async (): Promise<StlModel[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/models`)
    const data: ApiResponse = await response.json()
    if (data.success) {
      return data.models
    }
    throw new Error("Failed to fetch models")
  } catch (error) {
    console.error("Error fetching models:", error)
    return []
  }
}

const fetchCategories = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/categories`)
    const data = await response.json()
    if (data.success) {
      return data.categories
    }
    return []
  } catch (error) {
    console.error("Error fetching categories:", error)
    return []
  }
}

// Utility functions
const formatFileSize = (sizeInBytes: number): string => {
  if (sizeInBytes === 0) return "0 Bytes"

  if (sizeInBytes < 1024) {
    return `${sizeInBytes} Bytes`
  } else if (sizeInBytes < 1024 * 1024) {
    const kb = (sizeInBytes / 1024).toFixed(1)
    return `${Number.parseFloat(kb)} KB`
  } else {
    const mb = (sizeInBytes / (1024 * 1024)).toFixed(1)
    return `${Number.parseFloat(mb)} MB`
  }
}

const parseTags = (tags: string): string[] => {
  if (!tags || tags.trim() === "") return []

  try {
    // Eğer JSON formatında ise parse et
    if (tags.startsWith("[") && tags.endsWith("]")) {
      return JSON.parse(tags)
    }
    // Eğer comma separated ise split et
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
  } catch {
    // Hata durumunda comma separated olarak dene
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
  }
}

const defaultCategories = [
  { id: "all", name: "All Categories", icon: Grid3X3, count: 0 },
  { id: "art", name: "ART", icon: Palette, count: 0 },
  { id: "mechanical", name: "MECHANICAL", icon: Cpu, count: 0 },
  { id: "functional", name: "FUNCTIONAL", icon: Package, count: 0 },
  { id: "games", name: "GAMES", icon: Gamepad2, count: 0 },
  { id: "home", name: "HOME", icon: Home, count: 0 },
  { id: "toys", name: "TOYS", icon: Zap, count: 0 },
  { id: "tools", name: "TOOLS", icon: Wrench, count: 0 },
]

export function StorePage() {
  const { t } = useTranslation()
  const [models, setModels] = useState<StlModel[]>([])
  const [categories, setCategories] = useState(defaultCategories)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [sortBy, setSortBy] = useState("popularity")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [selectedModel, setSelectedModel] = useState<StlModel | null>(null)
  const [priceFilter, setPriceFilter] = useState("all")
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadKey, setUploadKey] = useState("")
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareModelId, setShareModelId] = useState<number | null>(null)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [uploadResponse, setUploadResponse] = useState<{ model?: any; update_token?: string } | null>(null)
  const [uploadFormData, setUploadFormData] = useState({
    name: "",
    description: "",
    category: "",
    price: 0,
    tags: [] as string[],
    file: null as File | null,
    thumbnail: null as string | null,
    thumbnailError: false,
    createdBy: "",
  })
  const [tagInput, setTagInput] = useState("")

  // Load favorites from localStorage
  useEffect(() => {
    const savedFavorites = localStorage.getItem("vizcad-favorites")
    if (savedFavorites) {
      try {
        const favoriteIds = JSON.parse(savedFavorites)
        setFavorites(new Set(favoriteIds))
      } catch (error) {
        console.error("Error loading favorites:", error)
      }
    }
  }, [])

  // Save favorites to localStorage
  const saveFavoritesToStorage = (newFavorites: Set<number>) => {
    localStorage.setItem("vizcad-favorites", JSON.stringify(Array.from(newFavorites)))
  }

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [modelsData, categoriesData] = await Promise.all([fetchModels(), fetchCategories()])

        setModels(modelsData)

        // Update categories with counts
        const updatedCategories = defaultCategories.map((cat) => {
          if (cat.id === "all") {
            return { ...cat, count: modelsData.length }
          }
          const categoryCount = modelsData.filter(
            (model) => model.category.toLowerCase() === cat.name.toLowerCase(),
          ).length
          return { ...cat, count: categoryCount }
        })
        setCategories(updatedCategories)
      } catch (err) {
        setError("Failed to load store data")
        console.error("Error loading store data:", err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // Filter and sort models
  const filteredModels = useMemo(() => {
    let filtered = models

    // Category filter
    if (selectedCategory !== "all") {
      const categoryName = categories.find((c) => c.id === selectedCategory)?.name
      if (categoryName && categoryName !== "All Categories") {
        filtered = filtered.filter((model) => model.category.toLowerCase() === categoryName.toLowerCase())
      }
    }

    // Search filter - word beginning match
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((model) => {
        // Check if any word in name starts with query
        const nameWords = model.name.toLowerCase().split(/\s+/)
        const nameMatch = nameWords.some((word) => word.startsWith(query))

        // Check if any word in description starts with query
        const descWords = model.description.toLowerCase().split(/\s+/)
        const descMatch = descWords.some((word) => word.startsWith(query))

        // Check if any tag starts with query
        const tagMatch = parseTags(model.tags).some((tag) => tag.toLowerCase().startsWith(query))

        return nameMatch || descMatch || tagMatch
      })
    }

    // Price filter
    if (priceFilter === "free") {
      filtered = filtered.filter((model) => model.price === 0)
    } else if (priceFilter === "paid") {
      filtered = filtered.filter((model) => model.price > 0)
    }

    // Favorites filter
    if (showFavoritesOnly) {
      filtered = filtered.filter((model) => favorites.has(model.id))
    }

    // Sort
    switch (sortBy) {
      case "popularity":
        // For now, sort by creation date as we don't have downloads field
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case "newest":
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case "price-low":
        filtered.sort((a, b) => a.price - b.price)
        break
      case "price-high":
        filtered.sort((a, b) => b.price - a.price)
        break
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name))
        break
      default:
        break
    }

    return filtered
  }, [models, selectedCategory, searchQuery, priceFilter, sortBy, categories, showFavoritesOnly, favorites])

  const handleDownload = async (model: StlModel) => {
    // Check if model is free
    if (model.price && model.price > 0) {
      alert(`This model costs $${model.price}. Purchase required to download.`)
      return
    }

    try {
      // Use API download endpoint for proper download tracking
      const response = await fetch(`${API_BASE_URL}/models/${model.id}/download`)

      if (!response.ok) {
        throw new Error("Download failed")
      }

      // Get the blob data
      const blob = await response.blob()

      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${model.name.replace(/\s+/g, "-").toLowerCase()}.${model.file_type}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up the blob URL
      URL.revokeObjectURL(url)

      console.log(`Downloaded: ${model.name}`)
    } catch (error) {
      console.error("Download error:", error)
      alert("Download failed. Please try again.")
    }
  }

  const handlePreview = (model: StlModel) => {
    // Check if model is paid/premium
    if (model.price > 0) {
      alert(
        `This is a premium model ($${model.price}). Preview is only available for free models. Please purchase to access the full model.`,
      )
      return
    }

    // Navigate to the app with API file serve URL for proper file serving
    const params = new URLSearchParams({
      model: `${API_BASE_URL}/models/${model.id}/file`, // Use API file serve endpoint
      name: model.name,
      author: model.created_by || "Unknown",
      modelId: model.id.toString(),
    })
    window.location.href = `/app?${params.toString()}`
  }

  const handleFavorite = (modelId: number) => {
    const newFavorites = new Set(favorites)
    if (newFavorites.has(modelId)) {
      newFavorites.delete(modelId)
    } else {
      newFavorites.add(modelId)
    }
    setFavorites(newFavorites)
    saveFavoritesToStorage(newFavorites)
  }

  const handleShare = (modelId: number) => {
    setShareModelId(modelId)
    setShareModalOpen(true)
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert("Link copied to clipboard!")
    } catch (error) {
      console.error("Failed to copy:", error)
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      alert("Link copied to clipboard!")
    }
  }

  const shareViaWebAPI = async (model: StlModel) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: model.name,
          text: model.description,
          url: `${window.location.origin}/app?model=${encodeURIComponent(model.file_url)}`,
        })
      } catch (error) {
        console.error("Error sharing:", error)
      }
    } else {
      // Fallback to clipboard
      const shareUrl = `${window.location.origin}/app?model=${encodeURIComponent(model.file_url)}`
      await copyToClipboard(shareUrl)
    }
  }

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag && !uploadFormData.tags.includes(trimmedTag) && uploadFormData.tags.length < 3) {
      setUploadFormData({
        ...uploadFormData,
        tags: [...uploadFormData.tags, trimmedTag],
      })
    }
    setTagInput("")
  }

  const removeTag = (tagToRemove: string) => {
    setUploadFormData({
      ...uploadFormData,
      tags: uploadFormData.tags.filter((tag) => tag !== tagToRemove),
    })
  }

  const handleTagKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log("Key pressed:", e.key) // Debug
    if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      console.log("Enter pressed, tagInput:", tagInput) // Debug
      if (tagInput.trim()) {
        addTag(tagInput)
      }
    }
  }

  const handleUpload = async () => {
    if (!uploadFormData.file || !uploadFormData.name || !uploadFormData.category || !uploadFormData.createdBy) {
      alert("Please fill all required fields!")
      return
    }

    try {
      const formData = new FormData()
      formData.append("file", uploadFormData.file)
      formData.append("name", uploadFormData.name)
      formData.append("description", uploadFormData.description)
      formData.append("category", uploadFormData.category)
      formData.append("price", uploadFormData.price.toString())
      formData.append("tags", JSON.stringify(uploadFormData.tags))
      formData.append("created_by", uploadFormData.createdBy)

      // Add thumbnail if available
      if (uploadFormData.thumbnail) {
        formData.append("thumbnail", uploadFormData.thumbnail)
      }

      const response = await fetch(`${API_BASE_URL}/models`, {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        const result = await response.json()
        setShowUploadForm(false)
        setShowSuccessModal(true)
        setUploadFormData({
          name: "",
          description: "",
          category: "",
          price: 0,
          tags: [],
          file: null,
          thumbnail: null,
          thumbnailError: false,
          createdBy: "",
        })
        setTagInput("")

        // Auto close success modal after 0.75 seconds
        setTimeout(() => {
          setShowSuccessModal(false)
          // Refresh models list
          window.location.reload()
        }, 750)
      } else {
        const error = await response.json()
        alert(`Upload failed: ${error.error || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Upload error:", error)
      alert("Upload failed!")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-20 sm:pt-24 lg:pt-28 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading models...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background pt-20 sm:pt-24 lg:pt-28 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-destructive mb-2">Error Loading Store</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="marketplace-hero pt-20 sm:pt-24 lg:pt-28 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-6">
              <div className="bg-primary/10 p-3 rounded-xl">
                <Package className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 text-balance">
              3D Model Catalog
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto text-balance leading-relaxed">
              Explore a professional catalog of 3D models and STL files for engineering, design, and creative projects. Search, filter, and download high-quality models shared by the community.
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
              <Input
                type="text"
                placeholder="Search thousands of 3D models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input pl-12 pr-4 py-4 text-lg rounded-xl border-0 shadow-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="bg-card rounded-xl border shadow-sm p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            <div className="flex flex-wrap gap-3 flex-1">
              {/* Sort */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent className="bg-background border">
                  <SelectItem value="popularity">Most Popular</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="price-low">Price: Low to High</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                </SelectContent>
              </Select>

              {/* Price Filter */}
              <Select value={priceFilter} onValueChange={setPriceFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Price" />
                </SelectTrigger>
                <SelectContent className="bg-background border">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>

              {/* Favorites Filter */}
              <Button
                variant={showFavoritesOnly ? "default" : "outline"}
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={showFavoritesOnly ? "bg-primary text-primary-foreground" : ""}
              >
                <Heart className={`h-4 w-4 mr-2 ${showFavoritesOnly ? "fill-current" : ""}`} />
                Favorites {favorites.size > 0 && `(${favorites.size})`}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              {/* View Mode */}
              <div className="flex rounded-lg border bg-muted p-1">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className={`rounded-md ${viewMode === "grid" ? "bg-background shadow-sm" : ""}`}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className={`rounded-md ${viewMode === "list" ? "bg-background shadow-sm" : ""}`}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>

              {/* Upload Button */}
              <Button
                onClick={() => setShowUploadForm(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Package className="h-4 w-4 mr-2" />
                Upload Model
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="w-full lg:w-72">
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold">Categories</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-1 p-2">
                  {categories.map((category) => {
                    const Icon = category.icon
                    const isActive = selectedCategory === category.id
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`category-item w-full flex items-center justify-between px-4 py-3 text-left rounded-lg transition-all ${
                          isActive ? "active" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4" />
                          <span className="font-medium">{category.name}</span>
                        </div>
                        <Badge variant={isActive ? "secondary" : "outline"} className="text-xs">
                          {category.count}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6 shadow-sm">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary mb-1">{models.length}</div>
                    <div className="text-sm text-muted-foreground">Total Models</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary mb-1">
                      {models.filter((m: StlModel) => !m.price || m.price === 0).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Free Models</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary mb-1">{categories.length - 1}</div>
                    <div className="text-sm text-muted-foreground">Categories</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Results Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-foreground mb-1">
                  {selectedCategory === "all" ? "All Models" : categories.find((c) => c.id === selectedCategory)?.name}
                </h2>
                <p className="text-muted-foreground">
                  {filteredModels.length} model{filteredModels.length !== 1 ? "s" : ""} found
                </p>
              </div>
            </div>

            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredModels.map((model) => (
                  <Card
                    key={model.id}
                    className="product-card group overflow-hidden border-0 shadow-sm hover:shadow-lg"
                  >
                    <div className="relative overflow-hidden">
                      <div className="w-full aspect-square bg-muted/30 flex items-center justify-center">
                        {model.thumbnail_url ? (
                          <img
                            src={`${API_BASE_URL}/models/${model.id}/thumbnail`}
                            alt={model.name}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            onError={(e) => {
                              console.error("Thumbnail failed to load for model:", model.id)
                              ;(e.target as HTMLImageElement).style.display = "none"
                            }}
                          />
                        ) : (
                          <Package className="h-16 w-16 text-muted-foreground/50" />
                        )}
                      </div>

                      {/* Price Badge */}
                      <div className="absolute top-3 right-3">
                        {model.price > 0 ? (
                          <Badge className="bg-primary text-primary-foreground font-semibold">${model.price}</Badge>
                        ) : (
                          <Badge className="bg-green-500 text-white font-semibold">Free</Badge>
                        )}
                      </div>

                      {/* Hover Actions */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          className="bg-white text-black hover:bg-white/90"
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePreview(model)
                          }}
                          disabled={model.price > 0}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {model.price > 0 ? "Premium" : "Preview"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownload(model)
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div>
                          <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                            {model.name}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{model.description}</p>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{formatFileSize(model.file_size)}</span>
                          <span>{model.file_type?.toUpperCase()}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {model.category}
                          </Badge>
                        </div>

                        <Button
                          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownload(model)
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {!model.price || model.price === 0 ? "Download Free" : `Buy $${model.price}`}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredModels.map((model) => (
                  <Card key={model.id} className="hover:shadow-md transition-shadow border-0 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex gap-6">
                        <div className="w-32 h-32 bg-muted/30 rounded-lg flex items-center justify-center overflow-hidden">
                          {model.thumbnail_url ? (
                            <img
                              src={`${API_BASE_URL}/models/${model.id}/thumbnail`}
                              alt={model.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                console.error("List thumbnail failed to load for model:", model.id)
                                ;(e.target as HTMLImageElement).style.display = "none"
                              }}
                            />
                          ) : (
                            <Package className="h-8 w-8 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-semibold text-lg text-foreground">{model.name}</h3>
                              <p className="text-muted-foreground mt-1">{model.description}</p>
                            </div>
                            <Badge className={model.price > 0 ? "bg-primary" : "bg-green-500"}>
                              {!model.price || model.price === 0 ? "Free" : `$${model.price}`}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{formatFileSize(model.file_size)}</span>
                            <span>{model.file_type?.toUpperCase()}</span>
                            <span>by {model.created_by || "Anonymous"}</span>
                          </div>
                          <div className="flex gap-3">
                            <Button
                              onClick={() => handlePreview(model)}
                              disabled={model.price > 0}
                              variant={model.price > 0 ? "outline" : "default"}
                              className={
                                model.price === 0 ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""
                              }
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              {model.price > 0 ? "Premium" : "Preview"}
                            </Button>
                            <Button variant="outline" onClick={() => handleDownload(model)}>
                              <Download className="h-4 w-4 mr-2" />
                              {!model.price || model.price === 0 ? "Download" : `Buy $${model.price}`}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {filteredModels.length === 0 && (
              <div className="text-center py-16">
                <div className="bg-muted/30 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                  <Package className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">No models found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your search or filters to find what you're looking for
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Form Modal */}
      <Dialog open={showUploadForm} onOpenChange={setShowUploadForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload 3D Model</DialogTitle>
            <DialogDescription>Share your 3D model with the community</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Model Name</label>
                <Input
                  placeholder="Enter model name"
                  value={uploadFormData.name}
                  onChange={(e) => setUploadFormData({ ...uploadFormData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={uploadFormData.category}
                  onValueChange={(value) => setUploadFormData({ ...uploadFormData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border">
                    <SelectItem value="art">ART</SelectItem>
                    <SelectItem value="mechanical">MECHANICAL</SelectItem>
                    <SelectItem value="functional">FUNCTIONAL</SelectItem>
                    <SelectItem value="games">GAMES</SelectItem>
                    <SelectItem value="home">HOME</SelectItem>
                    <SelectItem value="toys">TOYS</SelectItem>
                    <SelectItem value="tools">TOOLS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Created By</label>
              <Input
                placeholder="Enter creator name"
                value={uploadFormData.createdBy}
                onChange={(e) => setUploadFormData({ ...uploadFormData, createdBy: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Describe your model"
                value={uploadFormData.description}
                onChange={(e) => setUploadFormData({ ...uploadFormData, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Price ($)</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0 for free"
                  value={uploadFormData.price}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === "") {
                      setUploadFormData({ ...uploadFormData, price: 0 })
                    } else {
                      const numVal = Number.parseFloat(val)
                      setUploadFormData({ ...uploadFormData, price: Math.max(0, isNaN(numVal) ? 0 : numVal) })
                    }
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Tags (Max 3)</label>
                <div className="space-y-2">
                  <Input
                    placeholder="Type tag and press Enter"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyPress}
                    disabled={uploadFormData.tags.length >= 3}
                  />
                  <div className="flex flex-wrap gap-1">
                    {uploadFormData.tags.map((tag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => removeTag(tag)}
                      >
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">3D Model File</label>
              <Input
                type="file"
                accept=".stl,.obj,.ply"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  setUploadFormData({ ...uploadFormData, file, thumbnail: null, thumbnailError: false })
                }}
              />
            </div>

            {/* Hidden Thumbnail Generator - runs in background */}
            {uploadFormData.file && (
              <div style={{ position: "absolute", left: "-9999px", visibility: "hidden" }}>
                <ThumbnailGenerator
                  file={uploadFormData.file}
                  onThumbnailGenerated={(thumbnail) => {
                    console.log("Thumbnail generated successfully")
                    setUploadFormData((prev) => ({ ...prev, thumbnail, thumbnailError: false }))
                  }}
                  onError={(error) => {
                    console.error("Thumbnail error:", error)
                    setUploadFormData((prev) => ({ ...prev, thumbnailError: true }))
                  }}
                  width={1080}
                  height={1080}
                />
              </div>
            )}

            {/* Show thumbnail generation status */}
            {uploadFormData.file && (
              <div className="text-sm text-muted-foreground">
                {uploadFormData.thumbnailError ? (
                  <span className="text-red-600">❌ Thumbnail generation failed</span>
                ) : uploadFormData.thumbnail ? (
                  <span className="text-green-600">✓ Thumbnail generated</span>
                ) : (
                  <span>🔄 Generating thumbnail...</span>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={() => {
                  setShowUploadForm(false)
                  setUploadFormData({
                    name: "",
                    description: "",
                    category: "",
                    price: 0,
                    tags: [],
                    file: null,
                    thumbnail: null,
                    thumbnailError: false,
                    createdBy: "",
                  })
                  setTagInput("")
                }}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleUpload}>
                Upload Model
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Upload Successful!</DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-medium text-green-800 mb-2">Model uploaded successfully!</p>
            <p className="text-sm text-muted-foreground">Redirecting in a moment...</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Modal */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Model</DialogTitle>
            <DialogDescription>Share this 3D model with others</DialogDescription>
          </DialogHeader>

          {shareModelId && (
            <div className="space-y-4">
              {(() => {
                const model = models.find((m) => m.id === shareModelId)
                if (!model) return null

                const shareUrl = `${window.location.origin}/app?model=${encodeURIComponent(model.file_url)}`

                return (
                  <>
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Share Link</h4>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={shareUrl}
                          readOnly
                          className="flex-1 px-3 py-2 text-xs border rounded-md bg-muted/50"
                        />
                        <Button size="sm" onClick={() => copyToClipboard(shareUrl)}>
                          Copy
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Share Via</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => shareViaWebAPI(model)}
                          className="justify-start"
                        >
                          <Share2 className="h-4 w-4 mr-2" />
                          Native Share
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const twitterText = `Check out this 3D model: ${model.name}`
                            const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(shareUrl)}`
                            window.open(twitterUrl, "_blank")
                          }}
                          className="justify-start"
                        >
                          <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.29 18.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0020 3.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.073 4.073 0 01.8 7.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 010 16.407a11.616 11.616 0 006.29 1.84" />
                          </svg>
                          Twitter
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
                            window.open(linkedinUrl, "_blank")
                          }}
                          className="justify-start"
                        >
                          <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M16.338 16.338H13.67V12.16c0-.995-.017-2.277-1.387-2.277-1.39 0-1.601 1.086-1.601 2.207v4.248H8.014v-8.59h2.559v1.174h.037c.356-.675 1.227-1.387 2.526-1.387 2.703 0 3.203 1.778 3.203 4.092v4.711zM5.005 6.575a1.548 1.548 0 11-.003-3.096 1.548 1.548 0 01.003 3.096zm-1.337 9.763H6.34v-8.59H3.667v8.59zM17.668 1H2.328C1.595 1 1 1.581 1 2.298v15.403C1 18.418 1.595 19 2.328 19h15.34c.734 0 1.332-.582 1.332-1.299V2.298C19 1.581 18.402 1 17.668 1z" />
                          </svg>
                          LinkedIn
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const whatsappText = `Check out this 3D model: ${model.name} - ${shareUrl}`
                            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`
                            window.open(whatsappUrl, "_blank")
                          }}
                          className="justify-start"
                        >
                          <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0010.05 0C4.495 0 .05 4.445.05 9.999c0 1.76.459 3.478 1.332 4.992L0 20l5.134-1.347a9.963 9.963 0 004.916 1.347h.004c5.555 0 10.001-4.445 10.001-9.999 0-2.67-1.04-5.183-2.922-7.096z" />
                          </svg>
                          WhatsApp
                        </Button>
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default StorePage
