// Language detection function (add this to your utils)
export const detectLanguage = (): 'en' | 'tr' => {
  // 1. localStorage'dan kontrol et (eğer daha önce seçilmişse)
  const savedLang = localStorage.getItem('vizcad-language')
  if (savedLang === 'tr' || savedLang === 'en') {
    return savedLang as 'en' | 'tr'
  }

  // 2. Browser dilinden kontrol et
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('tr')) {
    return 'tr'
  }

  // 3. Default olarak İngilizce
  return 'en'
}

// SEO content by language
export const seoContent = {
  en: {
    root: {
      description: "VizCad - Professional 3D CAD file viewer and renderer. Upload STL, OBJ, PLY, 3MF files instantly. Free browser-based 3D visualization tool with advanced rendering capabilities.",
      keywords: "3D viewer, CAD viewer, STL viewer, OBJ viewer, PLY viewer, 3MF viewer, 3D file viewer, CAD file viewer, browser 3D viewer, online 3D viewer, WebGL viewer, VTK.js viewer",
      locale: "en_US",
    },
    home: {
      title: "VizCad - Professional 3D CAD File Viewer & Renderer",
      description: "VizCad is a professional browser-based 3D CAD file viewer. Upload and visualize STL, OBJ, PLY, 3MF files instantly with advanced rendering capabilities. Free online 3D viewer with studio-quality rendering.",
      keywords: "3D CAD viewer, STL viewer online, OBJ file viewer, PLY viewer, 3MF viewer, browser 3D viewer, CAD file visualization, WebGL 3D viewer, online 3D model viewer, VTK.js viewer, professional 3D viewer",
      ogTitle: "VizCad - Professional 3D CAD File Viewer & Renderer",
      ogDescription: "Professional browser-based 3D CAD file viewer. Upload STL, OBJ, PLY, 3MF files instantly with studio-quality rendering. Free online 3D visualization tool.",
      twitterTitle: "VizCad - Professional 3D CAD File Viewer",
      twitterDescription: "Professional browser-based 3D CAD file viewer. Upload STL, OBJ, PLY, 3MF files instantly with studio-quality rendering.",
    },
    app: {
      title: "3D Viewer - VizCad App | Upload & Visualize 3D Models",
      description: "VizCad 3D Viewer App - Upload and visualize STL, OBJ, PLY, 3MF files with professional rendering tools. Advanced camera controls, wireframe view, studio lighting, and high-quality 3D visualization.",
      keywords: "3D viewer app, STL viewer, OBJ viewer, PLY viewer, 3MF viewer, CAD file viewer, 3D model viewer, WebGL viewer, VTK.js viewer, wireframe view, 3D rendering, CAD visualization tool",
      ogTitle: "VizCad 3D Viewer App - Professional 3D Model Visualization",
      ogDescription: "Professional 3D viewer application. Upload STL, OBJ, PLY, 3MF files and visualize with advanced rendering tools, camera controls, and studio lighting.",
      twitterTitle: "VizCad 3D Viewer App - Upload & Visualize 3D Models",
      twitterDescription: "Professional 3D viewer with advanced rendering tools. Upload STL, OBJ, PLY, 3MF files and visualize with studio lighting.",
    },
    contact: {
      title: "Contact VizCad - Get Support & Send Feedback",
      description: "Contact VizCad team for support, feedback, or inquiries. Get help with 3D file viewing, technical issues, or feature requests. Professional support for CAD file visualization.",
      keywords: "VizCad contact, 3D viewer support, CAD viewer help, technical support, customer service, feedback, 3D visualization support, STL viewer help",
      ogTitle: "Contact VizCad - Professional 3D Viewer Support",
      ogDescription: "Get professional support for VizCad 3D viewer. Contact us for technical help, feature requests, or any questions about CAD file visualization.",
      twitterTitle: "Contact VizCad - Get Support & Send Feedback",
      twitterDescription: "Professional support for VizCad 3D viewer. Get help with CAD file visualization and technical issues.",
    },
    faq: {
      title: "FAQ - VizCad 3D Viewer Questions & Answers",
      description: "Frequently asked questions about VizCad 3D viewer. Find answers about supported file formats, browser compatibility, performance, features, and how to use the CAD file viewer.",
      keywords: "VizCad FAQ, 3D viewer questions, CAD viewer help, STL viewer FAQ, supported file formats, browser compatibility, 3D visualization help, WebGL viewer questions",
      ogTitle: "VizCad FAQ - 3D Viewer Questions & Answers",
      ogDescription: "Find answers to common questions about VizCad 3D viewer. Learn about supported formats, features, and how to get the most from our CAD visualization tool.",
      twitterTitle: "VizCad FAQ - 3D Viewer Questions & Answers",
      twitterDescription: "Frequently asked questions about VizCad 3D viewer. Find answers about file formats, features, and usage.",
    },
  },
  tr: {
    root: {
      description: "VizCad - Profesyonel 3D CAD dosya görüntüleyici ve render aracı. STL, OBJ, PLY, 3MF dosyalarını anında yükleyin. Gelişmiş rendering yetenekleri ile ücretsiz tarayıcı tabanlı 3D görselleştirme aracı.",
      keywords: "3D görüntüleyici, CAD görüntüleyici, STL görüntüleyici, OBJ görüntüleyici, PLY görüntüleyici, 3MF görüntüleyici, 3D dosya görüntüleyici, CAD dosya görüntüleyici, tarayıcı 3D görüntüleyici, online 3D görüntüleyici, WebGL görüntüleyici, VTK.js görüntüleyici",
      locale: "tr_TR",
    },
    home: {
      title: "VizCad - Profesyonel 3D CAD Dosya Görüntüleyici ve Render Aracı",
      description: "VizCad profesyonel tarayıcı tabanlı 3D CAD dosya görüntüleyicisidir. STL, OBJ, PLY, 3MF dosyalarını anında yükleyin ve gelişmiş rendering yetenekleri ile görselleştirin. Stüdyo kalitesinde rendering ile ücretsiz online 3D görüntüleyici.",
      keywords: "3D CAD görüntüleyici, STL görüntüleyici online, OBJ dosya görüntüleyici, PLY görüntüleyici, 3MF görüntüleyici, tarayıcı 3D görüntüleyici, CAD dosya görselleştirme, WebGL 3D görüntüleyici, online 3D model görüntüleyici, VTK.js görüntüleyici, profesyonel 3D görüntüleyici",
      ogTitle: "VizCad - Profesyonel 3D CAD Dosya Görüntüleyici ve Render Aracı",
      ogDescription: "Profesyonel tarayıcı tabanlı 3D CAD dosya görüntüleyici. STL, OBJ, PLY, 3MF dosyalarını anında yükleyin ve stüdyo kalitesinde rendering ile görselleştirin. Ücretsiz online 3D görselleştirme aracı.",
      twitterTitle: "VizCad - Profesyonel 3D CAD Dosya Görüntüleyici",
      twitterDescription: "Profesyonel tarayıcı tabanlı 3D CAD dosya görüntüleyici. STL, OBJ, PLY, 3MF dosyalarını anında yükleyin ve stüdyo kalitesinde rendering ile görselleştirin.",
    },
    app: {
      title: "3D Görüntüleyici - VizCad Uygulaması | 3D Modelleri Yükleyin ve Görselleştirin",
      description: "VizCad 3D Görüntüleyici Uygulaması - Profesyonel rendering araçları ile STL, OBJ, PLY, 3MF dosyalarını yükleyin ve görselleştirin. Gelişmiş kamera kontrolleri, wireframe görünümü, stüdyo ışıklandırması ve yüksek kaliteli 3D görselleştirme.",
      keywords: "3D görüntüleyici uygulaması, STL görüntüleyici, OBJ görüntüleyici, PLY görüntüleyici, 3MF görüntüleyici, CAD dosya görüntüleyici, 3D model görüntüleyici, WebGL görüntüleyici, VTK.js görüntüleyici, wireframe görünümü, 3D rendering, CAD görselleştirme aracı",
      ogTitle: "VizCad 3D Görüntüleyici Uygulaması - Profesyonel 3D Model Görselleştirme",
      ogDescription: "Profesyonel 3D görüntüleyici uygulaması. STL, OBJ, PLY, 3MF dosyalarını yükleyin ve gelişmiş rendering araçları, kamera kontrolleri ve stüdyo ışıklandırması ile görselleştirin.",
      twitterTitle: "VizCad 3D Görüntüleyici Uygulaması - 3D Modelleri Yükleyin ve Görselleştirin",
      twitterDescription: "Gelişmiş rendering araçları ile profesyonel 3D görüntüleyici. STL, OBJ, PLY, 3MF dosyalarını yükleyin ve stüdyo ışıklandırması ile görselleştirin.",
    },
    contact: {
      title: "VizCad İletişim - Destek Alın ve Geri Bildirim Gönderin",
      description: "Destek, geri bildirim veya sorularınız için VizCad ekibi ile iletişime geçin. 3D dosya görüntüleme, teknik sorunlar veya özellik talepleri konusunda yardım alın. CAD dosya görselleştirme için profesyonel destek.",
      keywords: "VizCad iletişim, 3D görüntüleyici destek, CAD görüntüleyici yardım, teknik destek, müşteri hizmetleri, geri bildirim, 3D görselleştirme destek, STL görüntüleyici yardım",
      ogTitle: "VizCad İletişim - Profesyonel 3D Görüntüleyici Desteği",
      ogDescription: "VizCad 3D görüntüleyici için profesyonel destek alın. Teknik yardım, özellik talepleri veya CAD dosya görselleştirme hakkında sorularınız için bizimle iletişime geçin.",
      twitterTitle: "VizCad İletişim - Destek Alın ve Geri Bildirim Gönderin",
      twitterDescription: "VizCad 3D görüntüleyici için profesyonel destek. CAD dosya görselleştirme ve teknik sorunlar konusunda yardım alın.",
    },
    faq: {
      title: "SSS - VizCad 3D Görüntüleyici Sorular ve Cevaplar",
      description: "VizCad 3D görüntüleyici hakkında sık sorulan sorular. Desteklenen dosya formatları, tarayıcı uyumluluğu, performans, özellikler ve CAD dosya görüntüleyici nasıl kullanılır konularında cevaplar bulun.",
      keywords: "VizCad SSS, 3D görüntüleyici soruları, CAD görüntüleyici yardım, STL görüntüleyici SSS, desteklenen dosya formatları, tarayıcı uyumluluğu, 3D görselleştirme yardım, WebGL görüntüleyici soruları",
      ogTitle: "VizCad SSS - 3D Görüntüleyici Sorular ve Cevaplar",
      ogDescription: "VizCad 3D görüntüleyici hakkında yaygın sorulara cevaplar bulun. Desteklenen formatlar, özellikler ve CAD görselleştirme aracımızdan en iyi şekilde nasıl yararlanacağınızı öğrenin.",
      twitterTitle: "VizCad SSS - 3D Görüntüleyici Sorular ve Cevaplar",
      twitterDescription: "VizCad 3D görüntüleyici hakkında sık sorulan sorular. Dosya formatları, özellikler ve kullanım hakkında cevaplar bulun.",
    },
  }
}