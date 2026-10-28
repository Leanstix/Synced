import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { initialState, UiState, useSynced } from "../src/controller/useSynced";

jest.mock("react-native", () => require("../test-support/nativeBridgeMock"));

const native = jest.requireMock("react-native");
let mounted: ReactTestRenderer | undefined;
let current: ReturnType<typeof useSynced>;
function Probe() {
  current = useSynced();
  return null;
}
async function mount() {
  await act(async () => {
    mounted = create(<Probe />);
  });
}
function status(state: Partial<UiState> & { _sessionId?: number }) {
  act(() => native.__emit("SyncedState", { ...initialState, ...state }));
}

beforeEach(() => {
  native.__listeners.clear();
  Object.values(native.NativeModules.Synced).forEach((value) =>
    (value as jest.Mock).mockReset()
  );
  native.Alert.alert.mockReset();
  native.NativeModules.Synced.getState.mockResolvedValue(initialState);
});
afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = undefined;
});

it("reads native state without starting a connection or screen capture", async () => {
  await mount();
  expect(current.state.role).toBe("IDLE");
  expect(native.NativeModules.Synced.startHosting).not.toHaveBeenCalled();
  expect(native.NativeModules.Synced.startCapture).not.toHaveBeenCalled();
});
it("ignores a frame until an approved controller session is sharing", async () => {
  await mount();
  act(() => native.__emit("SyncedFrame", { uri: "private-frame" }));
  expect(current.state.remoteFrame).toBeNull();
  status({ role: "CONTROLLER", connected: true, capturing: true });
  act(() => native.__emit("SyncedFrame", { uri: "approved-frame" }));
  expect(current.state.remoteFrame).toBe("approved-frame");
});
it("clears displayed frames when the host stops capture", async () => {
  await mount();
  status({ role: "CONTROLLER", connected: true, capturing: true });
  act(() => native.__emit("SyncedFrame", { uri: "approved-frame" }));
  status({ role: "CONTROLLER", connected: true, capturing: false });
  expect(current.state.remoteFrame).toBeNull();
});
it("does not let a delayed initial snapshot overwrite a live status event", async () => {
  let resolve!: (value: UiState) => void;
  native.NativeModules.Synced.getState.mockReturnValue(
    new Promise<UiState>((done) => {
      resolve = done;
    })
  );
  await mount();
  status({ role: "HOST", connected: true, status: "Approved live session" });
  await act(async () => {
    resolve(initialState);
  });
  expect(current.state.status).toBe("Approved live session");
});
it("removes native event subscriptions when the React tree unmounts", async () => {
  await mount();
  expect(native.__listeners.size).toBe(2);
  await act(async () => mounted?.unmount());
  mounted = undefined;
  expect(native.__listeners.size).toBe(0);
});
it("requires the positive local consent action before allowing input", async () => {
  await mount();
  current.actions.setControlAllowed(true);
  expect(native.NativeModules.Synced.setControlAllowed).not.toHaveBeenCalled();
  const buttons = native.Alert.alert.mock.calls[0][2];
  buttons[1].onPress();
  expect(native.NativeModules.Synced.setControlAllowed).toHaveBeenCalledWith(
    true
  );
  current.actions.setControlAllowed(false);
  expect(
    native.NativeModules.Synced.setControlAllowed
  ).toHaveBeenLastCalledWith(false);
});
it("rejects invalid gesture coordinates at the TypeScript bridge boundary", async () => {
  await mount();
  current.actions.sendGesture(NaN, 0, 1, 1, 100);
  current.actions.sendGesture(0, -1, 1, 1, 100);
  current.actions.sendGesture(0, 0, Infinity, 1, 100);
  current.actions.sendGesture(0, 0, 1, 1, NaN);
  expect(native.NativeModules.Synced.sendGesture).not.toHaveBeenCalled();
});
it("bounds gesture duration before crossing the native bridge", async () => {
  await mount();
  current.actions.sendGesture(0, 0, 1, 1, 5000);
  expect(native.NativeModules.Synced.sendGesture).toHaveBeenLastCalledWith(
    0,
    0,
    1,
    1,
    1500
  );
});
it("does not dispatch arbitrary actions or invalid clock times", async () => {
  await mount();
  ["unlock", "grant_permissions", "set_alarm:24:00", "set_alarm:12:60"].forEach(
    (value) => current.actions.sendAction(value)
  );
  expect(native.NativeModules.Synced.sendAction).not.toHaveBeenCalled();
  current.actions.sendAction("set_alarm:7:05");
  expect(native.NativeModules.Synced.sendAction).toHaveBeenCalledWith(
    "set_alarm:7:05"
  );
});
it("bounds text while preserving Unicode content", async () => {
  await mount();
  current.actions.sendText("");
  current.actions.sendText("x".repeat(1001));
  expect(native.NativeModules.Synced.sendText).not.toHaveBeenCalled();
  current.actions.sendText("Ẹ káàárọ̀ 📱");
  expect(native.NativeModules.Synced.sendText).toHaveBeenCalledWith(
    "Ẹ káàárọ̀ 📱"
  );
});
it("surfaces native initialization failure instead of pretending to connect", async () => {
  native.NativeModules.Synced.getState.mockRejectedValue(
    new Error("unavailable")
  );
  await mount();
  expect(current.state.error).toBeTruthy();
  expect(current.state.connected).toBe(false);
});

it("rejects stale-session frames and clears the previous session image", async () => {
  await mount();
  status({
    role: "CONTROLLER",
    connected: true,
    capturing: true,
    _sessionId: 7,
  });
