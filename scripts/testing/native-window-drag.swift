import CoreGraphics
import Foundation

// Run with:
// swift scripts/testing/native-window-drag.swift <start-x> <start-y> <end-y> <drag-seconds> <hold-seconds>
let arguments = CommandLine.arguments
guard arguments.count == 6,
  let startX = Double(arguments[1]),
  let startY = Double(arguments[2]),
  let endY = Double(arguments[3]),
  let dragSeconds = Double(arguments[4]),
  let holdSeconds = Double(arguments[5])
else {
  fatalError("Usage: native-window-drag.swift startX startY endY dragSeconds holdSeconds")
}

let start = CGPoint(x: startX, y: startY)
let steps = 30

CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: start, mouseButton: .left)?.post(tap: .cghidEventTap)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: start, mouseButton: .left)?.post(tap: .cghidEventTap)

for step in 1...steps {
  let progress = Double(step) / Double(steps)
  let point = CGPoint(x: startX, y: startY + ((endY - startY) * progress))
  CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
  Thread.sleep(forTimeInterval: dragSeconds / Double(steps))
}

Thread.sleep(forTimeInterval: holdSeconds)
let end = CGPoint(x: startX, y: endY)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: end, mouseButton: .left)?.post(tap: .cghidEventTap)
