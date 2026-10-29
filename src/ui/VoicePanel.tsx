import React from 'react';
import {ActivityIndicator, Text, View} from 'react-native';
import type {SyncedActions, SyncedState} from '../model/types';
import {voicePresentation} from './voicePresentation';
import {Button, SectionLabel, type ActionRunner} from './primitives';
import {s} from './styles';
import {palette as c} from './theme';

type Props = {state: SyncedState; actions: SyncedActions; busy: string | null; run: ActionRunner};

export function VoicePanel({state, actions, busy, run}: Props) {
  const presentation = voicePresentation({connected: state.status === 'connected', transport: state.transport, supported: state.capabilities.voiceLink, voice: state.voice});
  const phase = state.voice.phase;
  return <View style={[s.card, presentation.canAccept && s.verificationCard]}>
    <SectionLabel>SYNCED VOICE · LOCAL WI-FI</SectionLabel>
    <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.cardTitle}>{presentation.title}</Text>
    <Text style={s.body}>{presentation.detail}</Text>
    {presentation.canRequest && <>
      <Text style={s.smallText}>Your microphone starts after the other phone accepts and Android microphone permission is allowed.</Text>
      <Button label={busy === 'voice-request' ? 'Requesting voice…' : 'Request voice link'} variant="secondary" disabled={!!busy} onPress={() => {void run('voice-request', actions.requestVoiceCall);}} />
    </>}
    {presentation.canAccept && <Button label={busy === 'voice-accept' ? 'Opening microphone permission…' : 'Accept · Use microphone'} disabled={!!busy} onPress={() => {void run('voice-accept', actions.acceptVoiceCall);}} />}
    {presentation.available && (phase === 'outgoing' || phase === 'connecting') && <ActivityIndicator color={c.cyan} />}
    {presentation.canMute && <Button label={state.voice.muted ? 'Unmute my microphone' : 'Mute my microphone'} variant="secondary" onPress={() => actions.setVoiceMuted(!state.voice.muted)} />}
    {presentation.canEnd && <Button label={phase === 'incoming' ? 'Decline voice request' : phase === 'outgoing' ? 'Cancel voice request' : 'End voice link'} variant="danger" onPress={phase === 'incoming' ? actions.rejectVoiceCall : actions.endVoiceCall} />}
    <Text style={s.noticeText}>Synced voice is a separate intercom. Carrier and SIM call audio is not relayed, and Synced cannot answer a phone call.</Text>
  </View>;
}
