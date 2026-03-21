const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..");

const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, "node_modules"),
      path.resolve(monorepoRoot, "node_modules"),
    ],
    extraNodeModules: {
      "@recipejar/shared": path.resolve(monorepoRoot, "shared", "src"),
    },
    resolveRequest(context, moduleName, platform) {
      if (
        moduleName === "react-native-screens" ||
        moduleName.startsWith("react-native-screens/")
      ) {
        const subpath = moduleName.replace("react-native-screens", "");
        const resolved = path.resolve(
          monorepoRoot,
          "node_modules",
          "react-native-screens",
          "lib",
          "commonjs",
          subpath || "index.js",
        );
        return { type: "sourceFile", filePath: resolved };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
