import { createFileRoute, Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Zap, Users, Eye, Monitor, ArrowRight, Box } from "lucide-react"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    // Ana sayfa kapsayıcısı
    <div className="min-h-screen bg-white">
      
      {/* DÜZELTME: 
        Gereksiz katmanlar kaldırıldı. Her bir <section> artık ana div'in doğrudan altında,
        daha temiz ve doğrusal bir yapıda yer alıyor.
      */}

      {/* Hero ve Özellikler Bölümü */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="flex flex-col space-y-20">

            {/* Üst Kısım - Ana İçerik */}
            <div className="space-y-8 text-center">
              <div className="space-y-6">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                  Design with precision and ease
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-3xl mx-auto">
                  Professional CAD software that empowers engineers and designers to create, collaborate, and innovate
                  with unmatched precision and efficiency.
                </p>
              </div>
              <div>
                <Button
                  asChild
                  className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 text-lg font-semibold rounded-lg"
                >
                  <Link to="/app" className="flex items-center gap-2">
                    Start Now
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Alt Kısım - Temel Özellikler */}
            <div className="space-y-8">
              <h2 className="text-3xl font-semibold text-gray-900 text-center">Explore key features</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 pt-6">
                {/* Precision Modeling */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Precision Modeling</h3>
                    <p className="text-gray-600">
                      Advanced parametric modeling tools for creating complex geometries with mathematical precision.
                    </p>
                  </div>
                </div>
                {/* Real-time Collaboration */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Real-time Collaboration</h3>
                    <p className="text-gray-600">
                      Work seamlessly with your team in real-time, sharing designs and feedback instantly.
                    </p>
                  </div>
                </div>
                {/* Advanced Visualization */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Eye className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Advanced Visualization</h3>
                    <p className="text-gray-600">
                      Photorealistic rendering and interactive 3D visualization for better design communication.
                    </p>
                  </div>
                </div>
                {/* Cross-platform Compatibility */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Monitor className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Cross-platform Compatibility</h3>
                    <p className="text-gray-600">
                      Access your designs anywhere with native support for Windows, Mac, and web browsers.
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* About Us Section */}
      <section id="about" className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-semibold text-gray-900 mb-8">About VizCad</h2>
          <div className="space-y-6 text-lg text-gray-600 leading-relaxed">
            <p>
              At VizCad, we believe that great design should be accessible to everyone. Our mission is to democratize
              professional CAD software by providing powerful, intuitive tools that enable engineers, architects, and
              designers to bring their visions to life.
            </p>
            <p>
              Founded by a team of industry veterans with decades of experience in CAD development, VizCad combines
              cutting-edge technology with user-centered design principles. We're committed to continuous innovation and
              helping our users achieve their design goals with unprecedented efficiency and precision.
            </p>
          </div>
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 text-lg font-semibold rounded-lg"
            >
              <Link to="/app" className="flex items-center gap-2">
                Start Now
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-semibold text-gray-900 mb-8">Get in Touch</h2>
          <div className="space-y-4 text-lg text-gray-600">
            <p>Have questions about VizCad? We'd love to hear from you.</p>
            <div className="space-y-2">
              <p>
                Email:{" "}
                <a href="mailto:hello@vizcad.com" className="text-orange-500 hover:text-orange-600">
                  hello@vizcad.com
                </a>
              </p>
              <p>
                Phone:{" "}
                <a href="tel:+1-555-0123" className="text-orange-500 hover:text-orange-600">
                  +1 (555) 012-3456
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-2">
              <Box className="h-6 w-6 text-gray-900" />
              <span className="text-lg font-semibold text-gray-900">VizCad</span>
            </div>
            <div className="text-center text-gray-500">
              <p>&copy; 2025 VizCad. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}