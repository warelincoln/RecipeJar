const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..");

/** One physical copy of react-native-svg — duplicates register RNSVG* native views twice and break the bundle. */
function resolveReactNativeSvg() {
  const candidates = [
    path.join(projectRoot, "node_modules", "react-native-svg"),
    path.join(monorepoRoot, "node_modules", "react-native-svg"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
  }
  return candidates[0];
}

const reactNativeSvgRoot = resolveReactNativeSvg();

const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, "node_modules"),
      path.resolve(monorepoRoot, "node_modules"),
    ],
    extraNodeModules: {
      "@orzo/shared": path.resolve(monorepoRoot, "shared", "src"),
      "react-native-svg": reactNativeSvgRoot,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
