# Real-world fixtures

Source: [XLSForm/pyxform](https://github.com/XLSForm/pyxform), `master` branch,
downloaded 2026-10-21.

License: BSD 2-Clause. pyxform's `LICENSE` is reproduced at the repository root
of this project under `third-party/pyxform-LICENSE`.

| File | Source path | What it exercises |
| --- | --- | --- |
| `group.xlsx` | `tests/fixtures/example_forms/group.xlsx` | Nested `begin_group` blocks and their labels. |
| `choice_filter_test.xlsx` | `tests/fixtures/example_forms/choice_filter_test.xlsx` | `choice_filter`, cascading selects, translated choice labels. |
| `widgets.xlsx` | `tests/fixtures/example_forms/widgets.xlsx` | Many `appearance` values, media columns, select variants. |
| `xlsform_spec_test.xlsx` | `tests/fixtures/example_forms/xlsform_spec_test.xlsx` | Large spec-coverage form with unusual columns and settings. |
| `or_other.xlsx` | `tests/fixtures/example_forms/or_other.xlsx` | `or_other` selects. |
| `loop.xlsx` | `tests/fixtures/example_forms/loop.xlsx` | Repeats and `repeat_count`. |
| `UCL_Biomass_Plot_Form.xlsx` | `tests/fixtures/bug_example_forms/UCL_Biomass_Plot_Form.xlsx` | Real academic form: calculations, groups, constraints. |

These files are unmodified. Tests assert value fidelity only; they do not
assert pyxform's XForm output.
