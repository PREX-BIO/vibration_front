import ExpoModulesCore

public final class ContinuousVibrationModule: Module {
  private let output = ContinuousVibrationPlayer()

  public func definition() -> ModuleDefinition {
    Name("ContinuousVibration")
    Constant("apiVersion") { 2 }
    Events("onHapticEvent")
    OnCreate { [weak self] in
      self?.output.onEvent = { [weak self] event in self?.sendEvent("onHapticEvent", event) }
    }
    Function("isSupported") { self.output.isSupported }
    Function("prepare") { try self.output.prepare() }
    Function("schedule") { (id: String, delayMs: Double, durationMs: Double, intensity: Double, sharpness: Double) in
      try self.output.schedule(id: id, delayMs: delayMs, durationMs: durationMs,
                               intensity: intensity, sharpness: sharpness)
    }
    Function("stop") { try self.output.stop() }
    OnAppEntersBackground { try? self.output.stop(reason: "background") }
    OnDestroy { try? self.output.stop(reason: "destroyed") }
  }
}
