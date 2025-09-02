export const detectLanguage = (): 'en' | 'tr' | 'de' | 'es' | 'fr' | 'hi' => {
  // 1. Cookie'den kontrol et (server/client arası tutarlılık için)
  try {
    const cookieMatch = document.cookie.match(/(?:^|; )vizcad-language=([^;]+)/)
    if (cookieMatch && cookieMatch[1]) {
      const c = decodeURIComponent(cookieMatch[1])
      if (c === 'tr' || c === 'en' || c === 'de' || c === 'es' || c === 'fr' || c === 'hi') {
        return c as 'en' | 'tr' | 'de' | 'es' | 'fr' | 'hi'
      }
    }
  } catch (e) {
    // ignore cookie errors
  }

  // 2. localStorage'dan kontrol et (eğer daha önce seçilmişse)
  try {
    const savedLang = localStorage.getItem('vizcad-language')
    if (savedLang === 'tr' || savedLang === 'en' || savedLang === 'de' || savedLang === 'es' || savedLang === 'fr' || savedLang === 'hi') {
      return savedLang as 'en' | 'tr' | 'de' | 'es' | 'fr' | 'hi'
    }
  } catch (e) {
    // ignore localStorage errors (privacy mode)
  }

  // 3. Browser dilinden kontrol et (bölgeye göre daha iyi eşleşme)
  try {
    // Önce primary language'ı kontrol et
    const browserLang = navigator.language.toLowerCase()
    if (browserLang.startsWith('tr')) {
      return 'tr'
    }
    if (browserLang.startsWith('de')) {
      return 'de'
    }
    if (browserLang.startsWith('es')) {
      return 'es'
    }
    if (browserLang.startsWith('fr')) {
      return 'fr'
    }
    if (browserLang.startsWith('hi')) {
      return 'hi'
    }
    if (browserLang.startsWith('en')) {
      return 'en'
    }

    // navigator.languages array'ini de kontrol et (fallback languages)
    if (navigator.languages) {
      for (const lang of navigator.languages) {
        const langCode = lang.toLowerCase()
        if (langCode.startsWith('tr')) return 'tr'
        if (langCode.startsWith('de')) return 'de'
        if (langCode.startsWith('es')) return 'es'
        if (langCode.startsWith('fr')) return 'fr'
        if (langCode.startsWith('hi')) return 'hi'
        if (langCode.startsWith('en')) return 'en'
      }
    }
  } catch (e) {
    // ignore navigator errors
  }

  // 4. Default olarak İngilizce
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
  },
  de: {
    root: {
      description: "VizCad - Professioneller 3D-CAD-Dateibetrachter und -Renderer. Laden Sie STL-, OBJ-, PLY-, 3MF-Dateien sofort hoch. Kostenloses browserbasiertes 3D-Visualisierungstool mit erweiterten Rendering-Funktionen.",
      keywords: "3D-Viewer, CAD-Viewer, STL-Viewer, OBJ-Viewer, PLY-Viewer, 3MF-Viewer, 3D-Dateibetrachter, CAD-Dateibetrachter, Browser-3D-Viewer, Online-3D-Viewer, WebGL-Viewer, VTK.js-Viewer",
      locale: "de_DE"
    },
    home: {
      title: "VizCad - Professioneller 3D-CAD-Dateibetrachter & Renderer",
      description: "VizCad ist ein professioneller browserbasierter 3D-CAD-Dateibetrachter. Laden Sie STL-, OBJ-, PLY-, 3MF-Dateien sofort hoch und visualisieren Sie sie mit erweiterten Rendering-Funktionen. Kostenloser Online-3D-Viewer mit Rendering in Studioqualität.",
      keywords: "3D-CAD-Viewer, STL-Viewer online, OBJ-Dateibetrachter, PLY-Viewer, 3MF-Viewer, Browser-3D-Viewer, CAD-Dateivisualisierung, WebGL-3D-Viewer, Online-3D-Modell-Viewer, VTK.js-Viewer, professioneller 3D-Viewer",
      ogTitle: "VizCad - Professioneller 3D-CAD-Dateibetrachter & Renderer",
      ogDescription: "Professioneller browserbasierter 3D-CAD-Dateibetrachter. Laden Sie STL-, OBJ-, PLY-, 3MF-Dateien sofort hoch und visualisieren Sie sie mit Rendering in Studioqualität. Kostenloses Online-3D-Visualisierungstool.",
      twitterTitle: "VizCad - Professioneller 3D-CAD-Dateibetrachter",
      twitterDescription: "Professioneller browserbasierter 3D-CAD-Dateibetrachter. Laden Sie STL-, OBJ-, PLY-, 3MF-Dateien sofort hoch und visualisieren Sie sie mit Rendering in Studioqualität."
    },
    app: {
      title: "3D-Viewer - VizCad App | 3D-Modelle hochladen & visualisieren",
      description: "VizCad 3D-Viewer-App - Laden Sie STL-, OBJ-, PLY-, 3MF-Dateien hoch und visualisieren Sie sie mit professionellen Rendering-Tools. Erweiterte Kamerasteuerung, Drahtgitteransicht, Studiobeleuchtung und hochwertige 3D-Visualisierung.",
      keywords: "3D-Viewer-App, STL-Viewer, OBJ-Viewer, PLY-Viewer, 3MF-Viewer, CAD-Dateibetrachter, 3D-Modell-Viewer, WebGL-Viewer, VTK.js-Viewer, Drahtgitteransicht, 3D-Rendering, CAD-Visualisierungstool",
      ogTitle: "VizCad 3D-Viewer-App - Professionelle 3D-Modell-Visualisierung",
      ogDescription: "Professionelle 3D-Viewer-Anwendung. Laden Sie STL-, OBJ-, PLY-, 3MF-Dateien hoch und visualisieren Sie sie mit erweiterten Rendering-Tools, Kamerasteuerung und Studiobeleuchtung.",
      twitterTitle: "VizCad 3D-Viewer-App - 3D-Modelle hochladen & visualisieren",
      twitterDescription: "Professioneller 3D-Viewer mit erweiterten Rendering-Tools. Laden Sie STL-, OBJ-, PLY-, 3MF-Dateien hoch und visualisieren Sie sie mit Studiobeleuchtung."
    },
    contact: {
      title: "Kontakt VizCad - Support erhalten & Feedback senden",
      description: "Kontaktieren Sie das VizCad-Team für Support, Feedback oder Anfragen. Erhalten Sie Hilfe bei der 3D-Dateiansicht, technischen Problemen oder Funktionsanfragen. Professioneller Support für die CAD-Dateivisualisierung.",
      keywords: "VizCad Kontakt, 3D-Viewer-Support, CAD-Viewer-Hilfe, technischer Support, Kundendienst, Feedback, 3D-Visualisierungssupport, STL-Viewer-Hilfe",
      ogTitle: "Kontakt VizCad - Professioneller 3D-Viewer-Support",
      ogDescription: "Erhalten Sie professionellen Support für den VizCad 3D-Viewer. Kontaktieren Sie uns für technische Hilfe, Funktionsanfragen oder Fragen zur CAD-Dateivisualisierung.",
      twitterTitle: "Kontakt VizCad - Support erhalten & Feedback senden",
      twitterDescription: "Professioneller Support für den VizCad 3D-Viewer. Erhalten Sie Hilfe bei der CAD-Dateivisualisierung und bei technischen Problemen."
    },
    faq: {
      title: "FAQ - Fragen & Antworten zum VizCad 3D-Viewer",
      description: "Häufig gestellte Fragen zum VizCad 3D-Viewer. Finden Sie Antworten zu unterstützten Dateiformaten, Browserkompatibilität, Leistung, Funktionen und zur Verwendung des CAD-Dateibetrachters.",
      keywords: "VizCad FAQ, 3D-Viewer-Fragen, CAD-Viewer-Hilfe, STL-Viewer FAQ, unterstützte Dateiformate, Browserkompatibilität, 3D-Visualisierungs-Hilfe, WebGL-Viewer-Fragen",
      ogTitle: "VizCad FAQ - Fragen & Antworten zum 3D-Viewer",
      ogDescription: "Finden Sie Antworten auf häufig gestellte Fragen zum VizCad 3D-Viewer. Erfahren Sie mehr über unterstützte Formate, Funktionen und wie Sie unser CAD-Visualisierungstool optimal nutzen können.",
      twitterTitle: "VizCad FAQ - Fragen & Antworten zum 3D-Viewer",
      twitterDescription: "Häufig gestellte Fragen zum VizCad 3D-Viewer. Finden Sie Antworten zu Dateiformaten, Funktionen und zur Verwendung."
    }
  },
  es: {
    root: {
      description: "VizCad - Visor y renderizador de archivos CAD 3D profesional. Suba archivos STL, OBJ, PLY, 3MF al instante. Herramienta de visualización 3D gratuita basada en navegador con capacidades de renderizado avanzadas.",
      keywords: "visor 3D, visor CAD, visor STL, visor OBJ, visor PLY, visor 3MF, visor de archivos 3D, visor de archivos CAD, visor 3D en navegador, visor 3D online, visor WebGL, visor VTK.js",
      locale: "es_ES"
    },
    home: {
      title: "VizCad - Visor y renderizador profesional de archivos CAD 3D",
      description: "VizCad es un visor profesional de archivos CAD 3D basado en navegador. Suba y visualice archivos STL, OBJ, PLY, 3MF al instante con capacidades de renderizado avanzadas. Visor 3D online gratuito con renderizado de calidad de estudio.",
      keywords: "visor CAD 3D, visor STL online, visor de archivos OBJ, visor PLY, visor 3MF, visor 3D en navegador, visualización de archivos CAD, visor 3D WebGL, visor de modelos 3D online, visor VTK.js, visor 3D profesional",
      ogTitle: "VizCad - Visor y renderizador profesional de archivos CAD 3D",
      ogDescription: "Visor profesional de archivos CAD 3D basado en navegador. Suba archivos STL, OBJ, PLY, 3MF al instante con renderizado de calidad de estudio. Herramienta de visualización 3D online gratuita.",
      twitterTitle: "VizCad - Visor profesional de archivos CAD 3D",
      twitterDescription: "Visor profesional de archivos CAD 3D basado en navegador. Suba archivos STL, OBJ, PLY, 3MF al instante con renderizado de calidad de estudio."
    },
    app: {
      title: "Visor 3D - App de VizCad | Subir y visualizar modelos 3D",
      description: "App Visor 3D de VizCad - Suba y visualice archivos STL, OBJ, PLY, 3MF con herramientas de renderizado profesionales. Controles de cámara avanzados, vista de wireframe, iluminación de estudio y visualización 3D de alta calidad.",
      keywords: "app visor 3D, visor STL, visor OBJ, visor PLY, visor 3MF, visor de archivos CAD, visor de modelos 3D, visor WebGL, visor VTK.js, vista wireframe, renderizado 3D, herramienta de visualización CAD",
      ogTitle: "App Visor 3D de VizCad - Visualización profesional de modelos 3D",
      ogDescription: "Aplicación de visor 3D profesional. Suba archivos STL, OBJ, PLY, 3MF y visualícelos con herramientas de renderizado avanzadas, controles de cámara e iluminación de estudio.",
      twitterTitle: "App Visor 3D de VizCad - Subir y visualizar modelos 3D",
      twitterDescription: "Visor 3D profesional con herramientas de renderizado avanzadas. Suba archivos STL, OBJ, PLY, 3MF y visualícelos con iluminación de estudio."
    },
    contact: {
      title: "Contactar con VizCad - Obtener soporte y enviar comentarios",
      description: "Contacte con el equipo de VizCad para soporte, comentarios o consultas. Obtenga ayuda con la visualización de archivos 3D, problemas técnicos o solicitudes de funciones. Soporte profesional para la visualización de archivos CAD.",
      keywords: "contacto VizCad, soporte visor 3D, ayuda visor CAD, soporte técnico, servicio al cliente, comentarios, soporte de visualización 3D, ayuda visor STL",
      ogTitle: "Contactar con VizCad - Soporte profesional para visor 3D",
      ogDescription: "Obtenga soporte profesional para el visor 3D de VizCad. Contáctenos para ayuda técnica, solicitudes de funciones o cualquier pregunta sobre la visualización de archivos CAD.",
      twitterTitle: "Contactar con VizCad - Obtener soporte y enviar comentarios",
      twitterDescription: "Soporte profesional para el visor 3D de VizCad. Obtenga ayuda con la visualización de archivos CAD y problemas técnicos."
    },
    faq: {
      title: "Preguntas frecuentes - Preguntas y respuestas del visor 3D de VizCad",
      description: "Preguntas frecuentes sobre el visor 3D de VizCad. Encuentre respuestas sobre formatos de archivo compatibles, compatibilidad del navegador, rendimiento, funciones y cómo usar el visor de archivos CAD.",
      keywords: "FAQ VizCad, preguntas visor 3D, ayuda visor CAD, FAQ visor STL, formatos de archivo compatibles, compatibilidad del navegador, ayuda de visualización 3D, preguntas del visor WebGL",
      ogTitle: "FAQ VizCad - Preguntas y respuestas del visor 3D",
      ogDescription: "Encuentre respuestas a preguntas comunes sobre el visor 3D de VizCad. Aprenda sobre los formatos compatibles, las funciones y cómo aprovechar al máximo nuestra herramienta de visualización CAD.",
      twitterTitle: "FAQ VizCad - Preguntas y respuestas del visor 3D",
      twitterDescription: "Preguntas frecuentes sobre el visor 3D de VizCad. Encuentre respuestas sobre formatos de archivo, funciones y uso."
    }
  },
  fr: {
    root: {
      description: "VizCad - Visualiseur et moteur de rendu de fichiers CAO 3D professionnel. Téléchargez instantanément des fichiers STL, OBJ, PLY, 3MF. Outil de visualisation 3D gratuit basé sur un navigateur avec des capacités de rendu avancées.",
      keywords: "visualiseur 3D, visualiseur CAO, visualiseur STL, visualiseur OBJ, visualiseur PLY, visualiseur 3MF, visualiseur de fichiers 3D, visualiseur de fichiers CAO, visualiseur 3D sur navigateur, visualiseur 3D en ligne, visualiseur WebGL, visualiseur VTK.js",
      locale: "fr_FR"
    },
    home: {
      title: "VizCad - Visualiseur et moteur de rendu professionnel de fichiers CAO 3D",
      description: "VizCad est un visualiseur de fichiers CAO 3D professionnel basé sur un navigateur. Téléchargez et visualisez instantanément des fichiers STL, OBJ, PLY, 3MF avec des capacités de rendu avancées. Visualiseur 3D en ligne gratuit avec rendu de qualité studio.",
      keywords: "visualiseur CAO 3D, visualiseur STL en ligne, visualiseur de fichiers OBJ, visualiseur PLY, visualiseur 3MF, visualiseur 3D sur navigateur, visualisation de fichiers CAO, visualiseur 3D WebGL, visualiseur de modèles 3D en ligne, visualiseur VTK.js, visualiseur 3D professionnel",
      ogTitle: "VizCad - Visualiseur et moteur de rendu professionnel de fichiers CAO 3D",
      ogDescription: "Visualiseur de fichiers CAO 3D professionnel basé sur un navigateur. Téléchargez instantanément des fichiers STL, OBJ, PLY, 3MF avec un rendu de qualité studio. Outil de visualisation 3D en ligne gratuit.",
      twitterTitle: "VizCad - Visualiseur professionnel de fichiers CAO 3D",
      twitterDescription: "Visualiseur de fichiers CAO 3D professionnel basé sur un navigateur. Téléchargez instantanément des fichiers STL, OBJ, PLY, 3MF avec un rendu de qualité studio."
    },
    app: {
      title: "Visualiseur 3D - App VizCad | Téléchargez et visualisez des modèles 3D",
      description: "App Visualiseur 3D de VizCad - Téléchargez et visualisez des fichiers STL, OBJ, PLY, 3MF avec des outils de rendu professionnels. Commandes de caméra avancées, vue filaire, éclairage de studio et visualisation 3D de haute qualité.",
      keywords: "app visualiseur 3D, visualiseur STL, visualiseur OBJ, visualiseur PLY, visualiseur 3MF, visualiseur de fichiers CAO, visualiseur de modèles 3D, visualiseur WebGL, visualiseur VTK.js, vue filaire, rendu 3D, outil de visualisation CAO",
      ogTitle: "App Visualiseur 3D de VizCad - Visualisation professionnelle de modèles 3D",
      ogDescription: "Application de visualiseur 3D professionnelle. Téléchargez des fichiers STL, OBJ, PLY, 3MF et visualisez-les avec des outils de rendu avancés, des commandes de caméra et un éclairage de studio.",
      twitterTitle: "App Visualiseur 3D de VizCad - Téléchargez et visualisez des modèles 3D",
      twitterDescription: "Visualiseur 3D professionnel avec des outils de rendu avancés. Téléchargez des fichiers STL, OBJ, PLY, 3MF et visualisez-les avec un éclairage de studio."
    },
    contact: {
      title: "Contactez VizCad - Obtenez de l'aide et envoyez des commentaires",
      description: "Contactez l'équipe VizCad pour de l'aide, des commentaires ou des demandes. Obtenez de l'aide pour la visualisation de fichiers 3D, les problèmes techniques ou les demandes de fonctionnalités. Assistance professionnelle pour la visualisation de fichiers CAO.",
      keywords: "contact VizCad, assistance visualiseur 3D, aide visualiseur CAO, support technique, service client, commentaires, assistance visualisation 3D, aide visualiseur STL",
      ogTitle: "Contactez VizCad - Assistance professionnelle pour visualiseur 3D",
      ogDescription: "Obtenez une assistance professionnelle pour le visualiseur 3D de VizCad. Contactez-nous pour une aide technique, des demandes de fonctionnalités ou toute question sur la visualisation de fichiers CAO.",
      twitterTitle: "Contactez VizCad - Obtenez de l'aide et envoyez des commentaires",
      twitterDescription: "Assistance professionnelle pour le visualiseur 3D de VizCad. Obtenez de l'aide pour la visualisation de fichiers CAO et les problèmes techniques."
    },
    faq: {
      title: "FAQ - Questions et réponses sur le visualiseur 3D de VizCad",
      description: "Foire aux questions sur le visualiseur 3D de VizCad. Trouvez des réponses sur les formats de fichiers pris en charge, la compatibilité des navigateurs, les performances, les fonctionnalités et comment utiliser le visualiseur de fichiers CAO.",
      keywords: "FAQ VizCad, questions visualiseur 3D, aide visualiseur CAO, FAQ visualiseur STL, formats de fichiers pris en charge, compatibilité des navigateurs, aide à la visualisation 3D, questions sur le visualiseur WebGL",
      ogTitle: "FAQ VizCad - Questions et réponses sur le visualiseur 3D",
      ogDescription: "Trouvez des réponses aux questions courantes sur le visualiseur 3D de VizCad. Apprenez-en davantage sur les formats pris en charge, les fonctionnalités et comment tirer le meilleur parti de notre outil de visualisation CAO.",
      twitterTitle: "FAQ VizCad - Questions et réponses sur le visualiseur 3D",
      twitterDescription: "Foire aux questions sur le visualiseur 3D de VizCad. Trouvez des réponses sur les formats de fichiers, les fonctionnalités et l'utilisation."
    }
  },
  hi: {
    root: {
      description: "VizCad - पेशेवर 3D CAD फ़ाइल व्यूअर और रेंडरर। STL, OBJ, PLY, 3MF फ़ाइलें तुरंत अपलोड करें। उन्नत रेंडरिंग क्षमताओं के साथ मुफ़्त ब्राउज़र-आधारित 3D विज़ुअलाइज़ेशन टूल।",
      keywords: "3D व्यूअर, CAD व्यूअर, STL व्यूअर, OBJ व्यूअर, PLY व्यूअर, 3MF व्यूअर, 3D फ़ाइल व्यूअर, CAD फ़ाइल व्यूअर, ब्राउज़र 3D व्यूअर, ऑनलाइन 3D व्यूअर, WebGL व्यूअर, VTK.js व्यूअर",
      locale: "hi_IN"
    },
    home: {
      title: "VizCad - पेशेवर 3D CAD फ़ाइल व्यूअर और रेंडरर",
      description: "VizCad एक पेशेवर ब्राउज़र-आधारित 3D CAD फ़ाइल व्यूअर है। उन्नत रेंडरिंग क्षमताओं के साथ STL, OBJ, PLY, 3MF फ़ाइलें तुरंत अपलोड और विज़ुअलाइज़ करें। स्टूडियो-गुणवत्ता वाले रेंडरिंग के साथ मुफ़्त ऑनलाइन 3D व्यूअर।",
      keywords: "3D CAD व्यूअर, STL व्यूअर ऑनलाइन, OBJ फ़ाइल व्यूअर, PLY व्यूअर, 3MF व्यूअर, ब्राउज़र 3D व्यूअर, CAD फ़ाइल विज़ुअलाइज़ेशन, WebGL 3D व्यूअर, ऑनलाइन 3D मॉडल व्यूअर, VTK.js व्यूअर, पेशेवर 3D व्यूअर",
      ogTitle: "VizCad - पेशेवर 3D CAD फ़ाइल व्यूअर और रेंडरर",
      ogDescription: "पेशेवर ब्राउज़र-आधारित 3D CAD फ़ाइल व्यूअर। स्टूडियो-गुणवत्ता वाले रेंडरिंग के साथ STL, OBJ, PLY, 3MF फ़ाइलें तुरंत अपलोड करें। मुफ़्त ऑनलाइन 3D विज़ुअलाइज़ेशन टूल।",
      twitterTitle: "VizCad - पेशेवर 3D CAD फ़ाइल व्यूअर",
      twitterDescription: "पेशेवर ब्राउज़र-आधारित 3D CAD फ़ाइल व्यूअर। स्टूडियो-गुणवत्ता वाले रेंडरिंग के साथ STL, OBJ, PLY, 3MF फ़ाइलें तुरंत अपलोड करें।"
    },
    app: {
      title: "3D व्यूअर - VizCad ऐप | 3D मॉडल अपलोड और विज़ुअलाइज़ करें",
      description: "VizCad 3D व्यूअर ऐप - पेशेवर रेंडरिंग टूल के साथ STL, OBJ, PLY, 3MF फ़ाइलें अपलोड और विज़ुअलाइज़ करें। उन्नत कैमरा नियंत्रण, वायरफ़्रेम दृश्य, स्टूडियो लाइटिंग और उच्च-गुणवत्ता वाला 3D विज़ुअलाइज़ेशन।",
      keywords: "3D व्यूअर ऐप, STL व्यूअर, OBJ व्यूअर, PLY व्यूअर, 3MF व्यूअर, CAD फ़ाइल व्यूअर, 3D मॉडल व्यूअर, WebGL व्यूअर, VTK.js व्यूअर, वायरफ़्रेम दृश्य, 3D रेंडरिंग, CAD विज़ुअलाइज़ेशन टूल",
      ogTitle: "VizCad 3D व्यूअर ऐप - पेशेवर 3D मॉडल विज़ुअलाइज़ेशन",
      ogDescription: "पेशेवर 3D व्यूअर एप्लिकेशन। उन्नत रेंडरिंग टूल, कैमरा नियंत्रण और स्टूडियो लाइटिंग के साथ STL, OBJ, PLY, 3MF फ़ाइलें अपलोड और विज़ुअलाइज़ करें।",
      twitterTitle: "VizCad 3D व्यूअर ऐप - 3D मॉडल अपलोड और विज़ुअलाइज़ करें",
      twitterDescription: "उन्नत रेंडरिंग टूल के साथ पेशेवर 3D व्यूअर। स्टूडियो लाइटिंग के साथ STL, OBJ, PLY, 3MF फ़ाइलें अपलोड और विज़ुअलाइज़ करें।"
    },
    contact: {
      title: "VizCad से संपर्क करें - सहायता प्राप्त करें और प्रतिक्रिया भेजें",
      description: "सहायता, प्रतिक्रिया या पूछताछ के लिए VizCad टीम से संपर्क करें। 3D फ़ाइल देखने, तकनीकी समस्याओं या फ़ीचर अनुरोधों में सहायता प्राप्त करें। CAD फ़ाइल विज़ुअलाइज़ेशन के लिए पेशेवर सहायता।",
      keywords: "VizCad संपर्क, 3D व्यूअर सहायता, CAD व्यूअर मदद, तकनीकी सहायता, ग्राहक सेवा, प्रतिक्रिया, 3D विज़ुअलाइज़ेशन सहायता, STL व्यूअर मदद",
      ogTitle: "VizCad से संपर्क करें - पेशेवर 3D व्यूअर सहायता",
      ogDescription: "VizCad 3D व्यूअर के लिए पेशेवर सहायता प्राप्त करें। तकनीकी मदद, फ़ीचर अनुरोध, या CAD फ़ाइल विज़ुअलाइज़ेशन के बारे में किसी भी प्रश्न के लिए हमसे संपर्क करें।",
      twitterTitle: "VizCad से संपर्क करें - सहायता प्राप्त करें और प्रतिक्रिया भेजें",
      twitterDescription: "VizCad 3D व्यूअर के लिए पेशेवर सहायता। CAD फ़ाइल विज़ुअलाइज़ेशन और तकनीकी समस्याओं में सहायता प्राप्त करें।"
    },
    faq: {
      title: "FAQ - VizCad 3D व्यूअर प्रश्न और उत्तर",
      description: "VizCad 3D व्यूअर के बारे में अक्सर पूछे जाने वाले प्रश्न। समर्थित फ़ाइल स्वरूपों, ब्राउज़र संगतता, प्रदर्शन, सुविधाओं और CAD फ़ाइल व्यूअर का उपयोग कैसे करें, के बारे में उत्तर खोजें।",
      keywords: "VizCad FAQ, 3D व्यूअर प्रश्न, CAD व्यूअर मदद, STL व्यूअर FAQ, समर्थित फ़ाइल स्वरूप, ब्राउज़र संगतता, 3D विज़ुअलाइज़ेशन मदद, WebGL व्यूअर प्रश्न",
      ogTitle: "VizCad FAQ - 3D व्यूअर प्रश्न और उत्तर",
      ogDescription: "VizCad 3D व्यूअर के बारे में सामान्य प्रश्नों के उत्तर खोजें। समर्थित स्वरूपों, सुविधाओं और हमारे CAD विज़ुअलाइज़ेशन टूल का अधिकतम लाभ कैसे उठाएं, के बारे में जानें।",
      twitterTitle: "VizCad FAQ - 3D व्यूअर प्रश्न और उत्तर",
      twitterDescription: "VizCad 3D व्यूअर के बारे में अक्सर पूछे जाने वाले प्रश्न। फ़ाइल स्वरूपों, सुविधाओं और उपयोग के बारे में उत्तर खोजें।"
    }
  }
}