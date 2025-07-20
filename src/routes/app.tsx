import { VtkApp } from "@/components/vtk";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react"; // 1. useState hook'unu import edin

export const Route = createFileRoute("/app")({
  component: AppPage,
});

function AppPage() {
  // 2. Seçilen dosyayı tutmak için bir state oluşturun
  // Başlangıçta null (dosya yok) olarak ayarlanır
  const [file, setFile] = useState<File | null>(null);

  // 3. Dosya input'u değiştiğinde çalışacak fonksiyon
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      // Bir dosya seçildiyse, state'i güncelle
      setFile(event.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-7xl h-[57.5vh] bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden flex items-center justify-center">
        {/* 4. Koşullu Render: file state'i doluysa VtkApp'i, boşsa dosya yükleme ekranını göster */}
        {file ? (
          // Dosya varsa VtkApp çalıştır 
          <VtkApp file={file} />
        ) : (
          // Dosya yoksa, bir yükleme butonu göster
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">VTK Görüntüleyici</h2>
            <p className="text-gray-600 mb-6">
              Lütfen devam etmek için bir dosya seçin.
            </p>
            <label className="cursor-pointer bg-blue-500 text-white px-6 py-2 rounded-md hover:bg-blue-600 transition-colors">
              Dosya Seç
              <input
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}