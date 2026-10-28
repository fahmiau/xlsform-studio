/**
 * Preferences dialog (Task 5.7). Every change applies live through
 * `prefsStore.update`, which also persists it.
 */
import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildListName } from '@/core/ops/choices';
import type { SlugStyle } from '@/core/slug/slugify';
import { AiSection } from '@/features/preferences/sections/AiSection';
import { usePrefsStore } from '@/state/prefsStore';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'border-input bg-background rounded border px-2 py-1 text-xs';

export function PreferencesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const prefs = usePrefsStore();
  const update = usePrefsStore((state) => state.update);

  const patternPreview = buildListName(
    'Drinking Water',
    prefs.listNamePattern || '{name}',
    prefs.slugMaxLength,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="preferences-dialog">
        <DialogHeader>
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>
            Changes apply immediately and persist across restarts.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-auto text-xs">
          <section className="space-y-1.5">
            <h3 className="text-muted-foreground font-medium">General</h3>
            <Row label="Theme">
              <Select
                value={prefs.theme}
                onValueChange={(value) => update({ theme: value as typeof prefs.theme })}
              >
                <SelectTrigger
                  size="sm"
                  className="w-32 text-xs"
                  aria-label="Theme"
                  data-testid="pref-theme"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system" className="text-xs">
                    System
                  </SelectItem>
                  <SelectItem value="light" className="text-xs">
                    Light
                  </SelectItem>
                  <SelectItem value="dark" className="text-xs">
                    Dark
                  </SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Autosave (every 30 s)">
              <input
                type="checkbox"
                checked={prefs.autosave}
                data-testid="pref-autosave"
                onChange={(event) => update({ autosave: event.target.checked })}
              />
            </Row>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-muted-foreground font-medium">Choices</h3>
            <Row label="List name pattern">
              <input
                className={inputClass}
                value={prefs.listNamePattern}
                data-testid="pref-list-pattern"
                onChange={(event) => update({ listNamePattern: event.target.value })}
              />
            </Row>
            <p className="text-muted-foreground" data-testid="list-pattern-preview">
              Preview: <code className="font-mono">{patternPreview}</code>
            </p>
            <Row label="New list naming">
              <Select
                value={prefs.defaultSlugMode}
                onValueChange={(value) => update({ defaultSlugMode: value as SlugStyle })}
              >
                <SelectTrigger
                  size="sm"
                  className="w-32 text-xs"
                  aria-label="New list naming"
                  data-testid="pref-slug-mode"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="snake" className="text-xs">
                    snake_case
                  </SelectItem>
                  <SelectItem value="camel" className="text-xs">
                    camelCase
                  </SelectItem>
                  <SelectItem value="passthrough" className="text-xs">
                    Passthrough
                  </SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Max name length">
              <input
                type="number"
                min={1}
                max={64}
                className={`${inputClass} w-20`}
                value={prefs.slugMaxLength}
                data-testid="pref-max-length"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next))
                    update({ slugMaxLength: Math.min(64, Math.max(1, next)) });
                }}
              />
            </Row>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-muted-foreground font-medium">Editor</h3>
            <Row label="Formula font size">
              <input
                type="number"
                min={9}
                max={24}
                className={`${inputClass} w-20`}
                value={prefs.formulaFontSize}
                data-testid="pref-font-size"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next))
                    update({ formulaFontSize: Math.min(24, Math.max(9, next)) });
                }}
              />
            </Row>
            <Row label="Autocomplete on $">
              <input
                type="checkbox"
                checked={prefs.autocompleteOnDollar}
                data-testid="pref-autocomplete"
                onChange={(event) => update({ autocompleteOnDollar: event.target.checked })}
              />
            </Row>
          </section>

          <AiSection />
        </div>
      </DialogContent>
    </Dialog>
  );
}
