import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Building2, UserPlus, X } from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { useI18n } from '#/i18n'
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog'
import { FilesPage } from './files/FilesPage'
import { dismissTeamSuggestion, teamSuggestionDismissed } from './nav'
import { useWorkspace } from './workspace'

/** D20: in a personal workspace, once, a dismissible hint to build a team. Shown to returning users as well. */
const TeamSuggestion = ({ onCreate }: { onCreate: () => void }) => {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  useEffect(() => setVisible(!teamSuggestionDismissed()), [])
  if (!visible) return null
  return (
    <section aria-labelledby="team-suggestion" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-line bg-surface px-4 py-3.5">
      <div className="min-w-0 flex-1 basis-64">
        <h2 id="team-suggestion" className="text-lg font-semibold">
          {t('app.home.suggestion.title')}
        </h2>
        <p className="text-base text-text-2">{t('app.home.suggestion.lead')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onCreate}>
          <Building2 aria-hidden className="size-4.5" />
          {t('app.home.suggestion.create')}
        </Button>
        <Button asChild>
          <Link to="/app/team">
            <UserPlus aria-hidden className="size-4.5" />
            {t('app.home.suggestion.team')}
          </Link>
        </Button>
        <IconButton
          label={t('app.home.suggestion.dismiss')}
          onClick={() => {
            dismissTeamSuggestion()
            setVisible(false)
          }}
        >
          <X aria-hidden className="size-4.5" />
        </IconButton>
      </div>
    </section>
  )
}

export const HomePage = () => {
  const { active } = useWorkspace()
  const [creating, setCreating] = useState(false)
  return (
    <>
      {active.kind === 'personal' && active.role === 'owner' ? <TeamSuggestion onCreate={() => setCreating(true)} /> : null}
      <FilesPage />
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
