# Typography

## Default: the system font in text styles

The starter already uses the iOS system font. Keep it unless a direction says otherwise, and size
text by role, not by pixel. `Text font="..."` takes the system text styles:

| Style | Default size | Use |
| --- | --- | --- |
| `largeTitle` | 34 | The root screen's title (the framework draws it) |
| `title` | 28 | A standout heading inside content |
| `title2` | 22 | Section-level heading in free-form content |
| `title3` | 20 | Smaller heading, card title |
| `headline` | 17 semibold | Emphasised row title, short labels |
| `body` | 17 | Almost everything |
| `callout` | 16 | Secondary explanatory text |
| `subheadline` | 15 | Row subtitles, metadata |
| `footnote` | 13 | Section footers, fine print |
| `caption` | 12 | Labels on charts and images |
| `caption2` | 11 | The smallest legible text; use rarely |

Sizes are points at the default text size. They grow and shrink with the user's text size setting.

- Body is 17 points. Resist shrinking body text to fit more in; let rows wrap or grow.
- Make hierarchy with weight and color before size. Secondary text uses `foregroundStyle="secondary"`
  before it uses a smaller style.
- Use `fontWeight` sparingly: regular for reading, semibold for emphasis, bold for numbers that
  matter. Heavy and black are display weights.
- `fontDesign="rounded"` suits friendly, playful apps (fitness, habits, kids). `monospaced` is for
  code and tabular figures, not decoration.
- Title case for screen titles, buttons and tab names; sentence case for headers, footers and
  messages. No all-caps labels, no letter-spaced eyebrows.
- Leading-align text. Center only short, standalone content such as an empty state.

## Custom CSS text

When you write CSS for your own content, use the complete system font values so Dynamic Type works:
`font: -apple-system-body`, `-apple-system-headline`, `-apple-system-footnote` and so on, inside an
`@supports` rule with an ordinary fallback. Using the keyword as a `font-family` does not scale.
Never fix a text container to one line's height.

## A brand typeface

A brand font is a legitimate choice. Keep it readable and scalable:

- Use it where personality shows: titles, large numbers, headings, empty states. Body text and
  dense rows often read better in the system font; ask if the brand guide is silent.
- Scale custom sizes with `useScaledMetric(size, 'body')` (or the closest text style) so they
  follow the user's text size.
- Keep inputs at 16 points or more.
- Self-host the font files and check their licence allows web embedding.
