import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const compile = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.test.json', '--pretty', 'false'], { cwd: root, stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
function resolveImports(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) resolveImports(path);
    else if (entry.name.endsWith('.js')) {
      const source = readFileSync(path, 'utf8').replace(/(from\s+['"]|import\s*['"])(\.{1,2}\/[^'"]+)(['"])/g, (_, prefix, specifier, quote) => `${prefix}${/\.(?:js|json)$/.test(specifier) ? specifier : `${specifier}.js`}${quote}`);
      writeFileSync(path, source);
    }
  }
}
resolveImports(`${root}/.test-build`);
const run = spawnSync(process.execPath, ['--test', ...readdirSync(`${root}/tests`).filter(name => name.endsWith('.test.mjs')).sort().map(name => `tests/${name}`)], { cwd: root, stdio: 'inherit' });
process.exit(run.status ?? 1);
