import { escapeHtml, type Locale, type RenderedEmail } from './auth'

/**
 * Invitation emails in the five product locales. Free text from the inviter (a message, a workspace, project or file
 * name) never goes into the mail: anyone can create a workspace, and that text would reach a stranger's inbox from our
 * domain. The only dynamic values are the inviter's verified email address and the link, both escaped for context.
 */
interface Copy {
  readonly subject: string
  readonly heading: string
  /** `{inviter}` is replaced by the escaped address. */
  readonly body: string
  readonly button: string
  readonly orCopy: string
  readonly ignore: string
}

type Kind = 'member' | 'guest'

const copy: Record<Kind, Record<Locale, Copy>> = {
  member: {
    en: {
      subject: 'You are invited to a team on VizCad',
      heading: 'Join the team on VizCad',
      body: '{inviter} invited you to join their workspace on VizCad.',
      button: 'View invitation',
      orCopy: 'Or copy this link into your browser:',
      ignore: "If you weren't expecting this, you can ignore this email.",
    },
    tr: {
      subject: "VizCad'de bir ekibe davet edildiniz",
      heading: "VizCad'de ekibe katılın",
      body: "{inviter} sizi VizCad'deki çalışma alanına davet etti.",
      button: 'Daveti görüntüle',
      orCopy: 'Ya da bu bağlantıyı tarayıcınıza yapıştırın:',
      ignore: 'Bu daveti beklemiyorsanız bu e-postayı yok sayabilirsiniz.',
    },
    de: {
      subject: 'Sie wurden zu einem Team auf VizCad eingeladen',
      heading: 'Treten Sie dem Team auf VizCad bei',
      body: '{inviter} hat Sie in einen Arbeitsbereich auf VizCad eingeladen.',
      button: 'Einladung ansehen',
      orCopy: 'Oder kopieren Sie diesen Link in Ihren Browser:',
      ignore: 'Wenn Sie das nicht erwartet haben, können Sie diese E-Mail ignorieren.',
    },
    es: {
      subject: 'Te han invitado a un equipo en VizCad',
      heading: 'Únete al equipo en VizCad',
      body: '{inviter} te invitó a su espacio de trabajo en VizCad.',
      button: 'Ver invitación',
      orCopy: 'O copia este enlace en tu navegador:',
      ignore: 'Si no esperabas esto, puedes ignorar este correo.',
    },
    fr: {
      subject: 'Vous êtes invité à rejoindre une équipe sur VizCad',
      heading: "Rejoignez l'équipe sur VizCad",
      body: '{inviter} vous a invité dans son espace de travail sur VizCad.',
      button: "Voir l'invitation",
      orCopy: 'Ou copiez ce lien dans votre navigateur :',
      ignore: "Si vous ne vous y attendiez pas, vous pouvez ignorer cet e-mail.",
    },
  },
  guest: {
    en: {
      subject: 'Something was shared with you on VizCad',
      heading: 'A design was shared with you',
      body: '{inviter} shared CAD files with you on VizCad. Your access is time limited.',
      button: 'Open invitation',
      orCopy: 'Or copy this link into your browser:',
      ignore: "If you weren't expecting this, you can ignore this email.",
    },
    tr: {
      subject: "VizCad'de sizinle bir şey paylaşıldı",
      heading: 'Sizinle bir tasarım paylaşıldı',
      body: "{inviter} VizCad'de sizinle CAD dosyaları paylaştı. Erişiminiz süreyle sınırlıdır.",
      button: 'Daveti aç',
      orCopy: 'Ya da bu bağlantıyı tarayıcınıza yapıştırın:',
      ignore: 'Bu daveti beklemiyorsanız bu e-postayı yok sayabilirsiniz.',
    },
    de: {
      subject: 'Auf VizCad wurde etwas mit Ihnen geteilt',
      heading: 'Ein Entwurf wurde mit Ihnen geteilt',
      body: '{inviter} hat auf VizCad CAD-Dateien mit Ihnen geteilt. Ihr Zugriff ist zeitlich begrenzt.',
      button: 'Einladung öffnen',
      orCopy: 'Oder kopieren Sie diesen Link in Ihren Browser:',
      ignore: 'Wenn Sie das nicht erwartet haben, können Sie diese E-Mail ignorieren.',
    },
    es: {
      subject: 'Se compartió algo contigo en VizCad',
      heading: 'Se compartió un diseño contigo',
      body: '{inviter} compartió archivos CAD contigo en VizCad. Tu acceso tiene límite de tiempo.',
      button: 'Abrir invitación',
      orCopy: 'O copia este enlace en tu navegador:',
      ignore: 'Si no esperabas esto, puedes ignorar este correo.',
    },
    fr: {
      subject: 'Un élément a été partagé avec vous sur VizCad',
      heading: 'Un projet a été partagé avec vous',
      body: '{inviter} a partagé des fichiers CAO avec vous sur VizCad. Votre accès est limité dans le temps.',
      button: "Ouvrir l'invitation",
      orCopy: 'Ou copiez ce lien dans votre navigateur :',
      ignore: "Si vous ne vous y attendiez pas, vous pouvez ignorer cet e-mail.",
    },
  },
}

export const invitationEmail = (input: { readonly kind: Kind; readonly locale: Locale; readonly inviterEmail: string; readonly url: string }): RenderedEmail => {
  const c = copy[input.kind][input.locale]
  const textBody = c.body.replace('{inviter}', input.inviterEmail)
  const htmlBody = escapeHtml(c.body).replace('{inviter}', escapeHtml(input.inviterEmail))
  const safeUrl = escapeHtml(input.url)
  return {
    subject: c.subject,
    text: `${textBody}\n\n${input.url}\n\n${c.ignore}\n`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">` +
      `<h1 style="font-size:20px">${escapeHtml(c.heading)}</h1>` +
      `<p>${htmlBody}</p>` +
      `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#0e7490;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(c.button)}</a></p>` +
      `<p style="font-size:14px;color:#475569">${escapeHtml(c.orCopy)}<br>${safeUrl}</p>` +
      `<p style="font-size:13px;color:#475569">${escapeHtml(c.ignore)}</p></div>`,
  }
}
