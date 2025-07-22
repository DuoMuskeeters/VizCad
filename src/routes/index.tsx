import { createFileRoute, Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { ArrowRight, Box, Monitor, Smartphone, Tablet, Zap, Users, Eye, Globe } from "lucide-react"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* HERO SECTION - Gradient Background */}
      <section className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700 text-white overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-6">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">View your designs now</h1>
                <p className="text-xl text-blue-100 leading-relaxed max-w-2xl">
                  VizCad is free to use. Upload your STL files and start visualizing your 3D models instantly with our
                  powerful web-based viewer.
                </p>
              </div>
              <div>
                <Button
                  asChild
                  size="lg"
                  className="bg-cyan-500 hover:bg-cyan-600 text-white px-8 py-4 text-lg font-semibold rounded-lg shadow-lg"
                >
                  <Link to="/app" className="flex items-center gap-2">
                    Get started viewing
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="relative">
              {/* 3D Platform Illustration with Icons */}
              <div className="relative w-full h-96 flex items-center justify-center">
                <div className="absolute inset-0 bg-white/10 rounded-3xl backdrop-blur-sm border border-white/20"></div>
                <div className="relative z-10 grid grid-cols-3 gap-8 p-8">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-16 h-16 bg-cyan-400 rounded-2xl flex items-center justify-center">
                      <Box className="w-8 h-8 text-white" />
                    </div>
                    <div className="w-12 h-12 bg-blue-400 rounded-xl flex items-center justify-center">
                      <Monitor className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-20 h-20 bg-purple-400 rounded-3xl flex items-center justify-center">
                      <Globe className="w-10 h-10 text-white" />
                    </div>
                    <div className="w-14 h-14 bg-indigo-400 rounded-2xl flex items-center justify-center">
                      <Eye className="w-7 h-7 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-16 h-16 bg-pink-400 rounded-2xl flex items-center justify-center">
                      <Zap className="w-8 h-8 text-white" />
                    </div>
                    <div className="w-12 h-12 bg-orange-400 rounded-xl flex items-center justify-center">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATISTICS SECTION */}
      <section className="bg-slate-800 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            <div className="space-y-2">
              <div className="text-3xl lg:text-4xl font-bold text-cyan-400">1000+</div>
              <div className="text-gray-300">Active Users</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl lg:text-4xl font-bold text-cyan-400">50+</div>
              <div className="text-gray-300">File Formats</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl lg:text-4xl font-bold text-cyan-400">24/7</div>
              <div className="text-gray-300">Availability</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl lg:text-4xl font-bold text-cyan-400">100%</div>
              <div className="text-gray-300">Web-based</div>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN VIEWER SECTION */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">
                Easily view and share designs in your browser.
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                VizCad makes it easy to share views of your designs and collaborate remotely. Upload STL files and start
                visualizing immediately.
              </p>
              <Button asChild className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg">
                <Link to="/app">Get started viewing</Link>
              </Button>
            </div>
            <div className="relative">
              {/* Browser Mockup */}
              <div className="bg-white rounded-lg shadow-2xl border border-gray-200">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
                  <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <div className="ml-4 text-sm text-gray-500">vizcad.com/viewer</div>
                </div>
                <div className="p-6 bg-gray-100 h-64 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <Box className="w-16 h-16 text-gray-400 mx-auto" />
                    <div className="text-gray-600">3D Model Viewer</div>
                    <div className="text-sm text-gray-500">STL • OBJ • PLY</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="relative order-2 lg:order-1">
              {/* Annotation Mockup */}
              <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      1
                    </div>
                    <div className="text-sm text-gray-600">Critical dimension check</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      2
                    </div>
                    <div className="text-sm text-gray-600">Surface quality review</div>
                  </div>
                  <div className="bg-gray-100 h-32 rounded-lg flex items-center justify-center">
                    <Eye className="w-12 h-12 text-gray-400" />
                  </div>
                  <div className="flex gap-2">
                    <div className="px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs">Pencil</div>
                    <div className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">Arrow</div>
                    <div className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">Cloud</div>
                    <div className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">Text</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-6 order-1 lg:order-2">
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">Get feedback faster.</h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                Quickly get the feedback you need with VizCad's lightweight annotation and drawing tools. Share your 3D
                models instantly.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                  <span className="text-gray-700">Real-time 3D visualization</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                  <span className="text-gray-700">Instant file upload</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                  <span className="text-gray-700">Cross-platform compatibility</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DEVICE COMPATIBILITY SECTION */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="relative">
              {/* Device Mockups */}
              <div className="flex items-center justify-center space-x-8">
                <div className="space-y-4">
                  <div className="w-32 h-20 bg-gray-800 rounded-lg flex items-center justify-center">
                    <Monitor className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-center text-sm text-gray-600">Desktop</div>
                </div>
                <div className="space-y-4">
                  <div className="w-20 h-28 bg-gray-800 rounded-xl flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-center text-sm text-gray-600">Mobile</div>
                </div>
                <div className="space-y-4">
                  <div className="w-24 h-18 bg-gray-800 rounded-lg flex items-center justify-center">
                    <Tablet className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-center text-sm text-gray-600">Tablet</div>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">View on any device</h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                VizCad allows you to access and collaborate on your designs on any device or operating system. No
                downloads required.
              </p>
              <Button
                asChild
                variant="outline"
                className="border-cyan-500 text-cyan-600 hover:bg-cyan-50 px-6 py-3 rounded-lg bg-transparent"
              >
                <Link to="/app">Get Started Now →</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FILE FORMATS SECTION */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">Any 3D file format</h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                VizCad supports most 3D file formats, including STL, OBJ, PLY, and many others. Upload and view your
                models instantly.
              </p>
              <Button asChild variant="link" className="text-cyan-600 hover:text-cyan-700 p-0 text-lg">
                <Link to="/app">Learn more...</Link>
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {/* File format icons */}
              <div className="bg-red-100 p-6 rounded-lg text-center hover:bg-red-200 transition-colors">
                <div className="text-2xl font-bold text-red-600 mb-2">STL</div>
                <div className="text-xs text-red-500">Stereolithography</div>
              </div>
              <div className="bg-orange-100 p-6 rounded-lg text-center hover:bg-orange-200 transition-colors">
                <div className="text-2xl font-bold text-orange-600 mb-2">OBJ</div>
                <div className="text-xs text-orange-500">Wavefront</div>
              </div>
              <div className="bg-blue-100 p-6 rounded-lg text-center hover:bg-blue-200 transition-colors">
                <div className="text-2xl font-bold text-blue-600 mb-2">PLY</div>
                <div className="text-xs text-blue-500">Polygon File</div>
              </div>
              <div className="bg-yellow-100 p-6 rounded-lg text-center hover:bg-yellow-200 transition-colors">
                <div className="text-2xl font-bold text-yellow-600 mb-2">3MF</div>
                <div className="text-xs text-yellow-500">3D Manufacturing</div>
              </div>
              <div className="bg-purple-100 p-6 rounded-lg text-center hover:bg-purple-200 transition-colors">
                <div className="text-2xl font-bold text-purple-600 mb-2">X3D</div>
                <div className="text-xs text-purple-500">Extensible 3D</div>
              </div>
              <div className="bg-green-100 p-6 rounded-lg text-center hover:bg-green-200 transition-colors">
                <div className="text-2xl font-bold text-green-600 mb-2">GLTF</div>
                <div className="text-xs text-green-500">GL Transmission</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-20 bg-slate-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="space-y-8">
            <h2 className="text-3xl lg:text-4xl font-bold">Ready to get started?</h2>
            <p className="text-xl text-gray-300 leading-relaxed">
              Learn how our platform can help your company visualize 3D designs, compare models, or connect with the
              VizCad Community.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
              <div className="bg-slate-700 p-6 rounded-lg hover:bg-slate-600 transition-colors">
                <h3 className="font-semibold text-lg mb-2">VizCad Viewer</h3>
                <Button asChild variant="link" className="text-cyan-400 hover:text-cyan-300 p-0 text-sm">
                  <Link to="/app">START FREE →</Link>
                </Button>
              </div>
              <div className="bg-slate-700 p-6 rounded-lg hover:bg-slate-600 transition-colors">
                <h3 className="font-semibold text-lg mb-2">VizCad Pro</h3>
                <Button variant="link" className="text-cyan-400 hover:text-cyan-300 p-0 text-sm">
                  LEARN MORE →
                </Button>
              </div>
              <div className="bg-slate-700 p-6 rounded-lg hover:bg-slate-600 transition-colors">
                <h3 className="font-semibold text-lg mb-2">Partners + SDKs</h3>
                <Button variant="link" className="text-cyan-400 hover:text-cyan-300 p-0 text-sm">
                  EXPLORE PERKS →
                </Button>
              </div>
              <div className="bg-slate-700 p-6 rounded-lg hover:bg-slate-600 transition-colors">
                <h3 className="font-semibold text-lg mb-2">Community</h3>
                <Button variant="link" className="text-cyan-400 hover:text-cyan-300 p-0 text-sm">
                  SIGN UP →
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT SECTION */}
      <section id="about" className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-8">About VizCad</h2>
          <div className="space-y-6 text-lg text-gray-600 leading-relaxed">
            <p>
              At VizCad, our mission is to democratize professional CAD visualization by providing powerful, intuitive
              tools that enable engineers, architects, and designers to view and share their 3D models effortlessly.
            </p>
            <p>
              Founded by industry veterans, VizCad combines cutting-edge web technology with user-centered design to
              help you visualize your designs with unprecedented ease and accessibility.
            </p>
          </div>
        </div>
      </section>

      {/* CONTACT SECTION */}
      <section id="contact" className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-8">Get in Touch</h2>
          <div className="space-y-4 text-lg text-gray-600">
            <p>Have questions about VizCad? We'd love to hear from you.</p>
            <div className="space-y-2">
              <p>
                Email:{" "}
                <a href="mailto:hello@vizcad.com" className="text-cyan-600 hover:text-cyan-700">
                  hello@vizcad.com
                </a>
              </p>
              <p>
                Phone:{" "}
                <a href="tel:+1-555-0123" className="text-cyan-600 hover:text-cyan-700">
                  +1 (555) 012-3456
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-800 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Box className="h-6 w-6" />
                <span className="text-lg font-semibold">VizCad</span>
              </div>
              <p className="text-gray-400 text-sm">
                Professional 3D visualization made simple and accessible for everyone.
              </p>
            </div>
            <div className="space-y-4">
              <h4 className="font-semibold">Product</h4>
              <div className="space-y-2 text-sm text-gray-400">
                <div>Viewer</div>
                <div>Features</div>
                <div>Pricing</div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-semibold">Support</h4>
              <div className="space-y-2 text-sm text-gray-400">
                <div>Documentation</div>
                <div>Help Center</div>
                <div>Contact</div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-semibold">Company</h4>
              <div className="space-y-2 text-sm text-gray-400">
                <div>About</div>
                <div>Blog</div>
                <div>Careers</div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400 text-sm">
            <p>&copy; 2025 VizCad. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
