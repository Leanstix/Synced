import React from 'react';
import {ActivityIndicator, Text, View} from 'react-native';
import type {SyncedActions, SyncedState} from '../model/types';
import {pairingSavePresentation, reconnectPresentation} from './pairingPresentation';
import {Button, SectionLabel, type ActionRunner} from './primitives';
import {s} from './styles';
import {palette as c} from './theme';

type Props = {state: SyncedState; actions: SyncedActions; busy: string | null; run: ActionRunner};

export function SavePairingPanel({state, actions, busy, run}: Props) {
  if (!state.capabilities.persistentPairing) return null;
  const presentation = pairingSavePresentation(state);
  return <View style={s.card}>
    <SectionLabel>YOUR CHOICE, ON BOTH PHONES</SectionLabel>
    <Text accessibilityRole="header" style={s.cardTitle}>{presentation.title}</Text>
    <Text style={s.body}>{presentation.detail}</Text>
    {state.pairingState !== 'saved' && <Button label={state.pairingState === 'requested' ? 'Requested · Waiting for both phones' : busy === 'save-pairing' ? 'Requesting to save…' : 'Save pairing'} variant="secondary" disabled={!!busy || !presentation.canSave} onPress={() => {void run('save-pairing', actions.savePairing);}} />}
  </View>;
}

export function ReconnectPanel({state, actions}: Pick<Props, 'state' | 'actions'>) {
  const presentation = reconnectPresentation(state.reconnect.active, state.reconnect.attempt, state.reconnect.maxAttempts);
  if (!presentation.visible) return null;
  return <View style={s.card}>
    <View style={s.cardHeading}><ActivityIndicator color={c.cyan} /><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.cardTitle}>{presentation.title}</Text></View>
    <Text style={s.body}>{presentation.detail}</Text>
    <Button label="Cancel reconnect" variant="secondary" onPress={actions.cancelReconnect} />
  </View>;
}
