import assert from 'node:assert/strict';
import test from 'node:test';

const { resolveCssUrl, sanitizeThemeCss } = await import('../server/theme-css.ts');

const files = new Set(['theme.css', 'assets/bg.png', 'css/theme.css']);
const clean = (css: string, path = 'theme.css') => sanitizeThemeCss(css, 'cozy', path, files);

test('every selector is scoped to the office using the theme', () => {
  const out = clean(':root { --accent: #f0a; } body .panel { color: red } .a, .b > .c { margin: 0 }');
  assert.match(out, /\[data-theme-pack="cozy"\]\{--accent: ?#f0a\}/);
  assert.match(out, /\[data-theme-pack="cozy"\] \.panel\{/);
  assert.match(out, /\[data-theme-pack="cozy"\] \.a,\[data-theme-pack="cozy"\] \.b>\.c\{/);
});

test('media queries stay and keyframe steps are not scoped', () => {
  const out = clean('@media (max-width: 600px) { .x { color: red } } @keyframes bob { from { top: 0 } to { top: 4px } }');
  assert.match(out, /@media \(max-width:600px\)\{\[data-theme-pack="cozy"\] \.x/);
  assert.match(out, /@keyframes bob\{from\{top:0\}to\{top:4px\}\}/);
});

test('nothing loads from outside the package', () => {
  const out = clean(`@import url(https://evil.example/a.css);
    .a { background: url(https://evil.example/t.png) }
    .b { background: url("assets/bg.png") }
    .c { background: url(../outside.png) }
    .d { background: url(data:image/png;base64,AAAA) }
    .e { background-image: image-set("https://evil.example/x.png" 1x) }`);
  assert.doesNotMatch(out, /evil|import|outside|data:|image-set/);
  assert.match(out, /\.b\{background:url\(assets\/bg\.png\)\}/);
});

test('urls resolve from the folder of the CSS file', () => {
  assert.equal(resolveCssUrl('css/theme.css', '../assets/bg.png'), 'assets/bg.png');
  assert.equal(resolveCssUrl('theme.css', '../assets/bg.png'), null);
  assert.equal(resolveCssUrl('theme.css', '/assets/bg.png'), null);
  assert.equal(resolveCssUrl('theme.css', '//evil.example/a.png'), null);
  assert.match(clean('.a { background: url(../assets/bg.png) }', 'css/theme.css'), /url\(\.\.\/assets\/bg\.png\)/);
});

test('scripts, overlays and protected screens are stripped', () => {
  const out = clean(`.a { width: expression(alert(1)); behavior: url(x.htc); -moz-binding: url(x.xml); color: blue }
    .cover { position: fixed; inset: 0; z-index: 99999 }
    .approval-title, .share-modal button, .modal-backdrop { display: none }
    .ok, .billing-box { opacity: 0 }`);
  assert.doesNotMatch(out, /expression|behavior|binding|fixed|99999|approval|share|modal|billing/);
  assert.match(out, /\.a\{color:blue\}/);
  assert.match(out, /z-index:100/);
  assert.match(out, /\[data-theme-pack="cozy"\] \.ok\{opacity:0\}/);
});

test('selectors cannot reach elements beside the scoped office', () => {
  for (const css of ['body ~ div { display: none }', ':root + * { display: none }', '[data-theme-pack="cozy"] ~ div { display: none }', '[data-theme-pack="cozy"]+div{display:none}']) {
    const out = clean(css);
    assert.match(out, /^\[data-theme-pack="cozy"\] /, `${css} -> ${out}`);
  }
  assert.match(clean('body > .app { color: red }'), /^\[data-theme-pack="cozy"\]>\.app\{/);
  assert.match(clean('[data-theme-pack="cozy"].x { color: red }'), /^\[data-theme-pack="cozy"\] \[data-theme-pack="cozy"\]\.x\{/);
});

test('cleaning twice changes nothing more', () => {
  const once = clean('body .a { color: red } .b { background: url(assets/bg.png) }');
  assert.equal(clean(once), once);
});

test('oversized CSS is refused', () => {
  assert.throws(() => clean(`.a{color:red}`.repeat(10_000)), /KB까지/);
});
