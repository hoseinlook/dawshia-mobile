const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle TensorFlow Lite pose models as assets.
config.resolver.assetExts.push('tflite');

module.exports = config;
