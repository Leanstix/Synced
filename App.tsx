import React from "react";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useSynced } from "./src/controller/useSynced";
import { SyncedScreen } from "./src/ui/SyncedScreen";

export default function App() {
  const { state, actions } = useSynced();
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <SyncedScreen state={state} actions={actions} />
    </SafeAreaProvider>
  );
}
