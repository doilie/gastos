// Monorepo-aware Metro config so apps/mobile can resolve workspace packages
// (e.g. @gastos/shared) that live outside apps/mobile/node_modules.
// See: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// Expo Router's require.context globs every .ts(x)/.js(x) file under app/,
// including colocated *.test.tsx files, and would otherwise try to bundle
// test-only deps (e.g. @testing-library/react-native, which pulls in Node's
// `console` module) into the production/dev bundle. Block test files from
// Metro's resolution; Jest resolves them independently via its own config.
config.resolver.blockList = [/\.(test|spec)\.[jt]sx?$/];

module.exports = config;
