import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import postcss from 'postcss';

const css = postcss.parse(readFileSync('app/globals.css', 'utf8'));
const declarations = selector => Object.fromEntries(css.nodes.find(node => node.selector === selector).nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));

test('all 71 documented Mint colors match both CSS themes', () => {
  const catalog = readFileSync('app/ui-lab/page.tsx', 'utf8');
  const tokens = [...catalog.matchAll(/\{ name: "([^"]+)", light: "([^"]+)", dark: "([^"]+)" \}/g)];
  assert.equal(tokens.length, 71);
  const light = declarations(':root');
  const dark = { ...light, ...declarations('.dark') };
  for (const [, name, expectedLight, expectedDark] of tokens) {
    assert.equal(light[`--${name}`], expectedLight, `${name} Light`);
    assert.equal(dark[`--${name}`], expectedDark, `${name} Dark`);
  }
});

test('Mint migration preserves the recovered product header', () => {
  const sources = {
    'components/product-header.tsx': 'c40cdaf20779111577a8236d877e4da454e1ffd3',
  };
  for (const [file, hash] of Object.entries(sources)) {
    assert.equal(createHash('sha1').update(readFileSync(file)).digest('hex'), hash, file);
  }
});

test('Muted is foreground-only and tabs target Radix active state', () => {
  css.walkDecls(decl => {
    if (!decl.prop.startsWith('--')) assert.ok(!decl.value.includes('var(--muted)'), decl.toString());
  });
  assert.equal(declarations(':root')['--muted-foreground'], 'var(--muted)');
  const tabs = readFileSync('components/ui/tabs.tsx', 'utf8');
  assert.ok(tabs.includes('data-[state=active]:bg-segment'));
  assert.ok(!tabs.includes('bg-muted'));
});
