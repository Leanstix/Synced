// The pinned accessibility package ships TypeScript source but omits its lib output.
// Compile only that vendor's JS/declarations; never modify or emit native source.
import ts from 'typescript';
import { configureBluetoothBuildMetadata } from './bluetooth-build-metadata.mts';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('react-native-accessibility-controller/package.json'));
const source = join(root, 'src');
if (!existsSync(source)) throw new Error('Pinned accessibility source is missing.');
const files = ts.sys.readDirectory(source, ['.ts', '.tsx']);
const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  declaration: true,
  emitDeclarationOnly: true,
  outDir: join(root, 'lib/typescript'),
  rootDir: source,
  strict: true,
  // Vendor callbacks predate RN 0.88's narrower event overloads.
  strictFunctionTypes: false,
  skipLibCheck: true,
  esModuleInterop: true,
  jsx: ts.JsxEmit.ReactJSX,
  types: ['react', 'react-native'],
};
const program = ts.createProgram(files, options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: path => path,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => '\n',
  }));
}
program.emit();
for (const file of files.filter(file => !file.endsWith('.d.ts'))) {
  const destination = join(root, 'lib/commonjs', relative(source, file).replace(/\.tsx?$/, '.js'));
  mkdirSync(dirname(destination), { recursive: true });
  const output = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: file,
  });
  writeFileSync(destination, output.outputText);
}
const bluetoothRoot = dirname(require.resolve('react-native-bluetooth-classic/package.json'));
const bluetoothVersion = JSON.parse(readFileSync(join(bluetoothRoot, 'package.json'), 'utf8')).version as string;
const metadataPath = join(bluetoothRoot, 'android/build.gradle');
const metadata = readFileSync(metadataPath, 'utf8');
const configured = configureBluetoothBuildMetadata(bluetoothVersion, metadata);
if (configured !== metadata) writeFileSync(metadataPath, configured);
console.log('Prepared vendor JS/declarations and enabled standard Bluetooth BuildConfig metadata; Java/Kotlin source unchanged.');
