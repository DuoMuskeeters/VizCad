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
const API_BASE_URL = 'http://localhost:8787/api'

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
  const [uploadFormData, setUploadFormData] = useState({
    name: "",
    description: "",
    category: "",
    price: 0,
    tags: [] as string[],
    file: null as File | null,
    thumbnail: null as string | null,
    thumbnailError: false
  })
  const [tagInput, setTagInput] = useState("")

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
  }, [models, selectedCategory, searchQuery, priceFilter, sortBy, categories])

  const handleDownload = (model: StlModel) => {
    // Check if model is free
    if (model.price && model.price > 0) {
      alert(`This model costs $${model.price}. Purchase required to download.`)
      return
    }
    
    // Download free model
    const link = document.createElement('a')
    link.href = model.file_url
    link.download = `${model.name.replace(/\s+/g, '-').toLowerCase()}.${model.file_type}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handlePreview = (model: StlModel) => {
    // Navigate to the app with this model
    window.location.href = `/app?model=${encodeURIComponent(model.file_url)}`
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
    if (!uploadFormData.file || !uploadFormData.name || !uploadFormData.category) {
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
      formData.append('created_by', 'GM')
      
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
        setUploadFormData({name: "", description: "", category: "", price: 0, tags: [], file: null, thumbnail: null, thumbnailError: false})
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
              <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Package className="h-4 w-4 mr-2" />
                    Upload Model
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Upload Access</DialogTitle>
                    <DialogDescription>
                      Enter your upload key to proceed
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      type="text"
                      placeholder="Upload Key"
                      value={uploadKey}
                      onChange={(e) => setUploadKey(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setShowUploadModal(false)
                          setUploadKey("")
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => {
                          if (uploadKey === "vizcad2024") {
                            setShowUploadModal(false)
                            setShowUploadForm(true)
                            setUploadKey("")
                          } else {
                            alert("Invalid upload key!")
                          }
                        }}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

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
                          placeholder="0 for free"
                          value={uploadFormData.price}
                          onChange={(e) => setUploadFormData({...uploadFormData, price: parseFloat(e.target.value) || 0})}
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
                          width={200}
                          height={200}
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
                          setUploadFormData({name: "", description: "", category: "", price: 0, tags: [], file: null, thumbnail: null, thumbnailError: false})
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredModels.map((model) => (
                  <Card key={model.id} className="group hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col aspect-square">
                    <div className="relative overflow-hidden rounded-t-lg">
                      <div className="w-full aspect-square bg-muted flex items-center justify-center">
                        {model.thumbnail_url ? (
                          <img 
                            src={model.thumbnail_url} 
                            alt={model.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="h-12 w-12 text-muted-foreground" />
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
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Preview
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
                      {(!model.price || model.price === 0) && (
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
                              <div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center">
                                <Package className="h-16 w-16 text-muted-foreground" />
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
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Preview in VizCad
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => handleDownload(model)}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </Button>
                                <Button variant="outline" size="icon">
                                  <Heart className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon">
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
                  <Card key={model.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                          {model.thumbnail_url ? (
                            <img 
                              src={model.thumbnail_url} 
                              alt={model.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="h-8 w-8 text-muted-foreground" />
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
                            <Button size="sm" onClick={() => handlePreview(model)}>
                              <Eye className="h-4 w-4 mr-1" />
                              Preview
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
    </div>
  )
}

export default StorePage