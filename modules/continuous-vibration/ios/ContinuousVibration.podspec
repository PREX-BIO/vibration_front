Pod::Spec.new do |s|
  s.name = 'ContinuousVibration'
  s.version = '1.0.0'
  s.summary = 'Local continuous Core Haptics output for Vibration'
  s.description = 'One finite continuous haptic event with explicit cancellation.'
  s.author = 'Vibration'
  s.license = { :type => 'MIT' }
  s.homepage = 'https://docs.expo.dev/modules/'
  s.source = { :git => '' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreHaptics'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
