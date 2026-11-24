/**
 * Identity emails (verification, password reset) in the five product locales. Text keys live here until the
 * i18n module lands; English is the fallback. Every dynamic value is HTML-escaped for its context (docs/08 §1):
 * the user's name goes into text nodes, the link into an attribute and a text node.
 */
export const locales = ['en', 'tr', 'de', 'es', 'fr'] as const
export type Locale = (typeof locales)[number]

/** First supported language in an Accept-Language header; English otherwise. */
export const localeFromHeader = (header: string | null | undefined): Locale => {
  for (const part of (header ?? '').split(',')) {
    const tag = (part.split(';')[0] ?? '').trim().toLowerCase().split('-')[0]
    const match = locales.find((locale) => locale === tag)
    if (match) return match
  }
  return 'en'
}

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

interface Copy {
  readonly subject: string
  readonly heading: string
  readonly hello: (name: string) => string
  readonly body: string
  readonly button: string
  readonly orCopy: string
  readonly ignore: string
}

const verification: Record<Locale, Copy> = {
  en: {
    subject: 'Verify your VizCad account',
    heading: 'Welcome to VizCad',
    hello: (n) => `Hi ${n},`,
    body: 'Please confirm your email address to finish creating your account.',
    button: 'Verify email',
    orCopy: 'Or copy this link into your browser:',
    ignore: "If you didn't create an account, you can ignore this email.",
  },
  tr: {
    subject: 'VizCad hesabınızı doğrulayın',
    heading: "VizCad'e hoş geldiniz",
    hello: (n) => `Merhaba ${n},`,
    body: 'Hesabınızı oluşturmayı tamamlamak için e-posta adresinizi doğrulayın.',
    button: 'E-postayı doğrula',
    orCopy: 'Ya da bu bağlantıyı tarayıcınıza yapıştırın:',
    ignore: 'Hesabı siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.',
  },
  de: {
    subject: 'Bestätigen Sie Ihr VizCad-Konto',
    heading: 'Willkommen bei VizCad',
    hello: (n) => `Hallo ${n},`,
    body: 'Bitte bestätigen Sie Ihre E-Mail-Adresse, um die Kontoerstellung abzuschließen.',
    button: 'E-Mail bestätigen',
    orCopy: 'Oder kopieren Sie diesen Link in Ihren Browser:',
    ignore: 'Wenn Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.',
  },
  es: {
    subject: 'Verifica tu cuenta de VizCad',
    heading: 'Te damos la bienvenida a VizCad',
    hello: (n) => `Hola ${n},`,
    body: 'Confirma tu dirección de correo para terminar de crear tu cuenta.',
    button: 'Verificar correo',
    orCopy: 'O copia este enlace en tu navegador:',
    ignore: 'Si no creaste una cuenta, puedes ignorar este correo.',
  },
  fr: {
    subject: 'Vérifiez votre compte VizCad',
    heading: 'Bienvenue sur VizCad',
    hello: (n) => `Bonjour ${n},`,
    body: 'Confirmez votre adresse e-mail pour terminer la création de votre compte.',
    button: "Vérifier l'e-mail",
    orCopy: 'Ou copiez ce lien dans votre navigateur :',
    ignore: "Si vous n'avez pas créé de compte, vous pouvez ignorer cet e-mail.",
  },
}

const reset: Record<Locale, Copy> = {
  en: {
    subject: 'Reset your VizCad password',
    heading: 'Reset your password',
    hello: (n) => `Hi ${n},`,
    body: 'We received a request to reset your password. The link works once and expires soon.',
    button: 'Reset password',
    orCopy: 'Or copy this link into your browser:',
    ignore: "If you didn't ask for this, you can ignore this email; your password stays the same.",
  },
  tr: {
    subject: 'VizCad parolanızı sıfırlayın',
    heading: 'Parolanızı sıfırlayın',
    hello: (n) => `Merhaba ${n},`,
    body: 'Parolanızı sıfırlama isteği aldık. Bağlantı bir kez çalışır ve kısa sürede geçerliliğini yitirir.',
    button: 'Parolayı sıfırla',
    orCopy: 'Ya da bu bağlantıyı tarayıcınıza yapıştırın:',
    ignore: 'Bu isteği siz yapmadıysanız bu e-postayı yok sayın; parolanız değişmez.',
  },
  de: {
    subject: 'Setzen Sie Ihr VizCad-Passwort zurück',
    heading: 'Passwort zurücksetzen',
    hello: (n) => `Hallo ${n},`,
    body: 'Wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten. Der Link funktioniert einmal und läuft bald ab.',
    button: 'Passwort zurücksetzen',
    orCopy: 'Oder kopieren Sie diesen Link in Ihren Browser:',
    ignore: 'Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail; Ihr Passwort bleibt unverändert.',
  },
  es: {
    subject: 'Restablece tu contraseña de VizCad',
    heading: 'Restablece tu contraseña',
    hello: (n) => `Hola ${n},`,
    body: 'Recibimos una solicitud para restablecer tu contraseña. El enlace funciona una vez y caduca pronto.',
    button: 'Restablecer contraseña',
    orCopy: 'O copia este enlace en tu navegador:',
    ignore: 'Si no lo solicitaste, ignora este correo; tu contraseña no cambia.',
  },
  fr: {
    subject: 'Réinitialisez votre mot de passe VizCad',
    heading: 'Réinitialisez votre mot de passe',
    hello: (n) => `Bonjour ${n},`,
    body: 'Nous avons reçu une demande de réinitialisation de votre mot de passe. Le lien ne fonctionne qu’une fois et expire bientôt.',
    button: 'Réinitialiser le mot de passe',
    orCopy: 'Ou copiez ce lien dans votre navigateur :',
    ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail; votre mot de passe reste inchangé.",
  },
}

export interface RenderedEmail {
  readonly subject: string
  readonly text: string
  readonly html: string
}

const render = (copy: Copy, name: string, url: string): RenderedEmail => {
  const safeUrl = escapeHtml(url)
  return {
    subject: copy.subject,
    text: `${copy.hello(name)}\n\n${copy.body}\n\n${url}\n\n${copy.ignore}\n`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">` +
      `<h1 style="font-size:20px">${escapeHtml(copy.heading)}</h1>` +
      `<p>${escapeHtml(copy.hello(name))}</p>` +
      `<p>${escapeHtml(copy.body)}</p>` +
      `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#0e7490;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(copy.button)}</a></p>` +
      `<p style="font-size:14px;color:#475569">${escapeHtml(copy.orCopy)}<br>${safeUrl}</p>` +
      `<p style="font-size:13px;color:#475569">${escapeHtml(copy.ignore)}</p></div>`,
  }
}

export const verificationEmail = (input: { name: string; url: string; locale: Locale }) =>
  render(verification[input.locale], input.name, input.url)

export const passwordResetEmail = (input: { name: string; url: string; locale: Locale }) =>
  render(reset[input.locale], input.name, input.url)
