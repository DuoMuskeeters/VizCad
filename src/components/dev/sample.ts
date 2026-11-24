// Static sample data for /dev/ui. Nothing here is loaded from anywhere.
import type { WorkspaceOption } from '#/components/ui/WorkspaceSwitcher'

export type SampleFile = {
  id: string
  name: string
  ext: string
  owner: string
  modified: string
  size: string
  access: { kind: 'team' | 'link' | 'people' | 'expired'; text: string }
  starred?: boolean
}

export const files: readonly SampleFile[] = [
  { id: 'f1', name: 'Flanş_DN100_rev3.step', ext: 'STEP', owner: 'Ayşe Yılmaz', modified: 'Bugün 14:20', size: '12,4 MB', access: { kind: 'link', text: 'Link · 7 gün kaldı' }, starred: true },
  { id: 'f2', name: 'Pompa_gövdesi_montaj.step', ext: 'STEP', owner: 'Mehmet Kaya', modified: 'Bugün 09:05', size: '86,2 MB', access: { kind: 'people', text: '2 kişi' } },
  { id: 'f3', name: 'Konveyör_şase.iges', ext: 'IGES', owner: 'Ayşe Yılmaz', modified: 'Dün', size: '41,0 MB', access: { kind: 'team', text: 'Yalnızca ekip' } },
  { id: 'f4', name: 'Rulman_yuvası_6205.stl', ext: 'STL', owner: 'Zeynep Arslan', modified: '19 Kas', size: '3,8 MB', access: { kind: 'team', text: 'Yalnızca ekip' } },
  { id: 'f5', name: 'Mil_Ø25x300.step', ext: 'STEP', owner: 'Mehmet Kaya', modified: '18 Kas', size: '1,2 MB', access: { kind: 'expired', text: 'Linkin süresi doldu' } },
  { id: 'f6', name: 'Kapak_plakası_t5.obj', ext: 'OBJ', owner: 'Ayşe Yılmaz', modified: '14 Kas', size: '640 KB', access: { kind: 'team', text: 'Yalnızca ekip' } },
  { id: 'f7', name: 'Braket_sol_v2.3mf', ext: '3MF', owner: 'Zeynep Arslan', modified: '10 Kas', size: '2,1 MB', access: { kind: 'people', text: '1 kişi' } },
  { id: 'f8', name: 'Dişli_z32_m2.stl', ext: 'STL', owner: 'Can Demir', modified: '2 Kas', size: '5,6 MB', access: { kind: 'team', text: 'Yalnızca ekip' } },
]

export const people = [
  { name: 'Ayşe Yılmaz' },
  { name: 'Mehmet Kaya' },
  { name: 'Zeynep Arslan' },
  { name: 'Can Demir' },
  { name: 'Selin Er' },
  { name: 'Ömer Koç' },
] as const

export const workspaces: readonly WorkspaceOption[] = [
  { id: 'dm', name: 'Demir Makina', subtitle: 'Yönetici · 12 üye' },
  { id: 'ay', name: 'Ayşe Yılmaz', subtitle: 'Kişisel', tone: 'accent' },
  { id: 'kh', name: 'Kaya Hidrolik', subtitle: '1 proje', tone: 'warn', guest: true },
]
