import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { HouseholdRole } from '@/features/auth/types'

const OPTIONS: { value: HouseholdRole; label: string; description: string }[] = [
  {
    value: 'member',
    label: 'Integrante',
    description: 'Registra y consulta pagos, comprobantes, vencimientos e informes.',
  },
  {
    value: 'admin',
    label: 'Administrador',
    description: 'Además gestiona usuarios, categorías y servicios.',
  },
]

interface RoleFieldProps {
  value: HouseholdRole
  onChange: (role: HouseholdRole) => void
}

export function RoleField({ value, onChange }: RoleFieldProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">Rol</legend>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as HouseholdRole)}>
        {OPTIONS.map((option) => (
          <Label
            key={option.value}
            className="has-data-[state=checked]:border-brand flex items-start gap-3 rounded-lg border p-3 font-normal"
          >
            <RadioGroupItem value={option.value} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{option.label}</span>
              <span className="text-muted-foreground text-xs">{option.description}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  )
}
