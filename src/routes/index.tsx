"use client"

import { createFileRoute, Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { useEffect } from "react"
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
  Mail,
  Phone,
  MapPin,
  Twitter,
  Linkedin,
} from "lucide-react"

export const Route = createFileRoute("/")({
  component: HomePage,
})

export function HomePage() {
  const { t } = useTranslation()
  // Prevent automatic scrolling to video section on page load
  useEffect(() => {
    // Clear any hash in URL that might cause auto-scroll
    if (window.location.hash === "#video-demo") {
      window.history.replaceState(null, "", window.location.pathname)
    }
    // Scroll to top on component mount
    window.scrollTo(0, 0)
  }, [])

  const scrollToVideo = () => {
    const videoSection = document.getElementById("video-demo")
    if (videoSection) {
      videoSection.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
    }
  }

  const handlePlayVideo = () => {
    const video = document.getElementById("demo-video") as HTMLVideoElement
    const playButton = document.getElementById("video-play-button")

    if (video && playButton) {
      video.play()
      playButton.style.display = "none"
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* HERO SECTION */}
      <section className="relative bg-gradient-to-br from-background to-muted pt-24 pb-16 sm:pt-32 sm:pb-20 xl:pt-32 xl:pb-16 overflow-hidden min-h-screen flex items-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.1),transparent_50%)]"></div>

        {/* Background decorative elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-primary/3 to-primary/3 rounded-full blur-3xl"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="flex flex-col xl:grid xl:grid-cols-2 gap-16 sm:gap-20 xl:gap-16 xl:items-center">
            {/* Sol taraf - Metin içeriği */}
            <div className="space-y-12 sm:space-y-14 xl:space-y-10 text-center xl:text-left">
              <div className="space-y-8 sm:space-y-10 xl:space-y-8">
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-primary/10 text-primary rounded-full text-sm font-medium border border-primary/20 shadow-sm">
                  <Zap className="w-4 h-4" />
                  {t("hero_badge")}
                </div>
                <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-7xl font-bold text-foreground leading-tight text-center xl:text-left">
                  {t("hero_title_1")}
                  <span className="block text-primary">{t("hero_title_2")}</span>
                  <span className="block">{t("hero_title_3")}</span>
                </h1>
                <p className="text-xl sm:text-2xl lg:text-2xl xl:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto xl:max-w-2xl xl:mx-0">
                  {t("hero_desc")}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 justify-center xl:justify-start">
                <Button
                  asChild
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-10 py-5 xl:px-10 xl:py-5 text-xl font-semibold rounded-xl shadow-xl hover:shadow-2xl transition-all transform hover:scale-105"
                >
                  <Link to="/app" className="flex items-center gap-3">
                    <Upload className="w-6 h-6" />
                    {t("hero_cta")}
                    <ArrowRight className="w-6 h-6" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="border-2 border-border text-foreground hover:bg-muted px-10 py-5 xl:px-10 xl:py-5 text-xl font-semibold rounded-xl bg-transparent hover:border-primary/50 transition-all"
                  onClick={scrollToVideo}
                >
                  <Play className="w-6 h-6 mr-3" />
                  {t("hero_demo")}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-8 xl:gap-8 text-base text-muted-foreground justify-center xl:justify-start">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-500" />
                  </div>
                  <span>{t("hero_feature_free")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-500" />
                  </div>
                  <span>{t("hero_feature_no_install")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-500" />
                  </div>
                  <span>{t("hero_feature_pro")}</span>
                </div>
              </div>
            </div>

            {/* Sağ taraf - Uygulama önizlemesi */}
            <div className="relative group flex justify-center xl:justify-start">
              {/* Application Preview */}
              <div className="relative bg-card rounded-2xl xl:rounded-3xl shadow-xl xl:shadow-2xl border border-border overflow-hidden group-hover:scale-105 transition-transform duration-700 ease-out w-full max-w-xl xl:max-w-none hidden xl:block">
                <div className="flex items-center gap-2 px-5 py-4 xl:px-6 xl:py-4 bg-muted border-b border-border">
                  <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <div className="ml-4 text-sm text-muted-foreground font-mono">vizcad.com/app</div>
                </div>
                <div className="p-8 xl:p-8">
                  <div className="flex gap-6 xl:gap-6 mb-6 xl:mb-6">
                    <div className="flex-1 space-y-4 xl:space-y-4">
                      <div className="flex gap-2 xl:gap-2">
                        <div className="px-4 py-2 xl:px-4 xl:py-2 bg-primary/10 text-primary rounded-full text-sm font-medium">
                          Scenes
                        </div>
                        <div className="px-4 py-2 xl:px-4 xl:py-2 bg-muted text-muted-foreground rounded-full text-sm">
                          Lights
                        </div>
                        <div className="px-4 py-2 xl:px-4 xl:py-2 bg-muted text-muted-foreground rounded-full text-sm">
                          Camera
                        </div>
                      </div>
                      <div className="space-y-3 xl:space-y-3">
                        <div className="h-20 xl:h-20 bg-gradient-to-br from-primary/10 to-primary/10 rounded-xl border border-primary/20 flex items-center justify-center">
                          <Upload className="w-8 h-8 xl:w-8 xl:h-8 text-primary" />
                        </div>
                        <div className="grid grid-cols-2 gap-3 xl:gap-3">
                          <div className="h-16 xl:h-16 bg-gradient-to-br from-muted to-card rounded-lg border border-primary"></div>
                          <div className="h-16 xl:h-16 bg-gradient-to-br from-muted to-muted rounded-lg border border-border"></div>
                        </div>
                      </div>
                    </div>
                    <div className="flex-[2] bg-muted rounded-xl flex items-center justify-center min-h-[200px] xl:min-h-[200px]">
                      <div className="text-center space-y-3 xl:space-y-3">
                        <Box className="w-16 h-16 xl:w-16 xl:h-16 text-muted-foreground mx-auto" />
                        <div className="text-lg xl:text-lg text-foreground font-medium">3D Viewer</div>
                        <div className="text-sm xl:text-sm text-muted-foreground">Upload your model to get started</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gradient transition to next section */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-b from-transparent to-background pointer-events-none"></div>
      </section>

      {/* VIDEO DEMO SECTION - Closer to hero */}
      <section id="video-demo" className="py-24 bg-background relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-foreground mb-6">{t("video_title")}</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              {t("video_desc")}
            </p>
          </div>

          <div className="relative max-w-5xl mx-auto">
            <div className="relative bg-card rounded-3xl shadow-2xl overflow-hidden border border-border">
              <div className="aspect-video relative bg-gray-900">
                <video
                  id="demo-video"
                  className="w-full h-full object-cover"
                  preload="metadata"
                  onPlay={() => {
                    const playButton = document.getElementById("video-play-button")
                    if (playButton) playButton.style.display = "none"
                  }}
                  onPause={() => {
                    const playButton = document.getElementById("video-play-button")
                    if (playButton) playButton.style.display = "flex"
                  }}
                  onEnded={() => {
                    const playButton = document.getElementById("video-play-button")
                    if (playButton) playButton.style.display = "flex"
                  }}
                >
                  <source src="/video.mp4" type="video/mp4" />
                  {t("video_no_support")}
                </video>

                {/* Custom Play Button Overlay */}
                <div
                  id="video-play-button"
                  className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer group"
                  onClick={handlePlayVideo}
                >
                  <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm hover:bg-white/20 transition-all duration-300 group-hover:scale-110">
                    <Play className="w-12 h-12 text-white ml-1" />
                  </div>
                </div>

                {/* Video Info Overlay */}
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="text-xl font-semibold mb-1">{t("video_overlay_title")}</h3>
                  <p className="text-gray-300">{t("video_overlay_desc")}</p>
                </div>
              </div>
            </div>

            {/* Key features below video */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8 mt-12 sm:mt-16">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{t("video_feature_1_title")}</h3>
                <p className="text-muted-foreground">{t("video_feature_1_desc")}</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Eye className="w-8 h-8 text-accent" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{t("video_feature_2_title")}</h3>
                <p className="text-muted-foreground">{t("video_feature_2_desc")}</p>
              </div>
              <div className="text-center sm:col-span-2 md:col-span-1">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{t("video_feature_3_title")}</h3>
                <p className="text-muted-foreground">{t("video_feature_3_desc")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="py-24 bg-background relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-primary/5 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-tl from-accent/5 to-transparent rounded-full blur-3xl"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium border border-primary/20 mb-6">
              <Zap className="w-4 h-4 text-primary" />
              {t("features_badge")}
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-foreground mb-6">{t("features_title")}</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              {t("features_desc")}
            </p>
          </div>

          {/* Current Features - Responsive Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 mb-24 justify-items-center">
            {/* Card 1 - Instant Upload */}
            <div className="group bg-gradient-to-br from-card to-muted p-6 lg:p-8 rounded-3xl shadow-lg border border-border hover:shadow-2xl hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 w-full max-w-sm flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-4">{t("features_card_1_title")}</h3>
              <p className="text-base text-muted-foreground leading-relaxed flex-1 flex items-center">
                {t("features_card_1_desc")}
              </p>
            </div>

            {/* Card 2 - Display Controls */}
            <div className="group bg-gradient-to-br from-card to-muted p-6 lg:p-8 rounded-3xl shadow-lg border border-border hover:shadow-2xl hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 w-full max-w-sm flex flex-col items-center text-center lg:mt-12">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Eye className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-4">{t("features_card_2_title")}</h3>
              <p className="text-base text-muted-foreground leading-relaxed flex-1 flex items-center">
                {t("features_card_2_desc")}
              </p>
            </div>

            {/* Card 3 - Fast Performance */}
            <div className="group bg-gradient-to-br from-card to-muted p-6 lg:p-8 rounded-3xl shadow-lg border border-border hover:shadow-2xl hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 w-full max-w-sm flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-4">{t("features_card_3_title")}</h3>
              <p className="text-base text-muted-foreground leading-relaxed flex-1 flex items-center">
                {t("features_card_3_desc")}
              </p>
            </div>

            {/* Card 4 - Studio Scenes */}
            <div className="group bg-gradient-to-br from-card to-muted p-6 lg:p-8 rounded-3xl shadow-lg border border-border hover:shadow-2xl hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 w-full max-w-sm flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Palette className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-4">{t("features_card_4_title")}</h3>
              <p className="text-base text-muted-foreground leading-relaxed flex-1 flex items-center">
                {t("features_card_4_desc")}
              </p>
            </div>

            {/* Card 5 - Camera Navigation */}
            <div className="group bg-gradient-to-br from-card to-muted p-6 lg:p-8 rounded-3xl shadow-lg border border-border hover:shadow-2xl hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 w-full max-w-sm flex flex-col items-center text-center lg:mt-12">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Camera className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-4">{t("features_card_5_title")}</h3>
              <p className="text-base text-muted-foreground leading-relaxed flex-1 flex items-center">
                {t("features_card_5_desc")}
              </p>
            </div>

            {/* Card 6 - Cross-Platform */}
            <div className="group bg-gradient-to-br from-card to-muted p-6 lg:p-8 rounded-3xl shadow-lg border border-border hover:shadow-2xl hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 w-full max-w-sm flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Globe className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-4">{t("features_card_6_title")}</h3>
              <p className="text-base text-muted-foreground leading-relaxed flex-1 flex items-center">
                {t("features_card_6_desc")}
              </p>
            </div>
          </div>

          {/* Coming Soon Section - Redesigned */}
          <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-3xl p-8 border border-primary/10">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-foreground mb-4">{t("features_coming_title")}</h3>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t("features_coming_desc")}
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Lightbulb className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold text-foreground mb-2">{t("features_coming_card_1_title")}</h4>
                <p className="text-sm text-muted-foreground">{t("features_coming_card_1_desc")}</p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Camera className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold text-foreground mb-2">{t("features_coming_card_2_title")}</h4>
                <p className="text-sm text-muted-foreground">{t("features_coming_card_2_desc")}</p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Palette className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold text-foreground mb-2">{t("features_coming_card_3_title")}</h4>
                <p className="text-sm text-muted-foreground">{t("features_coming_card_3_desc")}</p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Box className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold text-foreground mb-2">{t("features_coming_card_4_title")}</h4>
                <p className="text-sm text-muted-foreground">{t("features_coming_card_4_desc")}</p>
              </div>
            </div>

            <div className="text-center mt-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium">
                <Zap className="w-4 h-4 text-primary" />
                {t("features_coming_badge")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT US SECTION */}
      <section id="about" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-6">
                <h2 className="text-3xl lg:text-4xl font-bold text-foreground leading-tight text-center">
                  {t("about_title")}
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  {t("about_desc_1")}
                </p>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  {t("about_desc_2")}
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl p-8 border border-primary/10">
                <div className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
                      <Box className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="text-xl font-bold text-foreground">VizCad</span>
                  </div>
                  <p className="text-muted-foreground max-w-md">
                    {t("about_card_desc")}
                  </p>
                  <div className="flex gap-3">
                    <a
                      href="https://x.com/VizCad0"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-primary hover:bg-primary/80 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <Twitter className="w-4 h-4 text-primary-foreground" />
                    </a>
                    <a
                      href="#"
                      className="w-8 h-8 bg-primary hover:bg-primary/80 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <Linkedin className="w-4 h-4 text-primary-foreground" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SIMPLIFIED FOOTER */}
      <footer id="contact" className="bg-slate-900 dark:bg-slate-950 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Company info */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                  <Box className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold">VizCad</span>
              </div>
              <p className="text-gray-400 max-w-md">
                {t("footer_company_desc")}
              </p>
              <div className="flex gap-3">
                <a
                  href="https://x.com/VizCad0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 bg-primary hover:bg-primary/80 rounded-lg flex items-center justify-center transition-colors"
                >
                  <Twitter className="w-4 h-4 text-primary-foreground" />
                </a>
                <a
                  href="#"
                  className="w-8 h-8 bg-primary hover:bg-primary/80 rounded-lg flex items-center justify-center transition-colors"
                >
                  <Linkedin className="w-4 h-4 text-primary-foreground" />
                </a>
              </div>
            </div>

            {/* Quick links */}
            <div>
              <h4 className="font-semibold mb-4">{t("footer_quick_links")}</h4>
              <div className="space-y-2 text-gray-400">
                <Link to="/app" className="block hover:text-primary transition-colors">
                  {t("nav_launch_app")}
                </Link>
                <a href="#features" className="block hover:text-primary transition-colors">
                  {t("nav_features")}
                </a>
                <a href="#about" className="block hover:text-primary transition-colors">
                  {t("nav_about")}
                </a>
                <Link to="/faq" className="block hover:text-primary transition-colors">
                  {t("nav_faq")}
                </Link>
                <Link to="/contact" className="block hover:text-primary transition-colors">
                  {t("nav_contact")}
                </Link>
              </div>
            </div>

            {/* Contact info */}
            <div>
              <h4 className="font-semibold mb-4">{t("footer_contact")}</h4>
              <div className="space-y-3 text-gray-400 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" />
                  <a href="mailto:info@viz-cad.com" className="hover:text-primary transition-colors">
                    {t("footer_email")}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  <a href="tel:+90-536-247-1019" className="hover:text-primary transition-colors">
                    {t("footer_phone")}
                  </a>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary mt-0.5" />
                  <div>{t("footer_location")}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom section */}
            <div className="mt-8 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="text-gray-500 text-sm">{t("footer_copyright")}</div>
            </div>
        </div>
      </footer>
    </div>
  )
}
