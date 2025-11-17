import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload, Download, Loader2, FileCheck, AlertCircle } from "lucide-react"
import { Scene, Mesh, VertexData, StandardMaterial, Color3, NullEngine } from "@babylonjs/core"
import { GLTF2Export } from "@babylonjs/serializers"

interface ConversionProgress {
  stage: string
  progress: number
}

export default function StepToGlbConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ConversionProgress | null>(null)
  const [glbBlob, setGlbBlob] = useState<Blob | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      const ext = selectedFile.name.toLowerCase()
      if (ext.endsWith(".step") || ext.endsWith(".stp")) {
        setFile(selectedFile)
        setError(null)
        setGlbBlob(null)
      } else {
        setError("Lütfen geçerli bir STEP dosyası seçin (.step veya .stp)")
        setFile(null)
      }
    }
  }

  const convertStepToGlb = async () => {
    if (!file) return

    setIsConverting(true)
    setError(null)
    setProgress({ stage: "STEP dosyası yükleniyor...", progress: 10 })

    try {
      // OCCT kütüphanesini dinamik olarak yükle
      setProgress({ stage: "OCCT kütüphanesi başlatılıyor...", progress: 20 })
      const occtimportjs = (await import("occt-import-js" as any)).default

      // WASM dosyalarının konumunu belirt
      const occt = await occtimportjs({
        locateFile: (path: string) => {
          // WASM dosyalarını node_modules'ten direkt yükle
          if (path.endsWith('.wasm') || path.endsWith('.data')) {
            return `https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/${path}`
          }
          return path
        }
      })

      // Dosyayı ArrayBuffer olarak oku
      setProgress({ stage: "Dosya okunuyor...", progress: 30 })
      const arrayBuffer = await file.arrayBuffer()
      const fileBuffer = new Uint8Array(arrayBuffer)

      // STEP dosyasını mesh verisine dönüştür
      setProgress({ stage: "STEP dönüştürülüyor...", progress: 50 })
      const result = occt.ReadStepFile(fileBuffer, {
        linearUnit: "millimeter",
        linearDeflectionType: "bounding_box_ratio",
        linearDeflection: 0.001,
      })

      if (!result.success) {
        throw new Error("STEP dosyası işlenemedi")
      }

      // GLB formatına dönüştür ve blob olarak kaydet
      setProgress({ stage: "GLB dosyası oluşturuluyor...", progress: 70 })

      // Babylon.js null engine oluştur (headless, görselleştirme yok)
      const engine = new NullEngine()
      const scene = new Scene(engine)

      // OCCT mesh verilerini Babylon.js mesh'e dönüştür
      if (result.meshes && Array.isArray(result.meshes)) {
        result.meshes.forEach((meshData: any, index: number) => {
          const babylonMesh = new Mesh(`mesh_${index}`, scene)

          // VertexData oluştur
          const vertexData = new VertexData()

          // Pozisyonları ayarla
          if (meshData.attributes?.position?.array) {
            vertexData.positions = Array.from(meshData.attributes.position.array)
          }

          // Normalleri ayarla
          if (meshData.attributes?.normal?.array) {
            vertexData.normals = Array.from(meshData.attributes.normal.array)
          }

          // İndeksleri ayarla
          if (meshData.index?.array) {
            vertexData.indices = Array.from(meshData.index.array)
          }

          // VertexData'yı mesh'e uygula
          vertexData.applyToMesh(babylonMesh)

          // Renk bilgisini al
          let color = new Color3(0.5, 0.5, 0.5) // Varsayılan gri

          if (meshData.color) {
            // meshData.color bir array ise [r, g, b] (0-1 arası)
            if (Array.isArray(meshData.color)) {
              color = new Color3(
                meshData.color[0] || 0.5,
                meshData.color[1] || 0.5,
                meshData.color[2] || 0.5
              )
            }
            // Eğer sayı ise (hex) RGB'ye çevir
            else if (typeof meshData.color === 'number') {
              const r = ((meshData.color >> 16) & 255) / 255
              const g = ((meshData.color >> 8) & 255) / 255
              const b = (meshData.color & 255) / 255
              color = new Color3(r, g, b)
            }
            // Eğer obje ise {r, g, b} formatında
            else if (typeof meshData.color === 'object' && meshData.color.r !== undefined) {
              color = new Color3(
                meshData.color.r || 0.5,
                meshData.color.g || 0.5,
                meshData.color.b || 0.5
              )
            }
          }

          // Materyal oluştur
          const material = new StandardMaterial(`material_${index}`, scene)
          material.diffuseColor = color
          material.backFaceCulling = false // İki taraflı render
          babylonMesh.material = material

          // Mesh adını ayarla
          if (meshData.name) {
            babylonMesh.name = meshData.name
          }
        })
      }

      // GLB'ye export et
      setProgress({ stage: "GLB export ediliyor...", progress: 90 })

      const glbData = await GLTF2Export.GLBAsync(scene, "model")
      const blob = glbData.glTFFiles["model.glb"] as Blob

      // Engine'i temizle
      engine.dispose()
      setGlbBlob(blob)
      setProgress({ stage: "Dönüşüm tamamlandı!", progress: 100 })

      // Otomatik indirme başlat
      setTimeout(() => downloadGlb(blob), 500)
    } catch (err) {
      console.error("Dönüştürme hatası:", err)
      setError(err instanceof Error ? err.message : "Dönüştürme başarısız oldu")
    } finally {
      setIsConverting(false)
    }
  }

  const downloadGlb = (blob?: Blob) => {
    const blobToDownload = blob || glbBlob
    if (!blobToDownload || !file) return

    const url = URL.createObjectURL(blobToDownload)
    const link = document.createElement("a")
    link.href = url
    link.download = file.name.replace(/\.(step|stp)$/i, ".glb")
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground">STEP → GLB Dönüştürücü</h1>
        <p className="text-lg text-muted-foreground">
          STEP CAD dosyalarınızı GLB formatına dönüştürün
        </p>
      </div>

      {/* Dosya Yükleme Alanı */}
      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center space-y-4 bg-card hover:border-primary/50 transition-colors">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Upload className="w-8 h-8 text-primary" />
          </div>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".step,.stp"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            size="lg"
            className="gap-2"
          >
            <Upload className="w-5 h-5" />
            STEP Dosyası Seç
          </Button>
        </div>

        {file && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <FileCheck className="w-4 h-4 text-green-500" />
            <span>{file.name}</span>
          </div>
        )}
      </div>

      {/* Hata Mesajı */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* İlerleme */}
      {progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{progress.stage}</span>
            <span className="font-medium">{progress.progress}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* İşlem Butonu */}
      <div className="flex gap-4 justify-center">
        <Button
          onClick={convertStepToGlb}
          disabled={!file || isConverting}
          size="lg"
          className="gap-2"
        >
          {isConverting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Dönüştürülüyor...
            </>
          ) : (
            <>
              <FileCheck className="w-5 h-5" />
              GLB'ye Dönüştür ve İndir
            </>
          )}
        </Button>
      </div>

      {/* Bilgi Bölümü */}
      <div className="bg-muted/50 rounded-lg p-6 space-y-3">
        <h3 className="font-semibold text-foreground">STEP → GLB Dönüşümü Hakkında</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• STEP dosyaları mühendislikte kullanılan hassas CAD formatlarıdır</li>
          <li>• GLB dosyaları web ve mobil görüntüleme için optimize edilmiş 3D modellerdir</li>
          <li>• Dönüşüm tamamen tarayıcınızda gerçekleşir - sunucuya yükleme yapılmaz</li>
          <li>• Desteklenen formatlar: .step, .stp</li>
          <li>• Dönüşüm tamamlandığında dosya otomatik olarak indirilir</li>
        </ul>
      </div>
    </div>
  )
}