export const detectLanguage = (): 'en' | 'tr' | 'de' | 'es' | 'fr' | 'hi' => {
  // Server-side check
  if (typeof window === 'undefined') {
    return 'en' // Default to English for SSR
  }
  
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

  // 4. Default olarak İngilizce (site international)
  return 'en'
}
export const seoContent = {
  en: {
    root: {
      description: "VizCad - Professional 3D CAD file viewer and renderer. Upload STL, OBJ, PLY, 3MF files instantly. Free browser-based 3D visualization tool with advanced rendering capabilities.",
      keywords: "3D viewer, CAD viewer, STL viewer, OBJ viewer, PLY viewer, 3MF viewer, 3D file viewer, CAD file viewer, browser 3D viewer, online 3D viewer, WebGL viewer, VTK.js viewer",
      locale: "en_US",
    },
    home: {
      title: "VizCad: Free Online 3D CAD File Viewer & Converter (STL, OBJ, 3MF)",
      description: "VizCad is a professional browser-based 3D CAD file viewer. Upload and visualize STL, OBJ, PLY, 3MF files instantly with advanced rendering capabilities. Free online 3D viewer with studio-quality rendering.",
      keywords: "3D CAD viewer, STL viewer online, OBJ file viewer, PLY viewer, 3MF viewer, browser 3D viewer, CAD file visualization, WebGL 3D viewer, online 3D model viewer, VTK.js viewer, professional 3D viewer",
      ogTitle: "VizCad: Free Online 3D CAD File Viewer & Converter (STL, OBJ, 3MF)",
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
    modelSnap: {
      title: "ModelSnap | VizCad: Convert STL to PNG, JPG, CSV Online",
      description: "ModelSnap by VizCad lets you convert STL files to high-quality PNG, JPG images or CSV data online. Instantly upload your 3D models and generate visual or data outputs for engineering, design, or 3D printing projects.",
      keywords: "STL to PNG converter, STL to JPG converter, STL to CSV converter, 3D model to image, convert STL online, STL visualization tool, STL file to image free, 3D printing STL to image, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: Convert STL to PNG, JPG, CSV Online",
      ogDescription: "Convert STL files to PNG, JPG images or CSV data instantly with ModelSnap by VizCad. Perfect for engineers, designers, students, and 3D printing hobbyists.",
      twitterTitle: "ModelSnap | VizCad: Convert STL to PNG, JPG, CSV Online",
      twitterDescription: "Online STL to image converter. Generate high-quality PNG, JPG or CSV from STL files instantly with ModelSnap by VizCad.",
    },
  },
  tr: {
    root: {
      description: "VizCad - Profesyonel 3D CAD dosya görüntüleyici ve render aracı. STL, OBJ, PLY, 3MF dosyalarını anında yükleyin. Gelişmiş rendering yetenekleri ile ücretsiz tarayıcı tabanlı 3D görselleştirme aracı.",
      keywords: "3D görüntüleyici, CAD görüntüleyici, STL görüntüleyici, OBJ görüntüleyici, PLY görüntüleyici, 3MF görüntüleyici, 3D dosya görüntüleyici, CAD dosya görüntüleyici, tarayıcı 3D görüntüleyici, online 3D görüntüleyici, WebGL görüntüleyici, VTK.js görüntüleyici",
      locale: "tr_TR",
    },
    home: {
      title: "VizCad: Ücretsiz Çevrimiçi 3D CAD Dosya Görüntüleyici ve Dönüştürücü (STL, OBJ, 3MF)",
      description: "VizCad profesyonel tarayıcı tabanlı 3D CAD dosya görüntüleyicisidir. STL, OBJ, PLY, 3MF dosyalarını anında yükleyin ve gelişmiş rendering yetenekleri ile görselleştirin. Stüdyo kalitesinde rendering ile ücretsiz online 3D görüntüleyici.",
      keywords: "3D CAD görüntüleyici, STL görüntüleyici online, OBJ dosya görüntüleyici, PLY görüntüleyici, 3MF görüntüleyici, tarayıcı 3D görüntüleyici, CAD dosya görselleştirme, WebGL 3D görüntüleyici, online 3D model görüntüleyici, VTK.js görüntüleyici, profesyonel 3D görüntüleyici",
      ogTitle: "VizCad: Ücretsiz Çevrimiçi 3D CAD Dosya Görüntüleyici ve Dönüştürücü (STL, OBJ, 3MF)",
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
    modelSnap: {
      title: "ModelSnap | VizCad: STL'yi PNG, JPG, CSV'ye Çevir Online",
      description: "VizCad'in ModelSnap aracı ile STL dosyalarını yüksek kaliteli PNG, JPG görsellerine veya CSV verilerine çevirebilirsiniz. 3D modellerinizi anında yükleyin ve mühendislik, tasarım veya 3D baskı projeleri için görsel veya veri çıktıları oluşturun.",
      keywords: "STL'den PNG'ye dönüştürme, STL'den JPG'ye dönüştürme, STL'den CSV, 3D modelden görsele, STL'yi çevrimiçi dönüştürme, STL görselleştirme aracı, STL dosyasını görsele ücretsiz dönüştürme, 3D baskı STL'yi görsele dönüştürme, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: STL'yi PNG, JPG, CSV'ye Çevir Online",
      ogDescription: "STL dosyalarını ModelSnap ile PNG, JPG görsellerine veya CSV verilerine anında dönüştürün. Mühendisler, tasarımcılar, öğrenciler ve 3D baskı meraklıları için mükemmel.",
      twitterTitle: "ModelSnap | VizCad: STL'yi PNG, JPG, CSV'ye Çevir Online",
      twitterDescription: "Online STL'den görsele dönüştürücü. STL dosyalarından ModelSnap ile yüksek kaliteli PNG, JPG veya CSV çıktıları anında oluşturun.",
    },
  },de: {
    root: {
      description: "VizCad - Professioneller 3D-CAD-Dateibetrachter und Renderer. Laden Sie STL, OBJ, PLY, 3MF-Dateien sofort hoch. Kostenloses browserbasiertes 3D-Visualisierungstool mit erweiterten Rendering-Funktionen.",
      keywords: "3D-Betrachter, CAD-Betrachter, STL-Betrachter, OBJ-Betrachter, PLY-Betrachter, 3MF-Betrachter, 3D-Dateibetrachter, CAD-Dateibetrachter, Browser 3D-Betrachter, Online 3D-Betrachter, WebGL-Betrachter, VTK.js-Betrachter",
      locale: "de_DE",
    },
    home: {
      title: "VizCad: Kostenloser Online-3D-CAD-Dateibetrachter und -Konverter (STL, OBJ, 3MF)",
      description: "VizCad ist ein professioneller browserbasierter 3D-CAD-Dateibetrachter. STL, OBJ, PLY, 3MF-Dateien sofort hochladen und mit erweiterten Rendering-Funktionen visualisieren. Kostenloser Online-3D-Betrachter mit Studioqualität.",
      keywords: "3D CAD-Betrachter, STL-Betrachter online, OBJ-Dateibetrachter, PLY-Betrachter, 3MF-Betrachter, Browser 3D-Betrachter, CAD-Datei-Visualisierung, WebGL 3D-Betrachter, Online 3D-Modell-Betrachter, VTK.js-Betrachter, professioneller 3D-Betrachter",
      ogTitle: "VizCad - Professioneller 3D CAD-Dateibetrachter & Renderer",
      ogDescription: "Professioneller browserbasierter 3D-CAD-Dateibetrachter. STL, OBJ, PLY, 3MF-Dateien sofort hochladen und in Studioqualität rendern. Kostenloses Online-3D-Visualisierungstool.",
      twitterTitle: "VizCad - Professioneller 3D CAD-Dateibetrachter",
      twitterDescription: "Professioneller browserbasierter 3D-CAD-Dateibetrachter. STL, OBJ, PLY, 3MF-Dateien sofort hochladen und in Studioqualität rendern.",
    },
    app: {
      title: "3D-Betrachter - VizCad App | 3D-Modelle hochladen & visualisieren",
      description: "VizCad 3D-Betrachter App - STL, OBJ, PLY, 3MF-Dateien mit professionellen Rendering-Tools hochladen und visualisieren. Erweiterte Kamerasteuerung, Drahtgitteransicht, Studio-Beleuchtung und hochwertige 3D-Visualisierung.",
      keywords: "3D-Betrachter App, STL-Betrachter, OBJ-Betrachter, PLY-Betrachter, 3MF-Betrachter, CAD-Datei-Betrachter, 3D-Modell-Betrachter, WebGL-Betrachter, VTK.js-Betrachter, Drahtgitteransicht, 3D-Rendering, CAD-Visualisierungstool",
      ogTitle: "VizCad 3D-Betrachter App - Professionelle 3D-Modell-Visualisierung",
      ogDescription: "Professionelle 3D-Betrachter-Anwendung. STL, OBJ, PLY, 3MF-Dateien hochladen und mit erweiterten Rendering-Tools, Kamerasteuerung und Studio-Beleuchtung visualisieren.",
      twitterTitle: "VizCad 3D-Betrachter App - 3D-Modelle hochladen & visualisieren",
      twitterDescription: "Professioneller 3D-Betrachter mit erweiterten Rendering-Tools. STL, OBJ, PLY, 3MF-Dateien hochladen und mit Studio-Beleuchtung visualisieren.",
    },
    contact: {
      title: "Kontakt VizCad - Support erhalten & Feedback senden",
      description: "Kontaktieren Sie das VizCad-Team für Support, Feedback oder Anfragen. Hilfe bei 3D-Dateiansicht, technischen Problemen oder Feature-Anfragen. Professioneller Support für CAD-Datei-Visualisierung.",
      keywords: "VizCad Kontakt, 3D-Betrachter Support, CAD-Betrachter Hilfe, technischer Support, Kundenservice, Feedback, 3D-Visualisierung Support, STL-Betrachter Hilfe",
      ogTitle: "Kontakt VizCad - Professioneller 3D-Betrachter Support",
      ogDescription: "Professioneller Support für VizCad 3D-Betrachter. Kontaktieren Sie uns für technische Hilfe, Feature-Anfragen oder Fragen zur CAD-Visualisierung.",
      twitterTitle: "Kontakt VizCad - Support erhalten & Feedback senden",
      twitterDescription: "Professioneller Support für VizCad 3D-Betrachter. Hilfe bei CAD-Visualisierung und technischen Problemen.",
    },
    faq: {
      title: "FAQ - VizCad 3D-Betrachter Fragen & Antworten",
      description: "Häufig gestellte Fragen zum VizCad 3D-Betrachter. Antworten zu unterstützten Dateiformaten, Browserkompatibilität, Leistung, Funktionen und Bedienung des CAD-Dateibetrachter.",
      keywords: "VizCad FAQ, 3D-Betrachter Fragen, CAD-Betrachter Hilfe, STL-Betrachter FAQ, unterstützte Dateiformate, Browserkompatibilität, 3D-Visualisierung Hilfe, WebGL-Betrachter Fragen",
      ogTitle: "VizCad FAQ - 3D-Betrachter Fragen & Antworten",
      ogDescription: "Antworten auf häufige Fragen zum VizCad 3D-Betrachter. Informationen zu unterstützten Formaten, Funktionen und optimaler Nutzung des CAD-Visualisierungstools.",
      twitterTitle: "VizCad FAQ - 3D-Betrachter Fragen & Antworten",
      twitterDescription: "Häufig gestellte Fragen zum VizCad 3D-Betrachter. Antworten zu Dateiformaten, Funktionen und Nutzung.",
    },
    modelSnap: {
      title: "ModelSnap | VizCad: STL zu PNG, JPG, CSV online konvertieren",
      description: "Mit ModelSnap von VizCad STL-Dateien sofort in hochwertige PNG, JPG-Bilder oder CSV-Daten konvertieren. 3D-Modelle hochladen und visuelle oder datenbasierte Ausgaben für Technik, Design oder 3D-Druckprojekte erzeugen.",
      keywords: "STL zu PNG Konverter, STL zu JPG Konverter, STL zu CSV Konverter, 3D-Modell zu Bild, STL online konvertieren, STL Visualisierungstool, STL-Datei kostenlos zu Bild, 3D-Druck STL zu Bild, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: STL zu PNG, JPG, CSV online konvertieren",
      ogDescription: "STL-Dateien sofort mit ModelSnap von VizCad in PNG, JPG-Bilder oder CSV-Daten konvertieren. Ideal für Ingenieure, Designer, Studenten und 3D-Druck-Enthusiasten.",
      twitterTitle: "ModelSnap | VizCad: STL zu PNG, JPG, CSV online konvertieren",
      twitterDescription: "Online STL zu Bild-Konverter. Hochwertige PNG, JPG oder CSV aus STL-Dateien sofort mit ModelSnap von VizCad erstellen.",
    },
  },
  es: {
    root: {
      description: "VizCad - Visor y renderizador profesional de archivos CAD 3D. Carga archivos STL, OBJ, PLY, 3MF al instante. Herramienta gratuita de visualización 3D en el navegador con capacidades avanzadas de renderizado.",
      keywords: "visor 3D, visor CAD, visor STL, visor OBJ, visor PLY, visor 3MF, visor de archivos 3D, visor de archivos CAD, visor 3D en navegador, visor 3D online, visor WebGL, visor VTK.js",
      locale: "es_ES",
    },
    home: {
      title: "VizCad: Visor y Convertidor de Archivos CAD 3D en Línea Gratis (STL, OBJ, 3MF)",
      description: "VizCad es un visor profesional de archivos CAD 3D basado en navegador. Carga y visualiza archivos STL, OBJ, PLY, 3MF al instante con funciones avanzadas de renderizado. Visor 3D online gratuito con calidad de estudio.",
      keywords: "visor CAD 3D, visor STL online, visor de archivos OBJ, visor PLY, visor 3MF, visor 3D en navegador, visualización de archivos CAD, visor 3D WebGL, visor de modelos 3D online, visor profesional 3D",
      ogTitle: "VizCad: Visor y Convertidor de Archivos CAD 3D en Línea Gratis (STL, OBJ, 3MF)",
      ogDescription: "Visor profesional de archivos CAD 3D basado en navegador. Carga archivos STL, OBJ, PLY, 3MF al instante con renderizado de calidad de estudio. Herramienta gratuita de visualización 3D online.",
      twitterTitle: "VizCad - Visor Profesional de Archivos CAD 3D",
      twitterDescription: "Visor profesional de archivos CAD 3D basado en navegador. Carga archivos STL, OBJ, PLY, 3MF al instante con renderizado de calidad de estudio.",
    },
    app: {
      title: "Visor 3D - Aplicación VizCad | Carga y visualiza modelos 3D",
      description: "Aplicación VizCad 3D Viewer - Carga y visualiza archivos STL, OBJ, PLY, 3MF con herramientas de renderizado profesional. Controles avanzados de cámara, vista en alambre, iluminación de estudio y visualización 3D de alta calidad.",
      keywords: "aplicación visor 3D, visor STL, visor OBJ, visor PLY, visor 3MF, visor de archivos CAD, visor de modelos 3D, visor WebGL, visor VTK.js, vista en alambre, renderizado 3D, herramienta de visualización CAD",
      ogTitle: "Aplicación VizCad 3D Viewer - Visualización profesional de modelos 3D",
      ogDescription: "Aplicación profesional de visor 3D. Carga archivos STL, OBJ, PLY, 3MF y visualiza con herramientas avanzadas de renderizado, controles de cámara e iluminación de estudio.",
      twitterTitle: "Aplicación VizCad 3D Viewer - Carga y visualiza modelos 3D",
      twitterDescription: "Visor 3D profesional con herramientas avanzadas de renderizado. Carga archivos STL, OBJ, PLY, 3MF y visualiza con iluminación de estudio.",
    },
    contact: {
      title: "Contacto VizCad - Obtén soporte y envía feedback",
      description: "Contacta al equipo de VizCad para soporte, feedback o consultas. Obtén ayuda con la visualización de archivos 3D, problemas técnicos o solicitudes de funciones. Soporte profesional para visualización de archivos CAD.",
      keywords: "contacto VizCad, soporte visor 3D, ayuda visor CAD, soporte técnico, atención al cliente, feedback, soporte visualización 3D, ayuda visor STL",
      ogTitle: "Contacto VizCad - Soporte profesional del visor 3D",
      ogDescription: "Obtén soporte profesional para VizCad 3D Viewer. Contáctanos para ayuda técnica, solicitudes de funciones o preguntas sobre visualización CAD.",
      twitterTitle: "Contacto VizCad - Obtén soporte y envía feedback",
      twitterDescription: "Soporte profesional para VizCad 3D Viewer. Ayuda con visualización CAD y problemas técnicos.",
    },
    faq: {
      title: "FAQ - Preguntas y respuestas del visor 3D VizCad",
      description: "Preguntas frecuentes sobre VizCad 3D Viewer. Encuentra respuestas sobre formatos de archivo soportados, compatibilidad del navegador, rendimiento, funciones y cómo usar el visor CAD.",
      keywords: "FAQ VizCad, preguntas visor 3D, ayuda visor CAD, FAQ visor STL, formatos soportados, compatibilidad navegador, ayuda visualización 3D, preguntas visor WebGL",
      ogTitle: "FAQ VizCad - Preguntas y respuestas del visor 3D",
      ogDescription: "Encuentra respuestas a preguntas comunes sobre VizCad 3D Viewer. Aprende sobre formatos soportados, funciones y cómo sacar el máximo provecho de la herramienta CAD.",
      twitterTitle: "FAQ VizCad - Preguntas y respuestas del visor 3D",
      twitterDescription: "Preguntas frecuentes sobre VizCad 3D Viewer. Respuestas sobre formatos de archivo, funciones y uso.",
    },
    modelSnap: {
      title: "ModelSnap | VizCad: Convierte STL a PNG, JPG, CSV online",
      description: "ModelSnap de VizCad permite convertir archivos STL a imágenes PNG, JPG de alta calidad o datos CSV online. Carga tus modelos 3D al instante y genera resultados visuales o de datos para ingeniería, diseño o impresión 3D.",
      keywords: "STL a PNG, STL a JPG, STL a CSV, modelo 3D a imagen, convertir STL online, herramienta visualización STL, STL a imagen gratis, impresión 3D STL a imagen, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: Convierte STL a PNG, JPG, CSV online",
      ogDescription: "Convierte archivos STL a PNG, JPG o CSV al instante con ModelSnap de VizCad. Perfecto para ingenieros, diseñadores, estudiantes y aficionados a la impresión 3D.",
      twitterTitle: "ModelSnap | VizCad: Convierte STL a PNG, JPG, CSV online",
      twitterDescription: "Convertidor STL a imagen online. Genera PNG, JPG o CSV de alta calidad desde STL con ModelSnap de VizCad.",
    },
  },fr: {
    root: {
      description: "VizCad - Visionneuse et rendu professionnel de fichiers CAD 3D. Téléchargez instantanément des fichiers STL, OBJ, PLY, 3MF. Outil gratuit de visualisation 3D dans le navigateur avec rendu avancé.",
      keywords: "visionneuse 3D, visionneuse CAD, visionneuse STL, visionneuse OBJ, visionneuse PLY, visionneuse 3MF, visionneuse fichiers 3D, visionneuse fichiers CAD, visionneuse 3D navigateur, visionneuse 3D en ligne, visionneuse WebGL, visionneuse VTK.js",
      locale: "fr_FR",
    },
    home: {
      title: "VizCad : Visionneuse et Convertisseur de Fichiers CAO 3D en Ligne Gratuit (STL, OBJ, 3MF)",
      description: "VizCad est une visionneuse professionnelle de fichiers CAD 3D basée sur le navigateur. Téléchargez et visualisez des fichiers STL, OBJ, PLY, 3MF instantanément avec rendu avancé. Visionneuse 3D en ligne gratuite avec rendu de qualité studio.",
      keywords: "visionneuse CAD 3D, visionneuse STL en ligne, visionneuse fichiers OBJ, visionneuse PLY, visionneuse 3MF, visionneuse 3D navigateur, visualisation fichiers CAD, visionneuse 3D WebGL, visionneuse modèles 3D en ligne, visionneuse professionnelle 3D",
      ogTitle: "VizCad : Visionneuse et Convertisseur de Fichiers CAO 3D en Ligne Gratuit (STL, OBJ, 3MF)",
      ogDescription: "Visionneuse professionnelle de fichiers CAD 3D basée sur le navigateur. Téléchargez instantanément des fichiers STL, OBJ, PLY, 3MF avec rendu de qualité studio. Outil gratuit de visualisation 3D en ligne.",
      twitterTitle: "VizCad - Visionneuse Professionnelle de Fichiers CAD 3D",
      twitterDescription: "Visionneuse professionnelle de fichiers CAD 3D basée sur le navigateur. Téléchargez des fichiers STL, OBJ, PLY, 3MF instantanément avec rendu de qualité studio.",
    },
    app: {
      title: "Visionneuse 3D - Application VizCad | Télécharger et Visualiser des Modèles 3D",
      description: "Application VizCad 3D Viewer - Téléchargez et visualisez des fichiers STL, OBJ, PLY, 3MF avec outils de rendu professionnels. Contrôles avancés de la caméra, vue fil de fer, éclairage studio et visualisation 3D de haute qualité.",
      keywords: "application visionneuse 3D, visionneuse STL, visionneuse OBJ, visionneuse PLY, visionneuse 3MF, visionneuse fichiers CAD, visionneuse modèles 3D, visionneuse WebGL, visionneuse VTK.js, vue fil de fer, rendu 3D, outil visualisation CAD",
      ogTitle: "Application VizCad 3D Viewer - Visualisation Professionnelle de Modèles 3D",
      ogDescription: "Application professionnelle de visionneuse 3D. Téléchargez des fichiers STL, OBJ, PLY, 3MF et visualisez-les avec outils de rendu avancés, contrôle caméra et éclairage studio.",
      twitterTitle: "Application VizCad 3D Viewer - Télécharger et Visualiser des Modèles 3D",
      twitterDescription: "Visionneuse 3D professionnelle avec outils de rendu avancés. Téléchargez des fichiers STL, OBJ, PLY, 3MF et visualisez-les avec éclairage studio.",
    },
    contact: {
      title: "Contact VizCad - Obtenez Support et Envoyez des Commentaires",
      description: "Contactez l'équipe VizCad pour support, feedback ou questions. Obtenez de l'aide pour la visualisation de fichiers 3D, problèmes techniques ou demandes de fonctionnalités. Support professionnel pour la visualisation de fichiers CAD.",
      keywords: "contact VizCad, support visionneuse 3D, aide visionneuse CAD, support technique, service client, feedback, support visualisation 3D, aide visionneuse STL",
      ogTitle: "Contact VizCad - Support Professionnel Visionneuse 3D",
      ogDescription: "Obtenez un support professionnel pour VizCad 3D Viewer. Contactez-nous pour assistance technique, demandes de fonctionnalités ou questions sur la visualisation CAD.",
      twitterTitle: "Contact VizCad - Obtenez Support et Envoyez des Commentaires",
      twitterDescription: "Support professionnel pour VizCad 3D Viewer. Assistance pour la visualisation CAD et problèmes techniques.",
    },
    faq: {
      title: "FAQ - Questions & Réponses sur VizCad 3D Viewer",
      description: "Questions fréquentes sur VizCad 3D Viewer. Trouvez des réponses sur les formats pris en charge, compatibilité navigateur, performances, fonctionnalités et utilisation du visionneur CAD.",
      keywords: "FAQ VizCad, questions visionneuse 3D, aide visionneuse CAD, FAQ visionneuse STL, formats pris en charge, compatibilité navigateur, aide visualisation 3D, questions visionneuse WebGL",
      ogTitle: "FAQ VizCad - Questions & Réponses sur VizCad 3D Viewer",
      ogDescription: "Trouvez des réponses aux questions courantes sur VizCad 3D Viewer. Informations sur les formats pris en charge, fonctionnalités et utilisation optimale de l'outil de visualisation CAD.",
      twitterTitle: "FAQ VizCad - Questions & Réponses sur VizCad 3D Viewer",
      twitterDescription: "Questions fréquentes sur VizCad 3D Viewer. Réponses sur les formats de fichiers, fonctionnalités et utilisation.",
    },
    modelSnap: {
      title: "ModelSnap | VizCad : Convertir STL en PNG, JPG, CSV en ligne",
      description: "Avec ModelSnap de VizCad, convertissez instantanément les fichiers STL en images PNG, JPG de haute qualité ou en données CSV. Téléchargez vos modèles 3D et générez des sorties visuelles ou de données pour l'ingénierie, le design ou l'impression 3D.",
      keywords: "STL vers PNG, STL vers JPG, STL vers CSV, modèle 3D en image, convertir STL en ligne, outil visualisation STL, STL en image gratuit, impression 3D STL en image, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad : Convertir STL en PNG, JPG, CSV en ligne",
      ogDescription: "Convertissez instantanément les fichiers STL en PNG, JPG ou CSV avec ModelSnap de VizCad. Parfait pour ingénieurs, designers, étudiants et passionnés d'impression 3D.",
      twitterTitle: "ModelSnap | VizCad : Convertir STL en PNG, JPG, CSV en ligne",
      twitterDescription: "Convertisseur STL en image en ligne. Générez instantanément des PNG, JPG ou CSV de haute qualité depuis STL avec ModelSnap de VizCad.",
    },
  },
  hi: {
    root: {
      description: "VizCad - पेशेवर 3D CAD फ़ाइल व्यूअर और रेंडरर। STL, OBJ, PLY, 3MF फ़ाइलें तुरंत अपलोड करें। उन्नत रेंडरिंग क्षमताओं के साथ मुफ्त ब्राउज़र-आधारित 3D विज़ुअलाइज़ेशन टूल।",
      keywords: "3D व्यूअर, CAD व्यूअर, STL व्यूअर, OBJ व्यूअर, PLY व्यूअर, 3MF व्यूअर, 3D फ़ाइल व्यूअर, CAD फ़ाइल व्यूअर, ब्राउज़र 3D व्यूअर, ऑनलाइन 3D व्यूअर, WebGL व्यूअर, VTK.js व्यूअर",
      locale: "hi_IN",
    },
    home: {
      title: "VizCad: मुफ्त ऑनलाइन 3डी CAD फ़ाइल दर्शक और कनवर्टर (STL, OBJ, 3MF)",
      description: "VizCad एक पेशेवर ब्राउज़र-आधारित 3D CAD फ़ाइल व्यूअर है। STL, OBJ, PLY, 3MF फ़ाइलें तुरंत अपलोड करें और उन्नत रेंडरिंग क्षमताओं के साथ विज़ुअलाइज़ करें। मुफ्त ऑनलाइन 3D व्यूअर स्टूडियो गुणवत्ता रेंडरिंग के साथ।",
      keywords: "3D CAD व्यूअर, STL व्यूअर ऑनलाइन, OBJ फ़ाइल व्यूअर, PLY व्यूअर, 3MF व्यूअर, ब्राउज़र 3D व्यूअर, CAD फ़ाइल विज़ुअलाइज़ेशन, WebGL 3D व्यूअर, ऑनलाइन 3D मॉडल व्यूअर, VTK.js व्यूअर, पेशेवर 3D व्यूअर",
      ogTitle: "VizCad: मुफ्त ऑनलाइन 3डी CAD फ़ाइल दर्शक और कनवर्टर (STL, OBJ, 3MF)",
      ogDescription: "पेशेवर ब्राउज़र-आधारित 3D CAD फ़ाइल व्यूअर। STL, OBJ, PLY, 3MF फ़ाइलें तुरंत अपलोड करें और स्टूडियो गुणवत्ता रेंडरिंग प्राप्त करें। मुफ्त ऑनलाइन 3D विज़ुअलाइज़ेशन टूल।",
      twitterTitle: "VizCad - पेशेवर 3D CAD फ़ाइल व्यूअर",
      twitterDescription: "पेशेवर ब्राउज़र-आधारित 3D CAD फ़ाइल व्यूअर। STL, OBJ, PLY, 3MF फ़ाइलें तुरंत अपलोड करें और स्टूडियो गुणवत्ता रेंडरिंग प्राप्त करें।",
    },
    app: {
      title: "3D व्यूअर - VizCad ऐप | 3D मॉडल अपलोड और विज़ुअलाइज़ करें",
      description: "VizCad 3D व्यूअर ऐप - STL, OBJ, PLY, 3MF फ़ाइलें पेशेवर रेंडरिंग टूल के साथ अपलोड और विज़ुअलाइज़ करें। उन्नत कैमरा नियंत्रण, वायरफ़्रेम दृश्य, स्टूडियो लाइटिंग और उच्च गुणवत्ता 3D विज़ुअलाइज़ेशन।",
      keywords: "3D व्यूअर ऐप, STL व्यूअर, OBJ व्यूअर, PLY व्यूअर, 3MF व्यूअर, CAD फ़ाइल व्यूअर, 3D मॉडल व्यूअर, WebGL व्यूअर, VTK.js व्यूअर, वायरफ़्रेम दृश्य, 3D रेंडरिंग, CAD विज़ुअलाइज़ेशन टूल",
      ogTitle: "VizCad 3D व्यूअर ऐप - पेशेवर 3D मॉडल विज़ुअलाइज़ेशन",
      ogDescription: "पेशेवर 3D व्यूअर ऐप। STL, OBJ, PLY, 3MF फ़ाइलें अपलोड करें और उन्नत रेंडरिंग टूल, कैमरा नियंत्रण और स्टूडियो लाइटिंग के साथ विज़ुअलाइज़ करें।",
      twitterTitle: "VizCad 3D व्यूअर ऐप - 3D मॉडल अपलोड और विज़ुअलाइज़ करें",
      twitterDescription: "उन्नत रेंडरिंग टूल के साथ पेशेवर 3D व्यूअर। STL, OBJ, PLY, 3MF फ़ाइलें अपलोड करें और स्टूडियो लाइटिंग के साथ विज़ुअलाइज़ करें।",
    },
    contact: {
      title: "VizCad संपर्क करें - समर्थन प्राप्त करें और फ़ीडबैक भेजें",
      description: "सपोर्ट, फ़ीडबैक या पूछताछ के लिए VizCad टीम से संपर्क करें। 3D फ़ाइल व्यूइंग, तकनीकी मुद्दों या फ़ीचर अनुरोधों में मदद प्राप्त करें। CAD फ़ाइल विज़ुअलाइज़ेशन के लिए पेशेवर समर्थन।",
      keywords: "VizCad संपर्क, 3D व्यूअर समर्थन, CAD व्यूअर मदद, तकनीकी समर्थन, ग्राहक सेवा, फ़ीडबैक, 3D विज़ुअलाइज़ेशन समर्थन, STL व्यूअर मदद",
      ogTitle: "VizCad संपर्क - पेशेवर 3D व्यूअर समर्थन",
      ogDescription: "VizCad 3D व्यूअर के लिए पेशेवर समर्थन प्राप्त करें। तकनीकी मदद, फ़ीचर अनुरोध या CAD विज़ुअलाइज़ेशन के बारे में प्रश्नों के लिए संपर्क करें।",
      twitterTitle: "VizCad संपर्क करें - समर्थन प्राप्त करें और फ़ीडबैक भेजें",
      twitterDescription: "VizCad 3D व्यूअर के लिए पेशेवर समर्थन। CAD विज़ुअलाइज़ेशन और तकनीकी मुद्दों में मदद प्राप्त करें।",
    },
    faq: {
      title: "FAQ - VizCad 3D व्यूअर प्रश्न और उत्तर",
      description: "VizCad 3D व्यूअर के बारे में अक्सर पूछे जाने वाले प्रश्न। समर्थित फ़ाइल स्वरूप, ब्राउज़र संगतता, प्रदर्शन, फ़ीचर और CAD फ़ाइल व्यूअर का उपयोग कैसे करें, इसके उत्तर प्राप्त करें।",
      keywords: "VizCad FAQ, 3D व्यूअर प्रश्न, CAD व्यूअर मदद, STL व्यूअर FAQ, समर्थित फ़ाइल स्वरूप, ब्राउज़र संगतता, 3D विज़ुअलाइज़ेशन मदद, WebGL व्यूअर प्रश्न",
      ogTitle: "VizCad FAQ - 3D व्यूअर प्रश्न और उत्तर",
      ogDescription: "VizCad 3D व्यूअर से संबंधित सामान्य प्रश्नों के उत्तर प्राप्त करें। समर्थित फ़ाइल स्वरूप, फ़ीचर और CAD विज़ुअलाइज़ेशन टूल का सर्वोत्तम उपयोग कैसे करें, जानें।",
      twitterTitle: "VizCad FAQ - 3D व्यूअर प्रश्न और उत्तर",
      twitterDescription: "VizCad 3D व्यूअर के बारे में अक्सर पूछे जाने वाले प्रश्न। फ़ाइल स्वरूप, फ़ीचर और उपयोग के उत्तर प्राप्त करें।",
    },
    modelSnap: {
      title: "ModelSnap | VizCad: STL को PNG, JPG, CSV में ऑनलाइन बदलें",
      description: "VizCad का ModelSnap टूल STL फ़ाइलों को उच्च गुणवत्ता PNG, JPG छवियों या CSV डेटा में ऑनलाइन बदलने देता है। अपने 3D मॉडल तुरंत अपलोड करें और इंजीनियरिंग, डिज़ाइन या 3D प्रिंटिंग परियोजनाओं के लिए विज़ुअल या डेटा आउटपुट उत्पन्न करें।",
      keywords: "STL से PNG कन्वर्टर, STL से JPG कन्वर्टर, STL से CSV कन्वर्टर, 3D मॉडल से इमेज, STL ऑनलाइन बदलें, STL विज़ुअलाइज़ेशन टूल, STL फ़ाइल से इमेज मुफ्त, 3D प्रिंटिंग STL से इमेज, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: STL को PNG, JPG, CSV में ऑनलाइन बदलें",
      ogDescription: "STL फ़ाइलों को ModelSnap के साथ तुरंत PNG, JPG छवियों या CSV डेटा में बदलें। इंजीनियरों, डिजाइनरों, छात्रों और 3D प्रिंटिंग उत्साही लोगों के लिए उपयुक्त।",
      twitterTitle: "ModelSnap | VizCad: STL को PNG, JPG, CSV में ऑनलाइन बदलें",
      twitterDescription: "ऑनलाइन STL से इमेज कन्वर्टर। STL फ़ाइलों से ModelSnap द्वारा उच्च गुणवत्ता PNG, JPG या CSV आउटपुट तुरंत उत्पन्न करें।",
    },
  },
};

