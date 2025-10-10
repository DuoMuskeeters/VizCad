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
      description: "VizCad - Professional 3D CAD file viewer and renderer. Upload STL, OBJ, PLY, 3MF files instantly. Free browser-based 3D visualization tool with render rendering capabilities.",
      keywords: "3d viewer, 3d models, stl viewer, stl file, obj viewer, ply viewer, 3mf viewer, cad viewer, render rendering, 3d file viewer, cad design, modeling software 3d, 3d creation software, browser 3d viewer, online 3d viewer, WebGL viewer",
      locale: "en_US",
    },
    home: {
      title: "VizCad: Free 3D Models Viewer | STL Viewer | Render Rendering Tool Online",
      description: "VizCad is a professional browser-based 3D models viewer with STL file support. Upload and visualize STL, OBJ, PLY, 3MF files instantly with render rendering capabilities. Free online 3D viewer for CAD design and modeling software.",
      keywords: "3d models, stl viewer, render rendering, stl file, 3d creation software, modeling software 3d, cad design, stl file viewer, obj viewer, ply viewer, 3mf viewer, free 3d models, 3d file viewer, online 3d viewer, cad file visualization",
      ogTitle: "VizCad: Free 3D Models Viewer | STL File Viewer | Render Rendering Online",
      ogDescription: "Professional 3D models viewer with STL file support. Upload and render 3D models instantly. Free online STL viewer with studio-quality render rendering.",
      twitterTitle: "VizCad - 3D Models & STL File Viewer",
      twitterDescription: "Professional 3D models and STL file viewer. Upload STL, OBJ files and render with studio lighting.",
    },
    app: {
      title: "3D Models Viewer App - VizCad | STL Viewer | Render 3D Files Online",
      description: "VizCad 3D Models Viewer App - Upload STL file, OBJ, PLY, 3MF files with professional render rendering tools. Advanced 3D viewer for CAD design, modeling software, wireframe view, and studio lighting.",
      keywords: "3d models viewer, stl viewer, stl file, render rendering, obj viewer, ply viewer, 3mf viewer, cad design, 3d file viewer, modeling software 3d, wireframe view, 3d rendering, online stl viewer",
      ogTitle: "VizCad 3D Models Viewer App - Professional STL File & Rendering Tool",
      ogDescription: "Professional 3D models viewer application. Upload STL file and render with advanced tools, camera controls, and studio lighting.",
      twitterTitle: "VizCad 3D Models Viewer - STL File & Render Tool",
      twitterDescription: "Professional 3D models viewer with render rendering. Upload STL file, OBJ, PLY files and visualize instantly.",
    },
    contact: {
      title: "Contact VizCad - 3D Models & STL Viewer Support",
      description: "Contact VizCad team for 3D models viewer and STL file support. Get help with render rendering, technical issues, or feature requests. Professional CAD design visualization support.",
      keywords: "VizCad contact, 3d models viewer support, stl viewer help, render rendering support, technical support, cad design help, 3d visualization support",
      ogTitle: "Contact VizCad - Professional 3D Models & STL Viewer Support",
      ogDescription: "Get professional support for VizCad 3D models viewer and STL file rendering. Contact us for technical help and feature requests.",
      twitterTitle: "Contact VizCad - 3D Models & STL Viewer Support",
      twitterDescription: "Professional support for VizCad 3D models and STL file viewer. Get help with render rendering and technical issues.",
    },
    faq: {
      title: "FAQ - VizCad 3D Models & STL Viewer Questions",
      description: "Frequently asked questions about VizCad 3D models viewer and STL file support. Find answers about render rendering, supported file formats, browser compatibility, and how to use the CAD design viewer.",
      keywords: "VizCad FAQ, 3d models viewer questions, stl viewer FAQ, render rendering help, stl file support, supported formats, cad design help",
      ogTitle: "VizCad FAQ - 3D Models & STL Viewer Questions",
      ogDescription: "Find answers about VizCad 3D models viewer, STL file support, and render rendering. Learn about features and CAD design visualization.",
      twitterTitle: "VizCad FAQ - 3D Models & STL Viewer Help",
      twitterDescription: "Frequently asked questions about 3D models viewer, STL file support, and render rendering features.",
    },
    modelSnap: {
      title: "ModelSnap | VizCad: Convert STL File to PNG, JPG, CSV Online - 3D Models Renderer",
      description: "ModelSnap by VizCad lets you convert STL file to high-quality PNG, JPG images or CSV data online. Instantly upload your 3D models and generate visual outputs with render rendering for engineering, design, or 3D printing projects.",
      keywords: "STL file to PNG, STL to JPG converter, STL to CSV, 3d models to image, convert STL file online, render rendering, STL visualization tool, 3D printing STL converter, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: Convert STL File to PNG, JPG, CSV with Render Rendering",
      ogDescription: "Convert STL file to PNG, JPG or CSV instantly with render rendering. Perfect for 3D models visualization, engineers, and designers.",
      twitterTitle: "ModelSnap | VizCad: STL File to Image Converter with Render Rendering",
      twitterDescription: "Online STL file converter with render rendering. Generate high-quality PNG, JPG from 3D models instantly.",
    },
  },
  tr: {
    root: {
      description: "VizCad - Profesyonel 3D modeller görüntüleyici ve render aracı. STL viewer ile STL, OBJ, PLY, 3MF dosyalarını anında yükleyin. Ücretsiz tarayıcı tabanlı 3D görselleştirme aracı.",
      keywords: "3d viewer, 3d modeller, stl viewer, stl file viewer, obj viewer, ply viewer, 3mf viewer, render rendering, 3d file viewer, cad viewer, online stl viewer, 3d görselleştirme",
      locale: "tr_TR",
    },
    home: {
      title: "VizCad: Ücretsiz STL Viewer | 3D Modeller Görüntüleyici | Render Aracı Online",
      description: "VizCad profesyonel STL viewer ve 3D modeller görüntüleyicisidir. STL file, OBJ, PLY, 3MF dosyalarını anında yükleyin ve render rendering ile görselleştirin. Ücretsiz online 3D viewer.",
      keywords: "stl viewer, 3d modeller, 3d viewer, stl file viewer, render rendering, 3d file viewer, obj viewer, 3mf to stl, obj to stl, stl viewer online, 3d view, cad viewer",
      ogTitle: "VizCad: Ücretsiz STL Viewer ve 3D Modeller Görüntüleyici Online",
      ogDescription: "Profesyonel STL viewer ve 3D modeller görüntüleyici. STL file dosyalarını anında yükleyin ve render rendering ile görselleştirin.",
      twitterTitle: "VizCad - STL Viewer ve 3D Modeller Görüntüleyici",
      twitterDescription: "Profesyonel STL viewer ve 3D modeller görüntüleyici. STL file, OBJ dosyalarını render rendering ile görselleştirin.",
    },
    app: {
      title: "3D Viewer Uygulaması - VizCad | STL Viewer | 3D Modeller Render",
      description: "VizCad 3D Viewer ve STL Viewer Uygulaması - STL file, OBJ, PLY, 3MF dosyalarını profesyonel render rendering ile yükleyin. 3D modeller görselleştirme, wireframe görünümü ve stüdyo ışıklandırması.",
      keywords: "3d viewer, stl viewer, stl file viewer, 3d modeller, render rendering, obj viewer, ply viewer, 3mf viewer, 3d file viewer, stl viewer online, wireframe, 3d görselleştirme",
      ogTitle: "VizCad 3D Viewer - Profesyonel STL Viewer ve 3D Modeller Uygulaması",
      ogDescription: "Profesyonel STL viewer ve 3D modeller uygulaması. STL file yükleyin ve render rendering ile görselleştirin.",
      twitterTitle: "VizCad 3D Viewer - STL Viewer ve 3D Modeller",
      twitterDescription: "Profesyonel STL viewer ve render rendering. 3D modeller ve STL file dosyalarını anında görselleştirin.",
    },
    contact: {
      title: "VizCad İletişim - STL Viewer ve 3D Modeller Destek",
      description: "STL viewer, 3D modeller görüntüleme ve render rendering için VizCad ekibi ile iletişime geçin. Teknik destek ve özellik talepleri.",
      keywords: "VizCad iletişim, stl viewer destek, 3d modeller yardım, render rendering destek, teknik destek, 3d viewer yardım",
      ogTitle: "VizCad İletişim - STL Viewer ve 3D Modeller Desteği",
      ogDescription: "VizCad STL viewer ve 3D modeller için profesyonel destek. Render rendering ve teknik yardım.",
      twitterTitle: "VizCad İletişim - STL Viewer Destek",
      twitterDescription: "STL viewer ve 3D modeller için profesyonel destek. Render rendering konusunda yardım.",
    },
    faq: {
      title: "SSS - VizCad STL Viewer ve 3D Modeller Sorular",
      description: "VizCad STL viewer ve 3D modeller hakkında sık sorulan sorular. Render rendering, STL file desteği, desteklenen formatlar hakkında cevaplar.",
      keywords: "VizCad SSS, stl viewer soruları, 3d modeller yardım, render rendering yardım, stl file destek, 3d viewer yardım",
      ogTitle: "VizCad SSS - STL Viewer ve 3D Modeller Sorular",
      ogDescription: "VizCad STL viewer ve 3D modeller hakkında cevaplar. Render rendering ve STL file desteği.",
      twitterTitle: "VizCad SSS - STL Viewer Sorular",
      twitterDescription: "STL viewer, 3D modeller ve render rendering hakkında sık sorulan sorular.",
    },
    modelSnap: {
      title: "ModelSnap | VizCad: STL File'ı PNG, JPG, CSV'ye Çevir - 3D Modeller Render",
      description: "VizCad'in ModelSnap aracı ile STL file dosyalarını PNG, JPG görsellerine veya CSV verilerine çevirin. 3D modeller yükleyin ve render rendering ile görsel çıktılar oluşturun.",
      keywords: "STL file dönüştürme, STL'den PNG, STL'den JPG, 3d modeller görsele, STL viewer, render rendering, STL dönüştürücü, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: STL File'ı PNG, JPG'ye Çevir - Render Rendering",
      ogDescription: "STL file dosyalarını ModelSnap ile PNG, JPG'ye çevirin. 3D modeller için render rendering ile görsel çıktılar.",
      twitterTitle: "ModelSnap | VizCad: STL File Dönüştürücü - Render Rendering",
      twitterDescription: "STL file'ı render rendering ile PNG, JPG'ye çevirin. 3D modeller için online dönüştürücü.",
    },
  },
  de: {
    root: {
      description: "VizCad - Professioneller 3D Models Viewer und Render Rendering Tool. STL Viewer für STL, OBJ, PLY, 3MF-Dateien. Kostenloser browserbasierter 3D Viewer.",
      keywords: "3d models, render rendering, stl viewer, 3d viewer, 3d render, dwg file viewer, free 3d, stl file viewer, obj viewer, ply viewer, 3mf viewer, online 3d viewer",
      locale: "de_DE",
    },
    home: {
      title: "VizCad: Kostenloser STL Viewer | 3D Models Viewer | Render Rendering Online",
      description: "VizCad ist ein professioneller STL Viewer und 3D Models Viewer. Laden Sie STL, OBJ, PLY, 3MF-Dateien mit render rendering hoch. Kostenloser Online-3D Viewer mit Studioqualität.",
      keywords: "3d models, render rendering, stl viewer, 3d render, dwg file viewer, free 3d, stl file viewer, 3d viewer, obj viewer, ply viewer, online stl viewer",
      ogTitle: "VizCad: Kostenloser STL Viewer und 3D Models Viewer mit Render Rendering",
      ogDescription: "Professioneller STL Viewer und 3D Models Viewer. Laden Sie Dateien mit render rendering hoch. Kostenloser Online-3D Viewer.",
      twitterTitle: "VizCad - STL Viewer und 3D Models Viewer",
      twitterDescription: "Professioneller STL Viewer mit render rendering. 3D Models sofort visualisieren.",
    },
    app: {
      title: "3D Viewer App - VizCad | STL Viewer | 3D Models Render Online",
      description: "VizCad 3D Viewer und STL Viewer App - Laden Sie STL, OBJ, PLY, 3MF-Dateien mit render rendering hoch. Professioneller 3D Models Viewer mit Wireframe-Ansicht.",
      keywords: "3d viewer, stl viewer, 3d models, render rendering, 3d render, stl file viewer, obj viewer, ply viewer, 3mf viewer, dwg file viewer, online 3d viewer",
      ogTitle: "VizCad 3D Viewer App - STL Viewer und 3D Models mit Render Rendering",
      ogDescription: "Professionelle 3D Viewer App mit STL Viewer. Laden Sie 3D Models mit render rendering hoch.",
      twitterTitle: "VizCad 3D Viewer - STL Viewer und Render Tool",
      twitterDescription: "Professioneller STL Viewer mit render rendering. 3D Models sofort visualisieren.",
    },
    contact: {
      title: "Kontakt VizCad - STL Viewer und 3D Models Support",
      description: "Kontaktieren Sie VizCad für STL Viewer und 3D Models Support. Hilfe bei render rendering und technischen Problemen.",
      keywords: "VizCad Kontakt, stl viewer support, 3d models hilfe, render rendering support, 3d viewer hilfe, technischer support",
      ogTitle: "Kontakt VizCad - STL Viewer und 3D Models Support",
      ogDescription: "Professioneller Support für VizCad STL Viewer und 3D Models. Hilfe bei render rendering.",
      twitterTitle: "Kontakt VizCad - STL Viewer Support",
      twitterDescription: "Support für STL Viewer und 3D Models. Hilfe bei render rendering.",
    },
    faq: {
      title: "FAQ - VizCad STL Viewer und 3D Models Fragen",
      description: "Häufig gestellte Fragen zum VizCad STL Viewer und 3D Models. Antworten zu render rendering und unterstützten Formaten.",
      keywords: "VizCad FAQ, stl viewer fragen, 3d models hilfe, render rendering hilfe, 3d viewer fragen, dwg file viewer",
      ogTitle: "VizCad FAQ - STL Viewer und 3D Models Fragen",
      ogDescription: "Antworten zum VizCad STL Viewer und 3D Models. Informationen zu render rendering.",
      twitterTitle: "VizCad FAQ - STL Viewer Fragen",
      twitterDescription: "Häufige Fragen zu STL Viewer, 3D Models und render rendering.",
    },
    modelSnap: {
      title: "ModelSnap | VizCad: STL zu PNG, JPG, CSV konvertieren - 3D Models Render",
      description: "Mit ModelSnap von VizCad STL-Dateien mit render rendering in PNG, JPG oder CSV konvertieren. 3D Models hochladen und visuelle Ausgaben erzeugen.",
      keywords: "STL zu PNG, STL zu JPG, STL zu CSV, 3d models converter, stl viewer, render rendering, STL konverter, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: STL Konverter mit Render Rendering",
      ogDescription: "STL-Dateien mit render rendering in PNG, JPG konvertieren. 3D Models visualisieren.",
      twitterTitle: "ModelSnap | VizCad: STL zu Bild Konverter",
      twitterDescription: "STL mit render rendering zu PNG, JPG konvertieren. 3D Models online.",
    },
  },
  es: {
    root: {
      description: "VizCad - Visor profesional de 3D Models con render rendering. STL Viewer para archivos STL, OBJ, PLY, 3MF. Herramienta gratuita de visualización 3D.",
      keywords: "3d models, render rendering, stl viewer, 3d viewer, dwg file viewer, free 3d, stl file viewer, obj viewer, ply viewer, 3mf viewer, visor 3d online",
      locale: "es_ES",
    },
    home: {
      title: "VizCad: Visor STL Gratis | 3D Models Viewer | Render Rendering Online",
      description: "VizCad es un STL Viewer profesional y visor de 3D Models. Carga archivos STL, OBJ, PLY, 3MF con render rendering. Visor 3D online gratuito con calidad de estudio.",
      keywords: "3d models, render rendering, stl viewer, dwg file viewer, free 3d, stl file viewer, 3d viewer, obj viewer, ply viewer, visor stl online",
      ogTitle: "VizCad: Visor STL y 3D Models con Render Rendering Online",
      ogDescription: "Visor profesional STL y 3D Models. Carga archivos con render rendering. Visor 3D online gratuito.",
      twitterTitle: "VizCad - Visor STL y 3D Models",
      twitterDescription: "Visor profesional STL con render rendering. Visualiza 3D Models al instante.",
    },
    app: {
      title: "Aplicación Visor 3D - VizCad | STL Viewer | 3D Models Render",
      description: "Aplicación VizCad 3D Viewer y STL Viewer - Carga archivos STL, OBJ, PLY, 3MF con render rendering. Visor profesional de 3D Models con vista alambre.",
      keywords: "3d viewer, stl viewer, 3d models, render rendering, stl file viewer, obj viewer, ply viewer, 3mf viewer, dwg file viewer, visor 3d online",
      ogTitle: "Aplicación VizCad 3D Viewer - STL Viewer con Render Rendering",
      ogDescription: "Aplicación profesional 3D Viewer con STL Viewer. Carga 3D Models con render rendering.",
      twitterTitle: "VizCad 3D Viewer - STL Viewer y Render",
      twitterDescription: "Visor profesional STL con render rendering. Visualiza 3D Models al instante.",
    },
    contact: {
      title: "Contacto VizCad - Soporte STL Viewer y 3D Models",
      description: "Contacta a VizCad para soporte de STL Viewer y 3D Models. Ayuda con render rendering y problemas técnicos.",
      keywords: "VizCad contacto, soporte stl viewer, ayuda 3d models, soporte render rendering, ayuda 3d viewer, soporte técnico",
      ogTitle: "Contacto VizCad - Soporte STL Viewer y 3D Models",
      ogDescription: "Soporte profesional para VizCad STL Viewer y 3D Models. Ayuda con render rendering.",
      twitterTitle: "Contacto VizCad - Soporte STL Viewer",
      twitterDescription: "Soporte para STL Viewer y 3D Models. Ayuda con render rendering.",
    },
    faq: {
      title: "FAQ - Preguntas VizCad STL Viewer y 3D Models",
      description: "Preguntas frecuentes sobre VizCad STL Viewer y 3D Models. Respuestas sobre render rendering y formatos soportados.",
      keywords: "VizCad FAQ, preguntas stl viewer, ayuda 3d models, ayuda render rendering, preguntas 3d viewer, dwg file viewer",
      ogTitle: "FAQ VizCad - Preguntas STL Viewer y 3D Models",
      ogDescription: "Respuestas sobre VizCad STL Viewer y 3D Models. Información sobre render rendering.",
      twitterTitle: "FAQ VizCad - Preguntas STL Viewer",
      twitterDescription: "Preguntas frecuentes sobre STL Viewer, 3D Models y render rendering.",
    },
    modelSnap: {
      title: "ModelSnap | VizCad: Convertir STL a PNG, JPG, CSV - 3D Models Render",
      description: "Con ModelSnap de VizCad convierte archivos STL con render rendering a PNG, JPG o CSV. Carga 3D Models y genera salidas visuales.",
      keywords: "STL a PNG, STL a JPG, STL a CSV, convertidor 3d models, stl viewer, render rendering, convertidor STL, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: Convertidor STL con Render Rendering",
      ogDescription: "Convierte archivos STL con render rendering a PNG, JPG. Visualiza 3D Models.",
      twitterTitle: "ModelSnap | VizCad: Convertidor STL a Imagen",
      twitterDescription: "Convierte STL con render rendering a PNG, JPG. 3D Models online.",
    },
  },
  fr: {
    root: {
      description: "VizCad - Visionneuse professionnelle 3D Models avec render rendering. STL Viewer pour fichiers STL, OBJ, PLY, 3MF. Outil gratuit de visualisation 3D.",
      keywords: "3d models, render rendering, stl viewer, 3d viewer, dwg file viewer, free 3d model downloads, 3d design, cad design, cad software, obj viewer, visionneuse 3d",
      locale: "fr_FR",
    },
    home: {
      title: "VizCad: Visionneuse STL Gratuite | 3D Models Viewer | Render Rendering",
      description: "VizCad est une STL Viewer professionnelle et visionneuse 3D Models. Téléchargez fichiers STL, OBJ, PLY, 3MF avec render rendering. Visionneuse 3D en ligne gratuite.",
      keywords: "3d models, render rendering, stl viewer, dwg file viewer, free 3d model downloads, 3d design, cad design, cad software, 3d viewer, obj viewer, visionneuse stl",
      ogTitle: "VizCad: Visionneuse STL et 3D Models avec Render Rendering",
      ogDescription: "Visionneuse professionnelle STL et 3D Models. Téléchargez avec render rendering. Visionneuse 3D gratuite.",
      twitterTitle: "VizCad - Visionneuse STL et 3D Models",
      twitterDescription: "Visionneuse professionnelle STL avec render rendering. Visualisez 3D Models instantanément.",
    },
    app: {
      title: "Application Visionneuse 3D - VizCad | STL Viewer | 3D Models Render",
      description: "Application VizCad 3D Viewer et STL Viewer - Téléchargez fichiers STL, OBJ, PLY, 3MF avec render rendering. Visionneuse professionnelle 3D Models avec vue fil de fer.",
      keywords: "3d viewer, stl viewer, 3d models, render rendering, 3d design, cad design, stl file viewer, obj viewer, ply viewer, dwg file viewer, visionneuse 3d",
      ogTitle: "Application VizCad 3D Viewer - STL Viewer avec Render Rendering",
      ogDescription: "Application professionnelle 3D Viewer avec STL Viewer. Téléchargez 3D Models avec render rendering.",
      twitterTitle: "VizCad 3D Viewer - STL Viewer et Render",
      twitterDescription: "Visionneuse professionnelle STL avec render rendering. Visualisez 3D Models instantanément.",
    },
    contact: {
      title: "Contact VizCad - Support STL Viewer et 3D Models",
      description: "Contactez VizCad pour support STL Viewer et 3D Models. Aide avec render rendering et problèmes techniques.",
      keywords: "VizCad contact, support stl viewer, aide 3d models, support render rendering, aide 3d viewer, support technique",
      ogTitle: "Contact VizCad - Support STL Viewer et 3D Models",
      ogDescription: "Support professionnel pour VizCad STL Viewer et 3D Models. Aide avec render rendering.",
      twitterTitle: "Contact VizCad - Support STL Viewer",
      twitterDescription: "Support pour STL Viewer et 3D Models. Aide avec render rendering.",
    },
    faq: {
      title: "FAQ - Questions VizCad STL Viewer et 3D Models",
      description: "Questions fréquentes sur VizCad STL Viewer et 3D Models. Réponses sur render rendering et formats pris en charge.",
      keywords: "VizCad FAQ, questions stl viewer, aide 3d models, aide render rendering, questions 3d viewer, dwg file viewer, cad design",
      ogTitle: "FAQ VizCad - Questions STL Viewer et 3D Models",
      ogDescription: "Réponses sur VizCad STL Viewer et 3D Models. Informations sur render rendering.",
      twitterTitle: "FAQ VizCad - Questions STL Viewer",
      twitterDescription: "Questions fréquentes sur STL Viewer, 3D Models et render rendering.",
    },
    modelSnap: {
      title: "ModelSnap | VizCad: Convertir STL en PNG, JPG, CSV - 3D Models Render",
      description: "Avec ModelSnap de VizCad, convertissez fichiers STL avec render rendering en PNG, JPG ou CSV. Téléchargez 3D Models et générez sorties visuelles.",
      keywords: "STL vers PNG, STL vers JPG, STL vers CSV, convertisseur 3d models, stl viewer, render rendering, convertisseur STL, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: Convertisseur STL avec Render Rendering",
      ogDescription: "Convertissez fichiers STL avec render rendering en PNG, JPG. Visualisez 3D Models.",
      twitterTitle: "ModelSnap | VizCad: Convertisseur STL en Image",
      twitterDescription: "Convertissez STL avec render rendering en PNG, JPG. 3D Models en ligne.",
    },
  },
  hi: {
    root: {
      description: "VizCad - पेशेवर 3D मॉडल व्यूअर और रेंडर टूल। STL व्यूअर के साथ STL, OBJ, PLY, 3MF फ़ाइलें अपलोड करें। मुफ्त ब्राउज़र-आधारित 3D व्यूअर।",
      keywords: "3d viewer, 3d models, stl viewer, render rendering, stl file viewer, obj viewer, ply viewer, 3mf viewer, cad viewer, 3d file viewer, online 3d viewer",
      locale: "hi_IN",
    },
    home: {
      title: "VizCad: मुफ्त STL व्यूअर | 3D मॉडल व्यूअर | रेंडर टूल ऑनलाइन",
      description: "VizCad एक पेशेवर STL व्यूअर और 3D मॉडल व्यूअर है। STL फ़ाइल, OBJ, PLY, 3MF फ़ाइलें रेंडर रेंडरिंग के साथ अपलोड करें। मुफ्त ऑनलाइन 3D व्यूअर।",
      keywords: "stl viewer, 3d models, 3d viewer, render rendering, stl file viewer, obj viewer, ply viewer, 3mf viewer, 3d file viewer, online stl viewer, cad viewer",
      ogTitle: "VizCad: मुफ्त STL व्यूअर और 3D मॉडल व्यूअर रेंडर रेंडरिंग के साथ",
      ogDescription: "पेशेवर STL व्यूअर और 3D मॉडल व्यूअर। STL फ़ाइल रेंडर रेंडरिंग के साथ अपलोड करें।",
      twitterTitle: "VizCad - STL व्यूअर और 3D मॉडल",
      twitterDescription: "पेशेवर STL व्यूअर रेंडर रेंडरिंग के साथ। 3D मॉडल तुरंत देखें।",
    },
    app: {
      title: "3D व्यूअर ऐप - VizCad | STL व्यूअर | 3D मॉडल रेंडर",
      description: "VizCad 3D व्यूअर और STL व्यूअर ऐप - STL फ़ाइल, OBJ, PLY, 3MF फ़ाइलें रेंडर रेंडरिंग के साथ अपलोड करें। पेशेवर 3D मॉडल व्यूअर।",
      keywords: "3d viewer, stl viewer, 3d models, render rendering, stl file viewer, obj viewer, ply viewer, 3mf viewer, 3d file viewer, online 3d viewer",
      ogTitle: "VizCad 3D व्यूअर ऐप - STL व्यूअर रेंडर रेंडरिंग के साथ",
      ogDescription: "पेशेवर 3D व्यूअर ऐप STL व्यूअर के साथ। 3D मॉडल रेंडर रेंडरिंग के साथ अपलोड करें।",
      twitterTitle: "VizCad 3D व्यूअर - STL व्यूअर और रेंडर",
      twitterDescription: "पेशेवर STL व्यूअर रेंडर रेंडरिंग के साथ। 3D मॉडल तुरंत देखें।",
    },
    contact: {
      title: "VizCad संपर्क करें - STL व्यूअर और 3D मॉडल सपोर्ट",
      description: "STL व्यूअर और 3D मॉडल सपोर्ट के लिए VizCad से संपर्क करें। रेंडर रेंडरिंग और तकनीकी समस्याओं में मदद।",
      keywords: "VizCad संपर्क, stl viewer सपोर्ट, 3d models मदद, render rendering सपोर्ट, 3d viewer मदद, तकनीकी सपोर्ट",
      ogTitle: "VizCad संपर्क - STL व्यूअर और 3D मॉडल सपोर्ट",
      ogDescription: "VizCad STL व्यूअर और 3D मॉडल के लिए पेशेवर सपोर्ट। रेंडर रेंडरिंग में मदद।",
      twitterTitle: "VizCad संपर्क - STL व्यूअर सपोर्ट",
      twitterDescription: "STL व्यूअर और 3D मॉडल के लिए सपोर्ट। रेंडर रेंडरिंग में मदद।",
    },
    faq: {
      title: "FAQ - VizCad STL व्यूअर और 3D मॉडल प्रश्न",
      description: "VizCad STL व्यूअर और 3D मॉडल के बारे में अक्सर पूछे जाने वाले प्रश्न। रेंडर रेंडरिंग और समर्थित फ़ॉर्मेट के उत्तर।",
      keywords: "VizCad FAQ, stl viewer प्रश्न, 3d models मदद, render rendering मदद, 3d viewer प्रश्न, cad viewer",
      ogTitle: "VizCad FAQ - STL व्यूअर और 3D मॉडल प्रश्न",
      ogDescription: "VizCad STL व्यूअर और 3D मॉडल के उत्तर। रेंडर रेंडरिंग की जानकारी।",
      twitterTitle: "VizCad FAQ - STL व्यूअर प्रश्न",
      twitterDescription: "STL व्यूअर, 3D मॉडल और रेंडर रेंडरिंग के बारे में प्रश्न।",
    },
    modelSnap: {
      title: "ModelSnap | VizCad: STL फ़ाइल को PNG, JPG, CSV में बदलें - 3D मॉडल रेंडर",
      description: "VizCad का ModelSnap टूल STL फ़ाइल को रेंडर रेंडरिंग के साथ PNG, JPG या CSV में बदलता है। 3D मॉडल अपलोड करें और विज़ुअल आउटपुट बनाएं।",
      keywords: "STL से PNG, STL से JPG, STL से CSV, 3d models कन्वर्टर, stl viewer, render rendering, STL कन्वर्टर, VizCad ModelSnap",
      ogTitle: "ModelSnap | VizCad: STL कन्वर्टर रेंडर रेंडरिंग के साथ",
      ogDescription: "STL फ़ाइल को रेंडर रेंडरिंग के साथ PNG, JPG में बदलें। 3D मॉडल देखें।",
      twitterTitle: "ModelSnap | VizCad: STL से इमेज कन्वर्टर",
      twitterDescription: "STL को रेंडर रेंडरिंग के साथ PNG, JPG में बदलें। 3D मॉडल ऑनलाइन।",
    },
  },
};