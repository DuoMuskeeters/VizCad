export const detectLanguage = (): 'en' | 'tr' | 'de' | 'es' | 'fr' => {
  // Server-side check
  if (typeof window === 'undefined') {
    return 'en' // Default to English for SSR
  }

  // 1. Cookie'den kontrol et (server/client arası tutarlılık için)
  try {
    const cookieMatch = document.cookie.match(/(?:^|; )vizcad-language=([^;]+)/)
    if (cookieMatch && cookieMatch[1]) {
      const c = decodeURIComponent(cookieMatch[1])
      if (c === 'tr' || c === 'en' || c === 'de' || c === 'es' || c === 'fr') {
        return c as 'en' | 'tr' | 'de' | 'es' | 'fr'
      }
    }
  } catch (e) {
    // ignore cookie errors
  }

  // 2. localStorage'dan kontrol et (eğer daha önce seçilmişse)
  try {
    const savedLang = localStorage.getItem('vizcad-language')
    if (savedLang === 'tr' || savedLang === 'en' || savedLang === 'de' || savedLang === 'es' || savedLang === 'fr') {
      return savedLang as 'en' | 'tr' | 'de' | 'es' | 'fr'
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
      title: "VizCad - Online STP Viewer & 3D Collaboration Platform",
      description: "VizCad is the fastest online STP viewer and 3D collaboration tool. Upload, view, and share STEP, STL, OBJ files in your browser. No installation required.",
      keywords: "online stp viewer, step file viewer, stl viewer online, share 3d models, cloud cad viewer, 3d collaboration, view step file online, obj viewer free, cad design review, webgl viewer, vizcad",
      locale: "en_US",
    },
    home: {
      title: "Free Online STP Viewer & 3D Sharing Platform | VizCad",
      description: "View, share, and review STEP, STP, STL, and OBJ files instantly in your browser. No installation required. Secure cloud 3D collaboration for teams.",
      keywords: "online stp viewer, step file viewer, stl viewer online, share 3d models, cloud cad viewer, 3d collaboration, view step file online, vizcad, obj viewer",
      ogTitle: "VizCad: The Fastest Online STP Viewer & Collaboration Tool",
      ogDescription: "Stop sending heavy email attachments. Upload, view, and share 3D models (STEP, STL, OBJ) via secure links. Try VizCad for free.",
      twitterTitle: "VizCad - Online STP Viewer & 3D Sharing",
      twitterDescription: "View and share STEP, STL, and OBJ files in seconds. Professional browser-based 3D viewer."
    },

    app: {
      title: "VizCad Studio - Online STP Viewer & 3D Tools",
      description: "Launch VizCad Studio to view, measure, and analyze 3D models. Professional STEP, STL, OBJ viewer with real-time collaboration. No installation.",
      ogTitle: "VizCad Studio - Professional Online STP & STL Viewer",
      ogDescription: "Launch VizCad Studio. View, analyze, and share 3D CAD files in your browser. Professional tools for engineering teams.",
      twitterTitle: "VizCad Studio - Online 3D Viewer for Teams",
      twitterDescription: "Launch VizCad Studio. The fastest online STP and STL viewer with collaboration tools."
    },

    contact: {
      title: "Contact VizCad - Support: 3D Viewer & Enterprise Solutions",
      description: "Get in touch with the VizCad team. Support for our online STP viewer, API access, bug reports, or enterprise collaboration plans.",
      ogTitle: "Contact VizCad Team - Support & Inquiries",
      ogDescription: "Need help with VizCad? Contact our support team for technical assistance or enterprise inquiries.",
      twitterTitle: "Contact VizCad - 3D Viewer Support",
      twitterDescription: "Get help with VizCad's online 3D viewer and collaboration tools.",
    },

    faq: {
      title: "FAQ - Questions About VizCad Online STP Viewer & Features",
      description: "Find answers about VizCad's supported formats (STEP, STL, OBJ), security, free tier limits, and how to share 3D models online securely.",
      ogTitle: "VizCad FAQ - Common Questions & Tutorials",
      ogDescription: "Learn how to view STEP files online, share 3D models securely, and use VizCad's collaboration features.",
      twitterTitle: "VizCad FAQ - 3D Viewer Help",
      twitterDescription: "Answers to common questions about VizCad's online STP viewer and collaboration tools.",
    },

    modelSnap: {
      title: "ModelSnap | High-Quality 3D Renders & Snapshots Online",
      description: "Instantly capture studio-quality images of your STEP or STL files with ModelSnap. Convert 3D views to PNG/JPG for reports without complex rendering software.",
      ogTitle: "ModelSnap - Turn 3D Models into Professional Images Instantly",
      ogDescription: "Create studio-quality renders from your CAD files in seconds. Perfect for engineering reports and client presentations.",
      twitterTitle: "ModelSnap - Instant 3D Rendering Tool",
      twitterDescription: "Convert STEP and STL files to high-quality images instantly. No rendering expertise needed.",
    },
  },
  tr: {
    root: {
      title: "STP Viewer Online | STEP Dosyası Açma Programı | VizCad",
      description: "STEP, STP ve STL dosyalarını tarayıcınızda ücretsiz açın. Kurulum gerektirmeyen en hızlı online STP açıcı. Mühendislik ekipleri için güvenli işbirliği platformu.",
      keywords: "stp viewer online, step dosyası açma, stp dosyası görüntüle, stl viewer online, ücretsiz step açıcı, cad dosyası açma programı, 3d model paylaş, vizcad",
      ogTitle: "VizCad - En Hızlı Online STP ve STEP Dosyası Açıcı",
      ogDescription: "CAD dosyalarını program kurmadan anında tarayıcıda açın. 3D modellerinizi ekibinizle veya müşterilerinizle güvenle paylaşın.",
      twitterTitle: "VizCad Studio - Online 3D Model Görüntüleme",
      twitterDescription: "STEP ve STL dosyalarını tarayıcıda sorunsuz açın ve paylaşın. Ücretsiz, hızlı ve kurulumsuz.",
      locale: "tr_TR"
    },
    home: {
      title: "Ücretsiz Online STP Görüntüleyici ve 3D Paylaşım | VizCad",
      description: "STEP, STP, STL ve OBJ dosyalarını tarayıcıda anında açın, paylaşın ve inceleyin. Kurulum gerektirmez. Ekipler için güvenli bulut tabanlı 3D işbirliği.",
      keywords: "online stp viewer, step dosyası açma, stl viewer online, 3d model paylaş, bulut cad görüntüleyici, 3d işbirliği, step dosyası görüntüle online, vizcad",
      ogTitle: "VizCad: En Hızlı Online STP Görüntüleyici ve İşbirliği Aracı",
      ogDescription: "Büyük e-posta ekleri göndermeyi bırakın. 3D modelleri (STEP, STL, OBJ) yükleyin ve güvenli linklerle paylaşın. VizCad'i ücretsiz deneyin.",
      twitterTitle: "VizCad - Online STP Görüntüleyici ve 3D Paylaşım",
      twitterDescription: "STEP, STL ve OBJ dosyalarını saniyeler içinde görüntüleyin. Profesyonel tarayıcı tabanlı 3D görüntüleyici.",
    },

    app: {
      title: "VizCad Studio - Online STEP Görüntüleme ve Ölçüm Aracı",
      description: "3D modelleri tarayıcıda açmak, hassas ölçümler yapmak ve analiz etmek için VizCad Studio'yu kullanın. STEP ve STL için profesyonel araçlar. Kurulumsuz.",
      ogTitle: "VizCad Studio: Tarayıcıda Profesyonel 3D Görüntüleme",
      ogDescription: "STEP modellerini profesyonel araçlarla online analiz edin. Teknik incelemeler için geliştirilmiş 3D stüdyo.",
      twitterTitle: "VizCad Studio - 3D CAD Online Görüntüleme",
      twitterDescription: "STEP ve STL dosyalarını profesyonelce görüntüleyin ve ölçün. Herhangi bir yazılım yüklemenize gerek yok."
    },

    modelSnap: {
      title: "ModelSnap | Online 3D Render ve CAD Görsel Oluşturucu",
      description: "ModelSnap ile STEP dosyalarınızdan yüksek kaliteli renderlar alın. Raporlarınız için 3D görünümleri saniyeler içinde PNG veya JPG'ye dönüştürün.",
      ogTitle: "ModelSnap - CAD Dosyalarından Profesyonel 3D Görseller",
      ogDescription: "3D modelleriniz için anında stüdyo kalitesinde görseller oluşturun. Sunumlar ve teknik dokümanlar için mükemmel sonuç.",
      twitterTitle: "ModelSnap - 3D CAD Görsel Dönüştürücü",
      twitterDescription: "3D modellerinizden yüksek çözünürlüklü görselleri anında tarayıcıda oluşturun. Render yazılımı gerekmez."
    },

    contact: {
      title: "İletişim | VizCad - 3D Görüntüleyici Destek ve Kurumsal",
      description: "VizCad ekibiyle iletişime geçin. STP görüntüleyici desteği, API erişimi veya kurumsal çözümler için bize ulaşın.",
      ogTitle: "VizCad İletişim - Destek ve Talepler",
      ogDescription: "Sorularınız için destek ekibimiz teknik konularda veya kurumsal taleplerinizde size yardımcı olmaktan mutluluk duyar.",
      twitterTitle: "VizCad Destek - Bizimle İletişime Geçin",
      twitterDescription: "VizCad 3D görüntüleyici için teknik destek ve işbirliği talepleri."
    },

    faq: {
      title: "Sıkça Sorulan Sorular | VizCad Online STP Görüntüleyici",
      description: "STEP açma, güvenlik ve 3D paylaşım hakkında tüm yanıtlar. CAD dosyalarını online ortamda nasıl güvenle paylaşacağınızı öğrenin.",
      ogTitle: "VizCad SSS - Sıkça Sorulan Sorular ve Rehberler",
      ogDescription: "STEP dosyalarını online açmayı ve VizCad özelliklerini en verimli şekilde kullanmayı öğrenin.",
      twitterTitle: "VizCad SSS - Yardım ve Kılavuzlar",
      twitterDescription: "VizCad'de STEP ve STL dosyalarını online çalıştırma hakkında bilmeniz gereken her şey."
    }
  },
  de: {
    root: {
      title: "STP & STEP Dateien online öffnen | 3D Betrachter | VizCad",
      description: "Öffnen Sie STP-, STEP- und STL-Dateien kostenlos direkt im Browser. Der schnellste 3D-Betrachter ohne Installation. Sichere Zusammenarbeit für Ingenieure.",
      keywords: "stp viewer online, step datei öffnen, stp betrachter, stp datei online öffnen, stl viewer online, step viewer kostenlos, cad viewer online, 3d modelle teilen",
      ogTitle: "VizCad - Ihr professioneller 3D-Betrachter für STEP-Dateien",
      ogDescription: "CAD-Modelle sofort im Browser öffnen. Keine Software-Installation nötig. Teilen Sie Ihre Entwürfe sicher mit Ihrem Team.",
      twitterTitle: "VizCad Studio - 3D-Modelle online ansehen",
      twitterDescription: "Öffnen und teilen Sie STEP- und STL-Dateien sicher im Browser. Kostenlos, schnell ve kurulumsuz.",
      locale: "de_DE"
    },
    home: {
      title: "Kostenloser STP Viewer Online & 3D Plattform | VizCad",
      description: "STEP, STP, STL und OBJ Dateien sofort im Browser öffnen und teilen. Keine Installation nötig. Sichere Cloud-3D-Zusammenarbeit für Teams.",
      keywords: "stp viewer online, step datei öffnen, stl viewer online, 3d modelle teilen, cloud cad viewer, 3d zusammenarbeit, step datei online ansehen, vizcad",
      ogTitle: "VizCad: Der schnellste Online STP Viewer & Collaboration Tool",
      ogDescription: "Keine schweren E-Mail-Anhänge mehr. Laden Sie 3D-Modelle (STEP, STL, OBJ) hoch ve teilen Sie diese über sichere Links. VizCad kostenlos testen.",
      twitterTitle: "VizCad - Online STP Viewer & 3D Sharing",
      twitterDescription: "STEP, STL und OBJ Dateien in Sekundenschnelle betrachten. Professioneller browserbasierter 3D-Viewer."
    },

    app: {
      title: "VizCad Studio - STEP-Dateien online ansehen & messen",
      description: "Nutzen Sie VizCad Studio zum Öffnen, Messen und Analysieren von 3D-Modellen im Browser. Profi-Werkzeuge für STEP und STL. Sicher und installationsfrei.",
      ogTitle: "VizCad Studio: Professionelle 3D-Analyse im Browser",
      ogDescription: "Analysieren Sie STEP-Modelle online mit präzisen Werkzeugen. Das ideale Studio für technische Überprüfungen.",
      twitterTitle: "VizCad Studio - 3D CAD Online Viewer",
      twitterDescription: "STEP- und STL-Dateien professionell im Browser betrachten ve messen. Keine Software nötig."
    },

    modelSnap: {
      title: "ModelSnap | 3D-Renderings & CAD-Snapshots online",
      description: "Erstellen Sie hochwertige Bilder aus Ihren STEP-Dateien mit ModelSnap. Konvertieren Sie 3D-Ansichten in PNG oder JPG für Ihre Berichte und Projekte.",
      ogTitle: "ModelSnap - Professionelle 3D-Bilder aus CAD-Daten",
      ogDescription: "Erstellen Sie sofort hochwertige Renderings Ihrer STEP-Dateien. Perfekt für Dokumentationen und Präsentationen.",
      twitterTitle: "ModelSnap - 3D CAD zu Bild Konverter",
      twitterDescription: "Erstellen Sie hochauflösende PNG/JPG-Bilder aus Ihren 3D-Modellen direkt im Browser."
    },

    contact: {
      title: "Kontakt VizCad - Support für 3D Betrachter & Enterprise",
      description: "Kontaktieren Sie das VizCad-Team. Support für unseren STP-Betrachter, API-Zugriff, Fehlerberichte oder Enterprise-Lösungen.",
      ogTitle: "VizCad Kontakt - Support und Anfragen",
      ogDescription: "Haben Sie Fragen? Unser Support-Team hilft Ihnen bei technischen Problemen oder Enterprise-Anfragen gerne weiter.",
      twitterTitle: "VizCad Support - Kontaktieren Sie uns",
      twitterDescription: "Technischer Support und Enterprise-Anfragen für den VizCad 3D-Betrachter."
    },

    faq: {
      title: "FAQ - Fragen zum VizCad Online STP Betrachter & Features",
      description: "Antworten zu Formaten (STEP, STL, OBJ), Sicherheit und 3D-Sharing. Erfahren Sie, wie Sie CAD-Dateien sicher online teilen.",
      ogTitle: "VizCad FAQ - Häufig gestellte Fragen und Tutorials",
      ogDescription: "Lernen Sie, wie Sie STEP-Dateien online öffnen, 3D-Modelle sicher teilen und VizCad-Funktionen optimal nutzen.",
      twitterTitle: "VizCad FAQ - Hilfe ve Anleitungen",
      twitterDescription: "Alles, was Sie über den Online-Betrieb von STEP- und STL-Dateien bei VizCad wissen müssen."
    }
  },
  es: {
    root: {
      title: "Visor STP Online | Abrir archivos STEP online | VizCad",
      description: "Abra archivos STEP, STP y STL gratis en su navegador. El visor STP online más rápido sin instalación. Colaboración 3D segura para equipos de ingeniería.",
      keywords: "visor stp online, abrir archivo step, abrir stp online, visor stl gratis, visualizador stp online, abrir archivos 3d sin programas, visor cad online",
      ogTitle: "VizCad - El Visor STP y STEP Online más Rápido",
      ogDescription: "Abra archivos CAD al instante en su navegador. Sin necesidad de software. Comparta sus modelos 3D de forma segura con su equipo o clientes.",
      twitterTitle: "VizCad Studio - Visualizador de Modelos 3D Online",
      twitterDescription: "Abra y comparta archivos STEP ve STL de forma segura en el navegador. Gratis, rápido y sin instalación.",
      locale: "es_ES"
    },
    home: {
      title: "Visor STP Online Gratis y Plataforma 3D | VizCad",
      description: "Visualice, comparta y revise archivos STEP, STP, STL ve OBJ al instante en su navegador. Sin instalación. Colaboración 3D segura para equipos.",
      keywords: "visor stp online, abrir archivo step, visor stl online, compartir modelos 3d, visor cad en la nube, colaboración 3d, ver archivos step online, vizcad",
      ogTitle: "VizCad: El Visor STP Online más Rápido y Herramienta de Colaboración",
      ogDescription: "Deje de enviar correos pesados. Suba, visualice ve comparta modelos 3D (STEP, STL, OBJ) mediante enlaces seguros. Pruebe VizCad gratis.",
      twitterTitle: "VizCad - Visor STP Online y Uso Compartido 3D",
      twitterDescription: "Vea y comparta archivos STEP, STL ve OBJ en segundos. Visor 3D profesional basado en navegador."
    },

    app: {
      title: "VizCad Studio - Visualizar y Medir Archivos STEP Online",
      description: "Utilice VizCad Studio para abrir, medir ve analizar modelos 3D en el navegador. Herramientas profesionales para STEP y STL. Sin instalación.",
      ogTitle: "VizCad Studio: Análisis 3D Profesional en el Navegador",
      ogDescription: "Analice modelos STEP online con herramientas precisas. El estudio 3D ideal para revisiones técnicas.",
      twitterTitle: "VizCad Studio - 3D CAD Online Viewer",
      twitterDescription: "Visualice y mida archivos STEP y STL de forma profesional. Sin necesidad de software."
    },

    modelSnap: {
      title: "ModelSnap | Renders 3D y Capturas CAD Online Gratis",
      description: "Cree imágenes de alta calidad de sus archivos STEP con ModelSnap. Convierta vistas 3D en PNG o JPG para sus informes y presentaciones al instante.",
      ogTitle: "ModelSnap - Imágenes 3D Profesionales desde Archivos CAD",
      ogDescription: "Cree renders de alta calidad para sus archivos STEP al instante. Resultados perfectos para documentación y presentaciones.",
      twitterTitle: "ModelSnap - Convertidor de CAD a Imagen 3D",
      twitterDescription: "Genere imágenes PNG/JPG de alta resolución de sus modelos 3D directamente en el navegador."
    },

    contact: {
      title: "Contacto | VizCad - Soporte de Visor 3D y Empresas",
      description: "Contacte con el equipo de VizCad. Soporte para el visor STP, acceso a la API, informes de errores o soluciones empresariales.",
      ogTitle: "Contacto VizCad - Soporte y Consultas",
      ogDescription: "¿Tiene preguntas? Nuestro equipo de soporte está listo para ayudarle con problemas técnicos o consultas empresariales.",
      twitterTitle: "Soporte VizCad - Contacte con nosotros",
      twitterDescription: "Soporte técnico y consultas empresariales para el visor 3D VizCad."
    },

    faq: {
      title: "Preguntas Frecuentes | VizCad Visor STP Online",
      description: "Respuestas sobre formatos (STEP, STL, OBJ), seguridad y uso compartido en 3D. Aprenda a compartir archivos CAD online de forma segura.",
      ogTitle: "FAQ de VizCad - Preguntas Frecuentes y Guías",
      ogDescription: "Aprenda a abrir archivos STEP online y a utilizar las funciones de VizCad de forma eficiente.",
      twitterTitle: "FAQ de VizCad - Ayuda y Guías",
      twitterDescription: "Todo lo que necesita saber sobre el uso de archivos STEP y STL online en VizCad."
    }
  },
  fr: {
    root: {
      title: "Visionneuse STP Online | Ouvrir fichier STEP en ligne | VizCad",
      description: "Ouvrez vos fichiers STEP, STP et STL gratuitement dans votre navigateur. La visionneuse STP la plus rapide sans installation. Collaboration 3D sécurisée.",
      keywords: "stp viewer online, visionneuse stp en ligne, ouvrir fichier step, visionneuse stl gratuite, ouvrir stp sans logiciel, cao en ligne, partager modèle 3d",
      ogTitle: "VizCad - La visionneuse STP ve STEP en ligne la plus rapide",
      ogDescription: "Ouvrez des fichiers CAD instantanément dans votre navigateur. Aucun logiciel requis. Partagez vos modèles 3D en toute sécurité avec votre équipe.",
      twitterTitle: "VizCad Studio - Visionneuse de modèles 3D en ligne",
      twitterDescription: "Ouvrez et partagez des fichiers STEP et STL en ligne. Gratuit, rapide ve sans installation.",
      locale: "fr_FR"
    },
    home: {
      title: "Visionneuse STP Online Gratuite & Plateforme 3D | VizCad",
      description: "Visualisez, partagez et révisez vos fichiers STEP, STP, STL ve OBJ instantanément. Aucune installation requise. Collaboration 3D sécurisée pour équipes.",
      keywords: "visionneuse stp en ligne, ouvrir fichier step, visionneuse stl en ligne, partager modèles 3d, visionneuse cao cloud, collaboration 3d, vizcad",
      ogTitle: "VizCad : La visionneuse STP en ligne la plus rapide",
      ogDescription: "Arrêtez d'envoyer de lourdes pièces jointes. Chargez, visualisez et partagez vos modèles 3D (STEP, STL, OBJ) via des liens sécurisés.",
      twitterTitle: "VizCad - Visionneuse STP en ligne & Partage 3D",
      twitterDescription: "Visualisez et partagez des fichiers STEP, STL et OBJ en quelques secondes. Visionneuse 3D professionnelle sur navigateur."
    },

    app: {
      title: "VizCad Studio - Visualiser et mesurer des fichiers STEP",
      description: "Utilisez VizCad Studio pour ouvrir, mesurer et analyser des modèles 3D. Outils professionnels pour STEP et STL. Sécurisé et sans installation.",
      ogTitle: "VizCad Studio : Analyse 3D professionnelle en ligne",
      ogDescription: "Analysez des modèles STEP en ligne avec des outils de précision. Le studio 3D idéal pour les revues techniques.",
      twitterTitle: "VizCad Studio - 3D CAD Online Viewer",
      twitterDescription: "Visualisez et mesurez des fichiers STEP et STL de manière professionnelle. Aucun logiciel requis."
    },

    modelSnap: {
      title: "ModelSnap | Rendu 3D ve captures d'écran CAD en ligne",
      description: "Créez des images de haute qualité de vos fichiers STEP avec ModelSnap. Convertissez vos vues 3D en PNG ou JPG pour vos rapports et présentations.",
      ogTitle: "ModelSnap - Images 3D professionnelles depuis fichiers CAD",
      ogDescription: "Générez des rendus de haute qualité pour vos fichiers STEP instantanément. Parfait pour la documentation et les présentations.",
      twitterTitle: "ModelSnap - Convertisseur CAD en image 3D",
      twitterDescription: "Générez des images PNG/JPG haute résolution de vos modèles 3D directement dans votre navigateur."
    },

    contact: {
      title: "Contact | VizCad - Support Visionneuse 3D et Entreprise",
      description: "Contactez l'équipe VizCad. Support pour notre visionneuse STP, accès API, rapports d'erreurs ou solutions d'entreprise.",
      ogTitle: "Contact VizCad - Support et demandes",
      ogDescription: "Des questions ? Notre équipe de support est prête à vous aider pour vos problèmes techniques ou demandes d'entreprise.",
      twitterTitle: "Support VizCad - Contactez-nous",
      twitterDescription: "Support technique et demandes d'entreprise pour la visionneuse 3D VizCad."
    },

    faq: {
      title: "FAQ | Questions sur la visionneuse STP en ligne VizCad",
      description: "Réponses sur les formats (STEP, STL, OBJ), la sécurité et le partage 3D. Apprenez à partager des fichiers CAD en ligne en toute sécurité.",
      ogTitle: "FAQ VizCad - Questions fréquentes et guides",
      ogDescription: "Apprenez à ouvrir des fichiers STEP en ligne et à utiliser efficacement les fonctionnalités de VizCad.",
      twitterTitle: "FAQ VizCad - Aide et guides",
      twitterDescription: "Tout ce que vous devez savoir sur l'utilisation des fichiers STEP et STL en ligne sur VizCad."
    }
  },
};