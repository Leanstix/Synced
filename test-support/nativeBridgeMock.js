const listeners = new Map();
const bridge = Object.fromEntries(
  [
    "getState",
    "ackFrame",
    "startHosting",
    "connect",
    "approvePeer",
    "disconnect",
    "startCapture",
    "openAccessibilitySettings",
    "setControlAllowed",
    "sendGesture",
    "sendText",
    "sendAction",
  ].map((name) => [name, jest.fn()])
