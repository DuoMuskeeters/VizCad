import type { ReactNode } from 'react'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { Badge } from '#/components/ui/Badge'
import { Button } from '#/components/ui/Button'
import { Field } from '#/components/ui/Field'
import { PageHeader } from '#/components/ui/PageHeader'
import { Select } from '#/components/ui/Select'
import { LOCALES, LOCALE_NAMES, useI18n } from '#/i18n'
import { postAuth } from '#/auth/api'
import { roleKey } from '../roles'
import { useUser } from '../session'
import { useWorkspace } from '../workspace'

const Section = ({ id, title, lead, children }: { id: string; title: string; lead: string; children?: ReactNode }) => (
  <section aria-labelledby={id} className="grid gap-4 rounded-lg border border-line bg-bg p-4 app:p-5">
    <div>
      <h2 id={id} className="text-lg font-heading tracking-heading">
        {title}
      </h2>
      <p className="text-sm text-text-3">{lead}</p>
    </div>
    {children}
  </section>
)

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="grid gap-0.5 app:grid-cols-[180px_minmax(0,1fr)] app:items-baseline app:gap-4">
    <dt className="text-base text-text-3">{label}</dt>
    <dd className="min-w-0 text-md [overflow-wrap:anywhere]">
      {children}
      {hint ? <p className="mt-0.5 text-sm text-text-3">{hint}</p> : null}
    </dd>
  </div>
)

/** Profile, language, this workspace (read only: there is no rename operation yet) and sign-out. Plan and billing are an information text, nothing to press. */
export const SettingsPage = () => {
  const { t, locale, setLocale } = useI18n()
  const user = useUser()
  const { active } = useWorkspace()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const workspaceName = active.kind === 'personal' ? user.name : active.name

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.lead')} />
      <div className="grid max-w-160 gap-5">
        <Section id="settings-profile" title={t('settings.profile.title')} lead={t('settings.profile.lead')}>
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size="lg" decorative />
            <dl className="grid min-w-0 flex-1 gap-3">
              <Row label={t('settings.profile.name')}>{user.name}</Row>
              <Row label={t('settings.profile.email')} hint={t('settings.profile.emailHint')}>
                {user.email}
              </Row>
            </dl>
          </div>
        </Section>

        <Section id="settings-prefs" title={t('settings.prefs.title')} lead={t('settings.prefs.lead')}>
          <Field label={t('settings.prefs.language')} hint={t('settings.prefs.languageHint')}>
            <Select
              value={locale}
              onValueChange={(value) => setLocale(value as (typeof LOCALES)[number])}
              options={LOCALES.map((id) => ({ value: id, label: LOCALE_NAMES[id] }))}
            />
          </Field>
        </Section>

        <Section id="settings-workspace" title={t('settings.workspace.title')} lead={t('settings.workspace.lead')}>
          <dl className="grid gap-3">
            <Row label={t('settings.workspace.name')} hint={t('settings.workspace.nameHint')}>
              {workspaceName}
            </Row>
            <Row label={t('settings.workspace.kind')}>{active.kind === 'personal' ? t('settings.workspace.personal') : t('settings.workspace.company')}</Row>
            <Row label={t('settings.workspace.role')}>
              <Badge tone={active.role === 'guest' ? 'guest' : 'neutral'}>{t(roleKey(active.role))}</Badge>
            </Row>
          </dl>
        </Section>

        <Section id="settings-plan" title={t('settings.plan.title')} lead={t('settings.plan.lead')} />

        <Section id="settings-session" title={t('settings.session.title')} lead={t('settings.session.lead')}>
          <div>
            <Button
              loading={signingOut}
              onClick={() => {
                setSigningOut(true)
                void postAuth('/sign-out', {}).then(() => void navigate({ to: '/sign-in', search: { next: undefined } }))
              }}
            >
              <LogOut aria-hidden className="size-4.5" />
              {t('settings.session.button')}
            </Button>
          </div>
        </Section>
      </div>
    </>
  )
}
