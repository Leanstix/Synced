import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useSynced } from './src/controller/useSynced';
import { SyncedScreen } from './src/ui/SyncedScreen';

export default function App() {
  const { state, actions } = useSynced();
  return <SafeAreaProvider><StatusBar style="light" /><SyncedScreen state={state} actions={actions} /></SafeAreaProvider>;
}
