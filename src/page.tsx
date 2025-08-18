import Header from "../src/components/Header"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />

      <main className="pt-14 sm:pt-16">
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">
              Professional <span className="text-cyan-500">3D Model</span> Viewer
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-6 sm:mb-8 max-w-2xl mx-auto">
              Upload STL, OBJ, PLY, and 3MF files and create stunning photorealistic renders instantly. No installation
              required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="/app"
                className="w-full sm:w-auto bg-cyan-500 hover:bg-cyan-600 text-white font-semibold px-6 sm:px-8 py-3 sm:py-4 rounded-lg transition-all duration-200 hover:shadow-lg text-center"
              >
                Launch VizCad
              </a>
              <button className="w-full sm:w-auto border border-gray-300 hover:border-gray-400 text-gray-700 font-semibold px-6 sm:px-8 py-3 sm:py-4 rounded-lg transition-all duration-200 hover:shadow-md">
                View Examples
              </button>
            </div>
          </div>
        </section>

        <section id="features" className="px-4 sm:px-6 lg:px-8 py-12 sm:py-20 bg-white">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-center text-gray-900 mb-8 sm:mb-12">
              Powerful Features
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              <div className="text-center p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                    />
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Easy Upload</h3>
                <p className="text-gray-600 text-sm sm:text-base">Drag and drop your 3D files or click to browse</p>
              </div>

              <div className="text-center p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Real-time Viewing</h3>
                <p className="text-gray-600 text-sm sm:text-base">Instant 3D visualization with smooth interactions</p>
              </div>

              <div className="text-center p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-shadow sm:col-span-2 lg:col-span-1">
                <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Multiple Formats</h3>
                <p className="text-gray-600 text-sm sm:text-base">Support for STL, OBJ, PLY, and 3MF files</p>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">About VizCad</h2>
            <p className="text-lg sm:text-xl text-gray-600 leading-relaxed">
              VizCad is a professional-grade 3D model viewer that runs entirely in your browser. Built with cutting-edge
              WebGL technology, it provides instant visualization of your 3D models without requiring any software
              installation.
            </p>
          </div>
        </section>

        <section id="contact" className="px-4 sm:px-6 lg:px-8 py-12 sm:py-20 bg-white">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">Get in Touch</h2>
            <p className="text-lg text-gray-600 mb-6 sm:mb-8">
              Have questions or feedback? We'd love to hear from you.
            </p>
            <a
              href="mailto:contact@viz-cad.com"
              className="inline-block bg-cyan-500 hover:bg-cyan-600 text-white font-semibold px-6 sm:px-8 py-3 sm:py-4 rounded-lg transition-all duration-200 hover:shadow-lg"
            >
              Contact Us
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}
