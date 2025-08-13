"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Box,
  Upload,
  Eye,
  Palette,
  Camera,
  Lightbulb,
  Play,
  Check,
  Zap,
  Globe,
  Users,
  Mail,
  Phone,
  MapPin,
  Github,
  Twitter,
  Linkedin,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const scrollToVideo = () => {
    const videoSection = document.getElementById("video-demo");
    if (videoSection) {
      videoSection.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* HERO SECTION */}
      <section className="relative bg-gradient-to-br from-gray-50 to-white pt-32 pb-16 overflow-hidden min-h-screen flex items-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(6,182,212,0.1),transparent_50%)]"></div>

        {/* Background decorative elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-cyan-500/3 to-blue-500/3 rounded-full blur-3xl"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-10">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-50 text-cyan-700 rounded-full text-sm font-medium border border-cyan-200 shadow-sm">
                  <Zap className="w-4 h-4" />
                  Professional 3D Visualization Platform
                </div>
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight">
                  Visualize Your
                  <span className="block text-cyan-500">3D Models</span>
                  <span className="block">Instantly</span>
                </h1>
                <p className="text-xl sm:text-2xl text-gray-600 leading-relaxed max-w-2xl">
                  Upload STL, OBJ, PLY files and create stunning photorealistic
                  renders with professional lighting, materials, and camera
                  controls. No software installation required.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-6">
                <Button
                  asChild
                  size="lg"
                  className="bg-cyan-500 hover:bg-cyan-600 text-white px-10 py-5 text-xl font-semibold rounded-xl shadow-xl hover:shadow-2xl transition-all transform hover:scale-105"
                >
                  <Link to="/app" className="flex items-center gap-3">
                    <Upload className="w-6 h-6" />
                    Start Rendering Now
                    <ArrowRight className="w-6 h-6" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 px-10 py-5 text-xl font-semibold rounded-xl bg-transparent hover:border-gray-400 transition-all"
                  onClick={scrollToVideo}
                >
                  <Play className="w-6 h-6 mr-3" />
                  Watch Demo
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-8 text-base text-gray-500">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <span>Free to use</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <span>No installation required</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <span>Professional results</span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-8 pt-8 border-t border-gray-200">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    10K+
                  </div>
                  <div className="text-sm text-gray-600">Models Rendered</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    50+
                  </div>
                  <div className="text-sm text-gray-600">Countries</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    99.9%
                  </div>
                  <div className="text-sm text-gray-600">Uptime</div>
                </div>
              </div>
            </div>

            <div className="relative group">
              {/* Application Preview - Larger */}
              <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden group-hover:scale-105 transition-transform duration-700 ease-out">
                <div className="flex items-center gap-2 px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <div className="ml-4 text-sm text-gray-500 font-mono">
                    vizcad.com/app
                  </div>
                </div>
                <div className="p-8">
                  <div className="flex gap-6 mb-6">
                    <div className="flex-1 space-y-4">
                      <div className="flex gap-2">
                        <div className="px-4 py-2 bg-cyan-100 text-cyan-700 rounded-full text-sm font-medium">
                          Scenes
                        </div>
                        <div className="px-4 py-2 bg-gray-100 text-gray-600 rounded-full text-sm">
                          Lights
                        </div>
                        <div className="px-4 py-2 bg-gray-100 text-gray-600 rounded-full text-sm">
                          Camera
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="h-20 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-cyan-200 flex items-center justify-center">
                          <Upload className="w-8 h-8 text-cyan-500" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="h-16 bg-gradient-to-br from-gray-50 to-white rounded-lg border border-cyan-500"></div>
                          <div className="h-16 bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg border"></div>
                        </div>
                      </div>
                    </div>
                    <div className="flex-[2] bg-gray-100 rounded-xl flex items-center justify-center min-h-[200px]">
                      <div className="text-center space-y-3">
                        <Box className="w-16 h-16 text-gray-400 mx-auto" />
                        <div className="text-lg text-gray-600 font-medium">
                          3D Viewer
                        </div>
                        <div className="text-sm text-gray-500">
                          Upload your model to get started
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Elements - All animate together on group hover */}
              <div className="absolute -top-6 -right-6 w-20 h-20 bg-cyan-500 rounded-3xl flex items-center justify-center shadow-xl group-hover:animate-pulse transition-all duration-300 group-hover:shadow-2xl">
                <Camera className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -bottom-6 -left-6 w-16 h-16 bg-purple-500 rounded-2xl flex items-center justify-center shadow-xl group-hover:animate-pulse transition-all duration-300 group-hover:shadow-2xl">
                <Lightbulb className="w-8 h-8 text-white" />
              </div>
              <div className="absolute top-1/2 -left-4 w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center shadow-lg group-hover:animate-bounce transition-all duration-300 group-hover:shadow-xl">
                <Palette className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Gradient transition to next section */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-b from-transparent to-white pointer-events-none"></div>
      </section>

      {/* VIDEO DEMO SECTION - Closer to hero */}
      <section id="video-demo" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              See VizCad in Action
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Watch how easy it is to upload your 3D models and create
              professional renders in minutes, not hours.
            </p>
          </div>

          <div className="relative max-w-5xl mx-auto">
            <div className="relative bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-200">
              <div className="aspect-video bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center relative">
                <div className="text-center space-y-6 z-10">
                  <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mx-auto backdrop-blur-sm hover:bg-white/20 transition-colors cursor-pointer">
                    <Play className="w-12 h-12 text-white ml-1" />
                  </div>
                  <div className="text-white">
                    <h3 className="text-2xl font-semibold mb-3">
                      3D Model to Render in 60 Seconds
                    </h3>
                    <p className="text-gray-300 text-lg">
                      From upload to professional visualization
                    </p>
                  </div>
                </div>
                {/* Video overlay effects */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
              </div>
            </div>

            {/* Key features below video */}
            <div className="grid md:grid-cols-3 gap-8 mt-16">
              <div className="text-center">
                <div className="w-16 h-16 bg-cyan-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-cyan-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Fast Upload
                </h3>
                <p className="text-gray-600">
                  Drag & drop your models instantly
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Eye className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Real-time Visualization
                </h3>
                <p className="text-gray-600">See changes as you make them</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Professional Rendering
                </h3>
                <p className="text-gray-600">
                  Studio-quality results in minutes
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section
        id="features"
        className="py-24 bg-white relative overflow-hidden"
      >
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-cyan-500/5 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-tl from-purple-500/5 to-transparent rounded-full blur-3xl"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-50 text-cyan-700 rounded-full text-sm font-medium border border-cyan-200 mb-6">
              <Zap className="w-4 h-4" />
              Available Now
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Powerful 3D Visualization Tools
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Start with our core visualization features today, with advanced
              rendering capabilities coming soon.
            </p>
          </div>

          {/* Current Features - Staggered Layout */}
          <div className="grid lg:grid-cols-3 gap-8 mb-24">
            {/* Left Column - 2 cards */}
            <div className="space-y-8">
              <div className="group bg-gradient-to-br from-white to-gray-50 p-8 rounded-3xl shadow-lg border border-gray-100 hover:shadow-2xl hover:border-cyan-200 transition-all duration-300 hover:-translate-y-2">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Instant Upload
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Drag and drop your STL, OBJ, PLY, or 3MF files directly into
                  the browser. No software installation or account creation
                  required.
                </p>
              </div>

              <div className="group bg-gradient-to-br from-white to-gray-50 p-8 rounded-3xl shadow-lg border border-gray-100 hover:shadow-2xl hover:border-purple-200 transition-all duration-300 hover:-translate-y-2">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Palette className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Studio Scenes
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Professional lighting presets including plain white, 3-point
                  lighting, warm studio, and custom background colors for clean
                  presentations.
                </p>
              </div>
            </div>

            {/* Center Column - 2 cards with offset */}
            <div className="space-y-8 lg:mt-12">
              <div className="group bg-gradient-to-br from-white to-gray-50 p-8 rounded-3xl shadow-lg border border-gray-100 hover:shadow-2xl hover:border-green-200 transition-all duration-300 hover:-translate-y-2">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Eye className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Display Controls
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Toggle wireframe mode, smooth shading,
                  perspective/orthographic views, and coordinate axes. Real-time
                  visualization with instant feedback.
                </p>
              </div>

              <div className="group bg-gradient-to-br from-white to-gray-50 p-8 rounded-3xl shadow-lg border border-gray-100 hover:shadow-2xl hover:border-blue-200 transition-all duration-300 hover:-translate-y-2">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Camera className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Camera Navigation
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Multiple view presets (Front, Back, Left, Right, Top, Bottom,
                  Isometric) with zoom controls and camera reset functionality.
                </p>
              </div>
            </div>

            {/* Right Column - 2 cards */}
            <div className="space-y-8">
              <div className="group bg-gradient-to-br from-white to-gray-50 p-8 rounded-3xl shadow-lg border border-gray-100 hover:shadow-2xl hover:border-orange-200 transition-all duration-300 hover:-translate-y-2">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Fast Performance
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Optimized WebGL rendering for smooth interaction. Works
                  directly in your browser with no plugins or downloads
                  required.
                </p>
              </div>

              <div className="group bg-gradient-to-br from-white to-gray-50 p-8 rounded-3xl shadow-lg border border-gray-100 hover:shadow-2xl hover:border-red-200 transition-all duration-300 hover:-translate-y-2">
                <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Globe className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Cross-Platform
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Works on any device with a modern web browser. Desktop,
                  tablet, or mobile - your 3D models are always accessible.
                </p>
              </div>
            </div>
          </div>

          {/* Coming Soon Section - Redesigned */}
          <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-3xl p-8 border border-cyan-100">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Advanced Features Coming Soon
              </h3>
              <p className="text-gray-600 max-w-2xl mx-auto">
                We're working on powerful new features to make VizCad the
                ultimate 3D visualization platform.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-white/60 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Lightbulb className="w-6 h-6 text-cyan-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">
                  Custom Lighting
                </h4>
                <p className="text-sm text-gray-600">
                  Advanced light positioning and intensity controls
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-white/60 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Camera className="w-6 h-6 text-cyan-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">
                  Camera Settings
                </h4>
                <p className="text-sm text-gray-600">
                  Focal length, aperture, and depth of field
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-white/60 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Palette className="w-6 h-6 text-cyan-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">
                  Material Editor
                </h4>
                <p className="text-sm text-gray-600">
                  Metallic, roughness, and transparency controls
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-white/60 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Box className="w-6 h-6 text-cyan-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">
                  Output Settings
                </h4>
                <p className="text-sm text-gray-600">
                  High-resolution exports and render quality
                </p>
              </div>
            </div>

            <div className="text-center mt-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-100 text-cyan-700 rounded-full text-sm font-medium">
                <Zap className="w-4 h-4" />
                Expected Q2 2025
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT US SECTION */}
      <section id="about" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-6">
                <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">
                  Making 3D Visualization Accessible to Everyone
                </h2>
                <p className="text-lg text-gray-600 leading-relaxed">
                  VizCad was born from the frustration of complex, expensive 3D
                  rendering software. We believe that creating beautiful
                  visualizations of your 3D models shouldn't require extensive
                  knowledge of professional 3D design or expensive software
                  licenses.
                </p>
                <p className="text-lg text-gray-600 leading-relaxed">
                  Our mission is to make professional 3D rendering accessible by
                  providing powerful, intuitive tools that work directly in your
                  web browser. Whether you're an engineer, architect, designer,
                  or hobbyist, VizCad gives you the tools to showcase your work
                  beautifully.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-cyan-500 mb-2">
                    10,000+
                  </div>
                  <div className="text-gray-600">Models Rendered</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-cyan-500 mb-2">
                    50+
                  </div>
                  <div className="text-gray-600">Countries</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-cyan-500 mb-2">
                    99.9%
                  </div>
                  <div className="text-gray-600">Uptime</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-cyan-500 mb-2">
                    24/7
                  </div>
                  <div className="text-gray-600">Available</div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-8 border border-cyan-100">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-cyan-500 rounded-2xl flex items-center justify-center">
                      <Users className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        Our Team
                      </h3>
                      <p className="text-gray-600">
                        Passionate engineers and designers
                      </p>
                    </div>
                  </div>
                  <p className="text-gray-700 leading-relaxed">
                    VizCad is the vision of a mechatronics engineer who combines
                    a passion for 3D visualization with years of experience in
                    the 3d CAD design. Following years of hands-on work, a
                    significant gap in the market was identified with the belief
                    that professional tools should be accessible to everyone. We
                    are committed to continuously developing this platform to
                    serve the creative and technical community.
                  </p>
                  <div className="flex gap-4">
                    <div className="flex -space-x-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full border-2 border-white"></div>
                      <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full border-2 border-white"></div>
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full border-2 border-white"></div>
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full border-2 border-white flex items-center justify-center text-white text-sm font-semibold">
                        +5
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SIMPLIFIED FOOTER */}
      <footer id="contact" className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Company info */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center">
                  <Box className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold">VizCad</span>
              </div>
              <p className="text-gray-400 max-w-md">
                Professional 3D visualization made simple and accessible. Create
                stunning renders directly in your browser.
              </p>
              <div className="flex gap-3">
                <a
                  href="#"
                  className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors"
                >
                  <Twitter className="w-4 h-4" />
                </a>
                <a
                  href="#"
                  className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors"
                >
                  <Linkedin className="w-4 h-4" />
                </a>
                <a
                  href="#"
                  className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors"
                >
                  <Github className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Quick links */}
            <div>
              <h4 className="font-semibold mb-4">Quick Links</h4>
              <div className="space-y-2 text-gray-400">
                <Link
                  to="/app"
                  className="block hover:text-cyan-400 transition-colors"
                >
                  3D Viewer
                </Link>
                <a
                  href="#features"
                  className="block hover:text-cyan-400 transition-colors"
                >
                  Features
                </a>
                <a
                  href="#about"
                  className="block hover:text-cyan-400 transition-colors"
                >
                  About Us
                </a>
              </div>
            </div>

            {/* Contact info */}
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <div className="space-y-3 text-gray-400 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-cyan-400" />
                  <a
                    href="mailto:hello@vizcad.com"
                    className="hover:text-cyan-400 transition-colors"
                  >
                    hello@vizcad.com
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-cyan-400" />
                  <a
                    href="tel:+1-555-0123"
                    className="hover:text-cyan-400 transition-colors"
                  >
                    +1 (555) 012-3456
                  </a>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-cyan-400 mt-0.5" />
                  <div>
                    San Francisco, CA
                    <br />
                    United States
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom section */}
          <div className="mt-8 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-gray-500 text-sm">
              &copy; 2025 VizCad. All rights reserved.
            </div>
            <div className="flex gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-cyan-400 transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-cyan-400 transition-colors">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
