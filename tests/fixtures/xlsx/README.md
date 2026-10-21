# `.xlsx` fixture corpus

Two fixture sets feed the reader/writer tests (Task 1.3, master plan §6).

- `synthetic/` — 20 generated edge cases, committed. Regenerate with `pnpm fixtures`.
- `real-world/` — 7 forms from the [pyxform](https://github.com/XLSForm/pyxform)
  test suite, BSD-2-Clause. See `real-world/README.md` for provenance.
- `../../generated/` — the 2,000-row reference form; generated on demand, not
  committed (`tests/fixtures/reference.ts`).

## Synthetic cases

| File | What it exercises |
| --- | --- |
| `01-basic.xlsx` | Minimal well-formed form: 3 sheets, 3 questions, 2 choices. |
| `02-custom-columns.xlsx` | `media::image`, `bind::esri:*`, `bind::odk:length`, `read_only`, `trigger`, `image` alias on choices. |
| `03-aliases.xlsx` | pyxform aliases: `list name`, `constraint message`, `select one`, `select all that apply`. |
| `04-localized.xlsx` | `label::English (en)` / `label::Indonesian (id)` / `hint::…` / `constraint_message::…`. |
| `05-mixed-case.xlsx` | Mixed-case and whitespace-padded headers on all three sheets. |
| `06-numeric-cells.xlsx` | Numeric `version` 2024010101 with format `0`, plus a zero-padded `0007`. |
| `07-booleans.xlsx` | TRUE/FALSE cells for `required` and `read_only`. |
| `08-dates.xlsx` | Date cells with `yyyy-mm-dd` and day-first `dd/mm/yyyy` formats. |
| `09-rich-text.xlsx` | Rich-text labels with bold/italic/colour runs. |
| `10-formulas.xlsx` | Formula cells on the managed sheet and on a passthrough sheet (cached results). |
| `11-blank-rows.xlsx` | Interior blank rows and trailing blank rows that must be trimmed. |
| `12-external-choices.xlsx` | `external_choices` passthrough sheet and `select_one_from_file`. |
| `13-styled.xlsx` | Header fill/font, column widths, frozen panes (`xSplit: 2`), row fill, passthrough styling. |
| `14-or-other.xlsx` | `select_one … or_other`, `select_multiple … or_other`, `choice_filter`. |
| `15-unbalanced-groups.xlsx` | Unclosed group, mismatched `end_group`/`end_repeat`, orphan `end_repeat`. |
| `16-duplicate-headers.xlsx` | Two `label` columns in one sheet (second must be renamed, with a warning). |
| `17-missing-sheets.xlsx` | `survey` only; `choices`/`settings` defaulted with warnings. |
| `18-settings-custom.xlsx` | Empty `survey`/`choices`, settings row with custom keys. |
| `19-empty-form.xlsx` | Headers only, no data rows. |
| `20-unicode.xlsx` | Arabic labels, emoji, 500-character text, non-ASCII choice values. |
