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
