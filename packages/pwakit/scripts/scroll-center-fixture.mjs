// Static markup comes from the built ScrollView and content components.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScrollView } from '../dist/public/scroll.js'
import { VStack, HStack, Text } from '../dist/content/content.js'
import { Button } from '../dist/public/controls.js'

const out = resolve(process.argv[2])
const definitions = [
  ['vertical short', {}],
  ['vertical long', { long: true }],
  ['leading fill', { alignment: 'leading', fill: true }],
  ['trailing fill', { alignment: 'trailing', fill: true }],
  ['positioned short', { positioned: true }],
  ['full-width rows', { rows: true }],
  ['horizontal short', { horizontal: true }],
  ['horizontal long', { horizontal: true, long: true }],
  ['direct Text', { leaf: 'text' }],
  ['framed Text', { leaf: 'frame' }],
  ['direct Button', { leaf: 'button' }],
  ['refresh Text', { leaf: 'text', refresh: true }],
]
const markup = renderToStaticMarkup(
  h(
    'main',
    null,
    definitions.map(([name, options], index) => {
      const horizontal = options.horizontal
      const blocks = Array.from({ length: options.long ? 10 : 2 }, (_, block) =>
        h('div', {
          key: block,
          'data-block': '',
          style: {
            width: options.rows ? '100%' : block % 2 ? 60 : 120,
            height: 24,
            flexShrink: 0,
            background: block % 2 ? '#ff9500' : '#007aff',
          },
        }),
      )
      const stack = h(
        horizontal ? HStack : VStack,
        {
          spacing: 8,
          alignment: options.alignment ?? 'center',
          frame: options.fill ? { maxWidth: 'infinity', alignment: options.alignment } : undefined,
          style: options.rows ? { width: '100%' } : undefined,
        },
        blocks,
      )
      const leafStyle = { width: 120, height: 24, background: '#007aff' }
      const content = !options.leaf
        ? stack
        : options.leaf === 'button'
          ? h(Button, { style: leafStyle, onPress() {} }, 'Button')
          : options.leaf === 'frame'
            ? h(Text, { frame: { width: 120, height: 24 }, background: '#007aff' }, 'Frame')
            : h(Text, { style: leafStyle }, 'Text')
      return h(
        'section',
        {
          key: name,
          'data-case': name,
          style: {
            position: 'absolute',
            left: index % 2 ? 230 : 20,
            top: 65 + Math.floor(index / 2) * 140,
          },
        },
        h('h2', null, name),
        h(
          ScrollView,
          {
            id: `case-${index}`,
            axis: horizontal ? 'horizontal' : 'vertical',
            maintainVisibleContentPosition: options.positioned || undefined,
            refreshable: options.refresh ? async () => {} : undefined,
            style: { width: 190, height: 110, background: '#f2f2f7' },
          },
          content,
        ),
      )
    }),
  ),
)
const css = await readFile(new URL('../dist/styles.css', import.meta.url), 'utf8')
await mkdir(out, { recursive: true })
await writeFile(
  resolve(out, 'index.html'),
  `<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scroll centering</title><style>${css}
body{margin:0;background:white;color:black;font:14px -apple-system}
h2{margin:0;height:24px;font:14px -apple-system}#result{position:absolute;top:910px;left:20px}
</style><div data-satin-root data-satin-launch="ready">${markup}<p id="result"></p></div>
<script>
performance.mark('satin-launch-ready');performance.mark('satin-glass-ready');
window.checkScrollCenter=()=>{
  const cases=[...document.querySelectorAll('[data-case]')].map(section=>{
    const surface=section.querySelector('[data-satin-scroll]');
    const bounds=surface.getBoundingClientRect();
    const elements=section.dataset.case.includes('Text')||section.dataset.case.includes('Button')
      ? [(surface.querySelector('[data-satin-scroll-content]')??surface).firstElementChild]
      : [...surface.querySelectorAll('[data-block]')];
    const blocks=elements.map(block=>{
      const rect=block.getBoundingClientRect();
      return {x:rect.x-bounds.x,y:rect.y-bounds.y,width:rect.width,height:rect.height};
    });
    const name=section.dataset.case;
    const expected=name==='leading fill'||name==='full-width rows'?0:name==='trailing fill'?70:name.startsWith('horizontal')?0:35;
    const ok=Math.abs(blocks[0].x-expected)<0.1&&
      (name!=='trailing fill'||Math.abs(blocks[1].x-130)<0.1)&&
      (name!=='full-width rows'||blocks.every(block=>block.width===190));
    return {name,ok,blocks,scrollWidth:surface.scrollWidth,scrollHeight:surface.scrollHeight};
  });
  const result={ok:cases.every(item=>item.ok),cases};
  document.querySelector('#result').textContent='Layout '+(result.ok?'PASS':'FAIL')+' '+cases.filter(item=>item.ok).length+'/'+cases.length;
  window.scrollCenterResult=result;return result;
};
requestAnimationFrame(()=>requestAnimationFrame(window.checkScrollCenter));
</script>`,
)
console.log(out)
