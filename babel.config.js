module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // No SDK 54 / Reanimated 4, o plugin do Reanimated já gerencia os worklets.
      "react-native-reanimated/plugin",
    ],
  };
};
