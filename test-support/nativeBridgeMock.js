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
);
module.exports = {
  NativeModules: { Synced: bridge },
  Alert: { alert: jest.fn() },
  Platform: { OS: "android", Version: 35 },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: "notification" },
    request: jest.fn().mockResolvedValue("granted"),
  },
  DeviceEventEmitter: {
    addListener: jest.fn((name, callback) => {
      listeners.set(name, callback);
      return { remove: () => listeners.delete(name) };
    }),
  },
  __listeners: listeners,
  __emit: (name, value) => listeners.get(name)?.(value),
};
