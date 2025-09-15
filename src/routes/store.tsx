import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Search, 
  Filter, 
  Download, 
  Eye, 
  Star, 
  Grid3X3, 
  List,
  Package,
  Cpu,
  Car,
  Home,
  Gamepad2,
  Wrench,
  Palette,
  Zap,
  Heart,
  Share2,
  Info,
  FileText,
  Calendar,
  User,
  Tag
} from "lucide-react"
import { useState, useMemo, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { detectLanguage, seoContent } from "@/utils/language"
import ThumbnailGenerator from "@/components/ThumbnailGenerator"

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
const API_BASE_URL = 'http://127.0.0.1:8787/api' // Updated to use running API server

const fetchModels = async (): Promise<StlModel[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/models`)
    const data: ApiResponse = await response.json()
    if (data.success) {
      return data.models
    }
    throw new Error('Failed to fetch models')
  } catch (error) {
    console.error('Error fetching models:', error)
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
    console.error('Error fetching categories:', error)
    return []
  }
}

// Utility functions
const formatFileSize = (sizeInBytes: number): string => {
  if (sizeInBytes === 0) return '0 Bytes'
  
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} Bytes`
  } else if (sizeInBytes < 1024 * 1024) {
    const kb = (sizeInBytes / 1024).toFixed(1)
    return `${parseFloat(kb)} KB`
  } else {
    const mb = (sizeInBytes / (1024 * 1024)).toFixed(1)
    return `${parseFloat(mb)} MB`
  }
}

const parseTags = (tags: string): string[] => {
  if (!tags || tags.trim() === '') return []
  
  try {
    // Eğer JSON formatında ise parse et
    if (tags.startsWith('[') && tags.endsWith(']')) {
      return JSON.parse(tags)
    }
    // Eğer comma separated ise split et
    return tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
  } catch {
    // Hata durumunda comma separated olarak dene
    return tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
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
  { id: "tools", name: "TOOLS", icon: Wrench, count: 0 }
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
  const [uploadResponse, setUploadResponse] = useState<{model?: any, update_token?: string} | null>(null)
  const [uploadFormData, setUploadFormData] = useState({
    name: "",
    description: "",
    category: "",
    price: 0,
    tags: [] as string[],
    file: null as File | null,
    thumbnail: null as string | null,
    thumbnailError: false,
    createdBy: ""
  })
  const [tagInput, setTagInput] = useState("")

  // Load favorites from localStorage
  useEffect(() => {
    const savedFavorites = localStorage.getItem('vizcad-favorites')
    if (savedFavorites) {
      try {
        const favoriteIds = JSON.parse(savedFavorites)
        setFavorites(new Set(favoriteIds))
      } catch (error) {
        console.error('Error loading favorites:', error)
      }
    }
  }, [])

  // Save favorites to localStorage
  const saveFavoritesToStorage = (newFavorites: Set<number>) => {
    localStorage.setItem('vizcad-favorites', JSON.stringify(Array.from(newFavorites)))
  }

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [modelsData, categoriesData] = await Promise.all([
          fetchModels(),
          fetchCategories()
        ])
        
        setModels(modelsData)
        
        // Update categories with counts
        const updatedCategories = defaultCategories.map(cat => {
          if (cat.id === "all") {
            return { ...cat, count: modelsData.length }
          }
          const categoryCount = modelsData.filter(model => 
            model.category.toLowerCase() === cat.name.toLowerCase()
          ).length
          return { ...cat, count: categoryCount }
        })
        setCategories(updatedCategories)
      } catch (err) {
        setError('Failed to load store data')
        console.error('Error loading store data:', err)
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
      const categoryName = categories.find(c => c.id === selectedCategory)?.name
      if (categoryName && categoryName !== "All Categories") {
        filtered = filtered.filter(model => 
          model.category.toLowerCase() === categoryName.toLowerCase()
        )
      }
    }

    // Search filter - word beginning match
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(model => {
        // Check if any word in name starts with query
        const nameWords = model.name.toLowerCase().split(/\s+/)
        const nameMatch = nameWords.some(word => word.startsWith(query))
        
        // Check if any word in description starts with query
        const descWords = model.description.toLowerCase().split(/\s+/)
        const descMatch = descWords.some(word => word.startsWith(query))
        
        // Check if any tag starts with query
        const tagMatch = parseTags(model.tags).some(tag => 
          tag.toLowerCase().startsWith(query)
        )
        
        return nameMatch || descMatch || tagMatch
      })
    }

    // Price filter
    if (priceFilter === "free") {
      filtered = filtered.filter(model => model.price === 0)
    } else if (priceFilter === "paid") {
      filtered = filtered.filter(model => model.price > 0)
    }

    // Favorites filter
    if (showFavoritesOnly) {
      filtered = filtered.filter(model => favorites.has(model.id))
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
        throw new Error('Download failed')
      }
      
      // Get the blob data
      const blob = await response.blob()
      
      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${model.name.replace(/\s+/g, '-').toLowerCase()}.${model.file_type}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up the blob URL
      URL.revokeObjectURL(url)
      
      console.log(`Downloaded: ${model.name}`)
    } catch (error) {
      console.error('Download error:', error)
      alert('Download failed. Please try again.')
    }
  }

  const handlePreview = (model: StlModel) => {
    // Check if model is paid/premium
    if (model.price > 0) {
      alert(`This is a premium model ($${model.price}). Preview is only available for free models. Please purchase to access the full model.`)
      return
    }
    
    // Navigate to the app with API file serve URL for proper file serving
    const params = new URLSearchParams({
      model: `${API_BASE_URL}/models/${model.id}/file`, // Use API file serve endpoint
      name: model.name,
      author: model.created_by || 'Unknown',
      modelId: model.id.toString()
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
      alert('Link copied to clipboard!')
    } catch (error) {
      console.error('Failed to copy:', error)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      alert('Link copied to clipboard!')
    }
  }

  const shareViaWebAPI = async (model: StlModel) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: model.name,
          text: model.description,
          url: `${window.location.origin}/app?model=${encodeURIComponent(model.file_url)}`
        })
      } catch (error) {
        console.error('Error sharing:', error)
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
        tags: [...uploadFormData.tags, trimmedTag]
      })
    }
    setTagInput("")
  }

  const removeTag = (tagToRemove: string) => {
    setUploadFormData({
      ...uploadFormData,
      tags: uploadFormData.tags.filter(tag => tag !== tagToRemove)
    })
  }

  const handleTagKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log('Key pressed:', e.key) // Debug
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      console.log('Enter pressed, tagInput:', tagInput) // Debug
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
      formData.append('file', uploadFormData.file)
      formData.append('name', uploadFormData.name)
      formData.append('description', uploadFormData.description)
      formData.append('category', uploadFormData.category)
      formData.append('price', uploadFormData.price.toString())
      formData.append('tags', JSON.stringify(uploadFormData.tags))
      formData.append('created_by', uploadFormData.createdBy)
      
      // Add thumbnail if available
      if (uploadFormData.thumbnail) {
        formData.append('thumbnail', uploadFormData.thumbnail)
      }

      const response = await fetch(`${API_BASE_URL}/models`, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        setShowUploadForm(false)
        setShowSuccessModal(true)
        setUploadFormData({name: "", description: "", category: "", price: 0, tags: [], file: null, thumbnail: null, thumbnailError: false, createdBy: ""})
        setTagInput("")
        
        // Auto close success modal after 0.75 seconds
        setTimeout(() => {
          setShowSuccessModal(false)
          // Refresh models list
          window.location.reload()
        }, 750)
      } else {
        const error = await response.json()
        alert(`Upload failed: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert("Upload failed!")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-16 sm:pt-20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading models...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background pt-16 sm:pt-20 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-destructive mb-2">Error Loading Store</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            STL Store
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Discover high-quality 3D models and STL files for your projects. From mechanical parts to artistic sculptures.
          </p>
        </div>

        {/* Search and Filters */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-background border">
                <SelectItem value="popularity">Most Popular</SelectItem>
                <SelectItem value="rating">Highest Rated</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
              </SelectContent>
            </Select>

            {/* Price Filter */}
            <Select value={priceFilter} onValueChange={setPriceFilter}>
              <SelectTrigger className="w-full lg:w-32">
                <SelectValue placeholder="Price" />
              </SelectTrigger>
              <SelectContent className="bg-background border">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>

            {/* View Mode */}
            <div className="flex rounded-md border">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="rounded-r-none"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Favorites Filter */}
            <Button
              variant={showFavoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={showFavoritesOnly ? "text-red-500 hover:text-red-600" : ""}
            >
              <Heart className={`h-4 w-4 mr-2 ${showFavoritesOnly ? "fill-current" : ""}`} />
              Favorites {favorites.size > 0 && `(${favorites.size})`}
            </Button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Categories */}
          <div className="w-full lg:w-64">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Categories</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-1">
                  {categories.map((category) => {
                    const Icon = category.icon
                    const isActive = selectedCategory === category.id
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent transition-colors ${
                          isActive ? 'bg-primary/10 text-primary border-r-2 border-primary' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4" />
                          <span className="text-sm font-medium">{category.name}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {category.count}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card className="mt-4">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{models.length}</div>
                    <div className="text-sm text-muted-foreground">Total Models</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {models.filter((m: StlModel) => !m.price || m.price === 0).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Free Models</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {categories.length}
                    </div>
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
              <p className="text-muted-foreground">
                {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} found
              </p>
              
              {/* Upload Button */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowUploadForm(true)}
              >
                <Package className="h-4 w-4 mr-2" />
                Upload Model
              </Button>

              {/* Upload Form Modal */}
              <Dialog open={showUploadForm} onOpenChange={setShowUploadForm}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Upload 3D Model</DialogTitle>
                    <DialogDescription>
                      Share your 3D model with the community
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Model Name</label>
                        <Input
                          placeholder="Enter model name"
                          value={uploadFormData.name}
                          onChange={(e) => setUploadFormData({...uploadFormData, name: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Category</label>
                        <Select value={uploadFormData.category} onValueChange={(value) => setUploadFormData({...uploadFormData, category: value})}>
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
                        onChange={(e) => setUploadFormData({...uploadFormData, createdBy: e.target.value})}
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Input
                        placeholder="Describe your model"
                        value={uploadFormData.description}
                        onChange={(e) => setUploadFormData({...uploadFormData, description: e.target.value})}
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
                            if (val === '') {
                              setUploadFormData({...uploadFormData, price: 0})
                            } else {
                              const numVal = parseFloat(val)
                              setUploadFormData({...uploadFormData, price: Math.max(0, isNaN(numVal) ? 0 : numVal)})
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
                          setUploadFormData({...uploadFormData, file, thumbnail: null, thumbnailError: false})
                        }}
                      />
                    </div>
                    
                    {/* Hidden Thumbnail Generator - runs in background */}
                    {uploadFormData.file && (
                      <div style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}>
                        <ThumbnailGenerator
                          file={uploadFormData.file}
                          onThumbnailGenerated={(thumbnail) => {
                            console.log('Thumbnail generated successfully')
                            setUploadFormData(prev => ({...prev, thumbnail, thumbnailError: false}))
                          }}
                          onError={(error) => {
                            console.error('Thumbnail error:', error)
                            setUploadFormData(prev => ({...prev, thumbnailError: true}))
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
                        className="flex-1"
                        onClick={() => {
                          setShowUploadForm(false)
                          setUploadFormData({name: "", description: "", category: "", price: 0, tags: [], file: null, thumbnail: null, thumbnailError: false, createdBy: ""})
                          setTagInput("")
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleUpload}
                      >
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
            </div>

            {/* Models Grid/List */}
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-8">
                {filteredModels.map((model) => (
                  <Card key={model.id} className="group hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col overflow-hidden p-0 rounded-xl">
                    <div className="relative overflow-hidden">
                      <div className="w-full aspect-square bg-muted flex items-center justify-center">
                        {model.thumbnail_url ? (
                          <img 
                            src={`${API_BASE_URL}/models/${model.id}/thumbnail`}
                            alt={model.name}
                            className="w-full h-full object-cover high-quality-image cursor-pointer hover:scale-105 transition-transform"
                            style={{
                              imageRendering: '-webkit-optimize-contrast'
                            }}
                            onError={(e) => {
                              // Fallback to placeholder if thumbnail fails to load
                              console.error('Thumbnail failed to load for model:', model.id);
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedModel(model);
                            }}
                          />
                        ) : (
                          <Package className="h-16 w-16 text-muted-foreground" />
                        )}
                        {/* Show placeholder when image fails to load */}
                        {model.thumbnail_url && (
                          <Package 
                            className="h-16 w-16 text-muted-foreground absolute" 
                            style={{ display: 'none' }} 
                            id={`fallback-${model.id}`}
                          />
                        )}
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              handlePreview(model)
                            }}
                            disabled={model.price > 0}
                            variant={model.price > 0 ? "outline" : "default"}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            {model.price > 0 ? 'Premium' : 'Preview'}
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
                      
                      {/* Price Badge */}
                      {model.price > 0 ? (
                        <Badge className="absolute top-2 right-2 bg-yellow-500">
                          ${model.price}
                        </Badge>
                      ) : (
                        <Badge className="absolute top-2 right-2 bg-green-500">
                          Free
                        </Badge>
                      )}
                    </div>
                    
                    <CardContent className="p-3 flex flex-col flex-1 justify-between">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-1 flex-1 mr-2">
                          {model.name}
                        </h3>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          <Tag className="h-3 w-3" />
                          {model.category}
                        </div>
                      </div>
                      
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-1 overflow-hidden">
                        {model.description}
                      </p>
                      
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                        <span>{formatFileSize(model.file_size)}</span>
                        <span>{model.file_type?.toUpperCase()}</span>
                      </div>
                      
                      <div className="flex flex-col gap-2 mt-auto">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-bold">
                            {!model.price || model.price === 0 ? 'Free' : `$${model.price}`}
                          </div>
                          
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedModel(model)
                                }}
                              >
                                <Info className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>{model.name}</DialogTitle>
                              <DialogDescription>{model.description}</DialogDescription>
                            </DialogHeader>
                            
                            <div className="space-y-4">
                              {/* 3D Preview Area - Square 1:1 Resolution */}
                              <div className="w-full aspect-square max-w-md mx-auto bg-muted rounded-lg overflow-hidden relative group">
                                {model.thumbnail_url ? (
                                  <img 
                                    src={`${API_BASE_URL}/models/${model.id}/thumbnail`}
                                    alt={`${model.name} preview`}
                                    className="w-full h-full object-cover transition-transform group-hover:scale-105 high-quality-image"
                                    style={{
                                      imageRendering: 'crisp-edges'
                                    }}
                                    onError={(e) => {
                                      // Fallback to placeholder if thumbnail fails to load
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      target.nextElementSibling?.classList.remove('hidden');
                                    }}
                                  />
                                ) : null}
                                
                                {/* Fallback placeholder */}
                                <div className={`w-full h-full flex items-center justify-center bg-gray-100 ${model.thumbnail_url ? 'hidden' : ''}`}>
                                  <div className="text-center text-gray-500">
                                    <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                    </svg>
                                    <p className="text-xs">3D Model Preview</p>
                                  </div>
                                </div>
                                
                                {/* Price badge for paid models */}
                                {model.price > 0 && (
                                  <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2 py-1 rounded text-xs font-medium">
                                    ${model.price}
                                  </div>
                                )}
                                
                                {/* Free badge for free models */}
                                {model.price === 0 && (
                                  <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">
                                    FREE
                                  </div>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-3">
                                  <div>
                                    <h4 className="font-medium text-sm">Details</h4>
                                    <div className="text-xs text-muted-foreground space-y-1 mt-1">
                                      <div>File Size: {formatFileSize(model.file_size)}</div>
                                      <div>File Type: {model.file_type?.toUpperCase()}</div>
                                      <div>Category: {model.category}</div>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <h4 className="font-medium text-sm">Author</h4>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      <div className="flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        {model.created_by || 'Anonymous'}
                                      </div>
                                      <div className="flex items-center gap-1 mt-1">
                                        <Calendar className="h-3 w-3" />
                                        {new Date(model.created_at).toLocaleDateString()}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="space-y-3">
                                  <div>
                                    <h4 className="font-medium text-sm">Price</h4>
                                    <div className="text-xs text-muted-foreground space-y-1 mt-1">
                                      <div className="flex items-center gap-1">
                                        <Tag className="h-3 w-3" />
                                        {!model.price || model.price === 0 ? 'Free' : `$${model.price}`}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <h4 className="font-medium text-sm">Tags</h4>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {model.tags ? 
                                        parseTags(model.tags).map((tag: string) => (
                                          <Badge key={tag} variant="secondary" className="text-xs">
                                            {tag}
                                          </Badge>
                                        )) : 
                                        <span className="text-xs text-muted-foreground">No tags</span>
                                      }
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex gap-2 pt-4">
                                <Button
                                  className="flex-1"
                                  onClick={() => handlePreview(model)}
                                  disabled={model.price > 0}
                                  variant={model.price > 0 ? "outline" : "default"}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  {model.price > 0 ? `Premium Model - $${model.price}` : 'Preview in VizCad'}
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => handleDownload(model)}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="icon"
                                  onClick={() => handleFavorite(model.id)}
                                  className={favorites.has(model.id) ? "text-red-500 hover:text-red-600" : ""}
                                >
                                  <Heart className={`h-4 w-4 ${favorites.has(model.id) ? "fill-current" : ""}`} />
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="icon"
                                  onClick={() => handleShare(model.id)}
                                >
                                  <Share2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        </div>
                        
                        {/* Download/Buy Button */}
                        <Button
                          className="w-full"
                          variant={!model.price || model.price === 0 ? "default" : "default"}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownload(model)
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {!model.price || model.price === 0 ? 'Download' : `Buy $${model.price}`}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredModels.map((model) => (
                  <Card key={model.id} className="hover:shadow-md transition-shadow p-0 rounded-xl overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex gap-6">
                        <div className="w-40 h-40 bg-muted rounded-lg flex items-center justify-center overflow-hidden relative cursor-pointer group">
                          {model.thumbnail_url ? (
                            <img 
                              src={`${API_BASE_URL}/models/${model.id}/thumbnail`}
                              alt={model.name}
                              className="w-full h-full object-cover high-quality-image hover:scale-105 transition-transform"
                              style={{
                                imageRendering: '-webkit-optimize-contrast'
                              }}
                              onError={(e) => {
                                // Fallback to placeholder if thumbnail fails to load
                                console.error('List thumbnail failed to load for model:', model.id);
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedModel(model);
                              }}
                            />
                          ) : (
                            <Package className="h-12 w-12 text-muted-foreground" />
                          )}
                          
                          {/* Price Badge for List View */}
                          {model.price > 0 ? (
                            <Badge className="absolute -top-1 -right-1 bg-yellow-500 text-xs px-2 py-1">
                              ${model.price}
                            </Badge>
                          ) : (
                            <Badge className="absolute -top-1 -right-1 bg-green-500 text-xs px-2 py-1">
                              FREE
                            </Badge>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between">
                            <h3 className="font-semibold">{model.name}</h3>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Tag className="h-4 w-4" />
                                {model.category}
                              </div>
                              <Badge variant={!model.price || model.price === 0 ? "secondary" : "default"}>
                                {!model.price || model.price === 0 ? 'Free' : `$${model.price}`}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{model.description}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{formatFileSize(model.file_size)}</span>
                            <span>{model.file_type?.toUpperCase()}</span>
                            <span>by {model.created_by || 'Anonymous'}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handlePreview(model)}
                              disabled={model.price > 0}
                              variant={model.price > 0 ? "outline" : "default"}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              {model.price > 0 ? 'Premium' : 'Preview'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDownload(model)}>
                              <Download className="h-4 w-4 mr-1" />
                              {!model.price || model.price === 0 ? 'Download' : `Buy $${model.price}`}
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
              <div className="text-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No models found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
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
                const model = models.find(m => m.id === shareModelId)
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
                        <Button
                          size="sm"
                          onClick={() => copyToClipboard(shareUrl)}
                        >
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
                            window.open(twitterUrl, '_blank')
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
                            window.open(linkedinUrl, '_blank')
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
                            window.open(whatsappUrl, '_blank')
                          }}
                          className="justify-start"
                        >
                          <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0010.05 0C4.495 0 .05 4.445.05 9.999c0 1.76.459 3.478 1.332 4.992L0 20l5.134-1.347a9.963 9.963 0 004.916 1.347h.004c5.555 0 10.001-4.445 10.001-9.999 0-2.67-1.04-5.183-2.922-7.096z"/>
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