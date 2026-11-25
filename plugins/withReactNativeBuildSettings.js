const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withReactNativeBuildSettings(config) {
  return withXcodeProject(config, (config) => {
    const objects = config.modResults.hash.project.objects;
    const appTargets = Object.values(objects.PBXNativeTarget).filter(
      (target) => target.productType === '"com.apple.product-type.application"',
    );

    if (appTargets.length === 0) {
      throw new Error('Cannot configure React Native build scripts: iOS app target is missing.');
    }

    for (const target of appTargets) {
      const configurations = objects.XCConfigurationList[target.buildConfigurationList];
      for (const { value } of configurations.buildConfigurations) {
        // React Native and CocoaPods scripts create intermediate files outside their
        // declared outputs. Apply React Native's required setting to app targets only.
        objects.XCBuildConfiguration[value].buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }

    return config;
  });
};
