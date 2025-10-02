import { createFileRoute } from '@tanstack/react-router'
import type React from "react"
import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, Download, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react"

interface ProcessingStep {
  id: number
  title: string
  status: "pending" | "processing" | "completed" | "error"
}


export const Route = createFileRoute('/viewEmbed')({
  component: ViewEmbed,
})

export default function ViewEmbed() {
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processedData, setProcessedData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [steps, setSteps] = useState<ProcessingStep[]>([
    { id: 1, title: "Upload Data", status: "pending" },
    { id: 2, title: "Process ViewEmbed", status: "pending" },
    { id: 3, title: "Generate Result", status: "pending" },
  ])

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)
    setError(null)
    setProcessedData(null)
    setProgress(0)

    // Update steps
    const newSteps = [...steps]
    newSteps[0].status = "completed"
    newSteps[1].status = "pending"
    newSteps[2].status = "pending"
    setSteps(newSteps)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const processViewEmbed = async () => {
    if (!file) return

    setIsProcessing(true)
    setError(null)

    // Update step 2 to processing
    const newSteps = [...steps]
    newSteps[1].status = "processing"
    setSteps(newSteps)

    try {
      // Simulate processing with progress
      for (let i = 0; i <= 100; i += 10) {
        setProgress(i)
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      // Simulate ViewEmbed processing
      const mockResult = `ViewEmbed Result for ${file.name}\n\nProcessed at: ${new Date().toISOString()}\nFile size: ${file.size} bytes\nFile type: ${file.type}\n\n[ViewEmbed data would be here...]`

      setProcessedData(mockResult)

      // Update steps to completed
      const finalSteps = [...steps]
      finalSteps[1].status = "completed"
      finalSteps[2].status = "completed"
      setSteps(finalSteps)
    } catch (err) {
      setError("Processing failed. Please try again.")
      const errorSteps = [...steps]
      errorSteps[1].status = "error"
      setSteps(errorSteps)
    } finally {
      setIsProcessing(false)
    }
  }

  const downloadResult = () => {
    if (!processedData) return

    const blob = new Blob([processedData], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `viewembed-result-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const resetTool = () => {
    setFile(null)
    setIsProcessing(false)
    setProgress(0)
    setProcessedData(null)
    setError(null)
    setSteps([
      { id: 1, title: "Upload Data", status: "pending" },
      { id: 2, title: "Process ViewEmbed", status: "pending" },
      { id: 3, title: "Generate Result", status: "pending" },
    ])
  }

  const getStepIcon = (step: ProcessingStep) => {
    switch (step.status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-primary" />
      case "processing":
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />
      case "error":
        return <AlertCircle className="w-5 h-5 text-destructive" />
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 pt-20 sm:pt-24 lg:pt-28"> {/* Header yüksekliği kadar padding-top ekledim */}
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">ViewEmbed Tool</h1>
          <p className="text-lg text-muted-foreground">Upload your data, process ViewEmbed, and download the result</p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-8">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-card border-2 border-border mb-2">
                    {getStepIcon(step)}
                  </div>
                  <span className="text-sm font-medium text-foreground">{step.title}</span>
                </div>
                {index < steps.length - 1 && <div className="w-16 h-0.5 bg-border mx-4" />}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload Data
              </CardTitle>
              <CardDescription>Select or drag and drop your data file</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-2">Drag and drop your file here, or click to browse</p>
                <p className="text-xs text-muted-foreground">Supports: JSON, CSV, TXT, XML</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".json,.csv,.txt,.xml"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0]
                  if (selectedFile) handleFileSelect(selectedFile)
                }}
              />

              {file && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <FileText className="w-4 h-4 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Badge variant="secondary">Ready</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Processing Section */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className={`w-5 h-5 ${isProcessing ? "animate-spin" : ""}`} />
                Process ViewEmbed
              </CardTitle>
              <CardDescription>Transform your data with ViewEmbed processing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={processViewEmbed} disabled={!file || isProcessing} className="w-full" size="lg">
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Start Processing"
                )}
              </Button>

              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="w-full" />
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {processedData && (
                <div className="flex items-center gap-2 p-3 bg-primary/10 text-primary rounded-lg">
                  <CheckCircle className="w-4 h-4" />
                  <p className="text-sm">Processing completed successfully!</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Download Section */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Download Result
              </CardTitle>
              <CardDescription>Get your processed ViewEmbed data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={downloadResult}
                disabled={!processedData}
                className="w-full"
                size="lg"
                variant={processedData ? "default" : "secondary"}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Result
              </Button>

              <Button onClick={resetTool} variant="outline" className="w-full bg-transparent">
                Start New Process
              </Button>

              {processedData && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">Result Preview</p>
                  <p className="text-xs text-muted-foreground line-clamp-3">{processedData.substring(0, 100)}...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
