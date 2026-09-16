import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

test('ordinary negative actions use soft, not solid', () => {
  for (const file of ['app/page.tsx', 'components/cleanings-view.tsx', 'components/telegram-group-settings.tsx', 'app/ui-lab/asset/page.tsx']) {
    const source = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(n) {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText(ast) === 'Button') {
        assert.ok(!/variant="destructive"/.test(n.getText(ast)), file);
      }
      if (ts.isCallExpression(n) && n.expression.getText(ast) === 'confirm' && n.arguments[0]?.getText(ast).includes('Удалить')) {
        assert.match(n.arguments[1]?.getText(ast) ?? '', /destructive: true/, file);
      }
      ts.forEachChild(n, visit);
    }
    visit(ast);
  }
});

test('soft and solid have distinct tokens; confirmation opts into solid', () => {
  const button = readFileSync('components/ui/button.tsx', 'utf8');
  assert.match(button, /bg-danger-soft text-danger-soft-foreground hover:bg-danger-soft-hover/);
  assert.match(button, /bg-danger text-danger-foreground hover:bg-danger-hover/);
  assert.ok(!button.includes('destructive-outline'));
  const dialog = readFileSync('components/system-dialog.tsx', 'utf8');
  assert.match(dialog, /request.destructive \? "destructive" : "default"/);
  assert.match(dialog, /destructive: options.destructive \?\? false/);
});
