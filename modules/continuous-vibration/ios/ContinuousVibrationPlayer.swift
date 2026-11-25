import CoreHaptics
import Foundation

/// One finite event scheduled on the engine clock; JS never extends or repeats it.
final class ContinuousVibrationPlayer {
  private let queue = DispatchQueue(label: "vibration.continuous-haptics")
  private var engine: CHHapticEngine?
  private var player: CHHapticAdvancedPatternPlayer?
  private var playbackID: String?
  var onEvent: (([String: Any]) -> Void)?

  var isSupported: Bool { CHHapticEngine.capabilitiesForHardware().supportsHaptics }
  private var nowMs: Double { ProcessInfo.processInfo.systemUptime * 1000 }

  private func emit(_ type: String, id: String, detail: String? = nil) {
    onEvent?([
      "type": type, "playback_id": id, "native_event_ms": nowMs,
      "detail": detail as Any? ?? NSNull()
    ])
  }

  func prepare() throws {
    try queue.sync {
      guard isSupported else { throw HapticsError.unsupported }
      guard playbackID == nil else { throw HapticsError.alreadyPlaying }
      if engine != nil { return }
      let created = try CHHapticEngine()
      created.playsHapticsOnly = true
      created.isAutoShutdownEnabled = false
      created.stoppedHandler = { [weak self, weak created] reason in
        guard let self else { return }
        self.queue.async {
          guard let created, self.engine === created else { return }
          if let id = self.playbackID {
            self.emit("engine_stopped", id: id, detail: "reason=\(reason.rawValue)")
          }
          self.player = nil
          self.playbackID = nil
          self.engine = nil
        }
      }
      created.resetHandler = { [weak self, weak created] in
        guard let self else { return }
        self.queue.async {
          guard let created, self.engine === created else { return }
          if let id = self.playbackID { self.emit("engine_reset", id: id) }
          self.player = nil
          self.playbackID = nil
          self.engine = nil
        }
      }
      try created.start()
      engine = created
    }
  }

  func schedule(id: String, delayMs: Double, durationMs: Double,
                intensity: Double, sharpness: Double) throws -> [String: Any] {
    let requested = nowMs
    guard delayMs.isFinite, delayMs >= 0,
          durationMs.isFinite, durationMs > 0, durationMs <= 25_000,
          intensity.isFinite, (0...1).contains(intensity),
          sharpness.isFinite, (0...1).contains(sharpness) else {
      throw HapticsError.invalidParameters
    }
    return try queue.sync {
      guard let engine else { throw HapticsError.notPrepared }
      guard playbackID == nil else { throw HapticsError.alreadyPlaying }
      let event = CHHapticEvent(
        eventType: .hapticContinuous,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: Float(intensity)),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: Float(sharpness))
        ],
        relativeTime: 0, duration: durationMs / 1000
      )
      let pattern = try CHHapticPattern(events: [event], parameters: [])
      let next = try engine.makeAdvancedPlayer(with: pattern)
      next.completionHandler = { [weak self] error in
        guard let self else { return }
        self.queue.async {
          guard self.playbackID == id else { return }
          self.emit(error == nil ? "completed" : "playback_error", id: id,
                    detail: error?.localizedDescription)
          self.player = nil
        }
      }
      let clock = nowMs
      let start = max(requested + delayMs, clock + 2)
      let engineStart = engine.currentTime + (start - clock) / 1000
      playbackID = id
      player = next
      do { try next.start(atTime: engineStart) }
      catch {
        emit("playback_error", id: id, detail: error.localizedDescription)
        playbackID = nil
        player = nil
        throw error
      }
      return [
        "playback_id": id,
        "native_request_ms": requested,
        "native_response_ms": nowMs,
        "native_scheduled_start_ms": start,
        "native_scheduled_end_ms": start + durationMs
      ]
    }
  }

  func stop(reason: String = "requested") throws {
    try queue.sync {
      let id = playbackID
      playbackID = nil // Ignore completion callbacks from a cancelled/previous player.
      defer {
        player = nil
        let previous = engine
        engine = nil
        previous?.stop(completionHandler: nil)
        if let id { emit("stopped", id: id, detail: reason) }
      }
      try player?.stop(atTime: CHHapticTimeImmediate)
    }
  }
}

private enum HapticsError: LocalizedError {
  case unsupported, notPrepared, alreadyPlaying, invalidParameters
  var errorDescription: String? {
    switch self {
    case .unsupported: return "This device does not support continuous Core Haptics."
    case .notPrepared: return "Prepare the haptic engine before starting measurement."
    case .alreadyPlaying: return "A haptic session is already active."
    case .invalidParameters: return "Expected duration in (0, 25000] ms and intensity/sharpness in [0, 1]."
    }
  }
}
