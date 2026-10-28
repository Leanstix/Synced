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
