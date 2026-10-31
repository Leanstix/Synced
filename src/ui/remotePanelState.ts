import {screenAspectMatches, type Size} from './viewportGeometry';

type RemotePanelInput = {
  connected: boolean;
  transport: 'wifi' | 'bluetooth';
  controlEnabled: boolean;
  streamUrl: string | null;
  frame: Size | null;
  screen: Size | null;
};

/** Buttons can work without video. Preserve native-frame mismatch detection, but
 * use the consented host's screen geometry if RTCView omits its first dimension event. */
export function remotePanelState(input: RemotePanelInput) {
  const bluetooth = input.transport === 'bluetooth';
  const hasVideo = input.connected && !bluetooth && !!input.streamUrl;
  const canControl = input.connected && input.controlEnabled;
  const inferredFrame = hasVideo && !input.frame && !!input.screen;
  const mappedFrame = input.frame ?? (hasVideo ? input.screen : null);
  const aspectMatches = screenAspectMatches(mappedFrame, input.screen);
  const canTouch = canControl && hasVideo && aspectMatches;
  const caption = bluetooth
    ? canControl ? 'Bluetooth controls allowed · No live screen' : 'Bluetooth · Waiting for touch-control approval'
    : canTouch ? 'Touch control allowed'
      : canControl && hasVideo ? input.frame && input.screen ? 'Touch gestures paused · Screen size differs' : 'Waiting for screen dimensions'
        : canControl ? 'Controls allowed · Waiting for screen sharing' : 'Screen viewing only';
  return {bluetooth, hasVideo, canControl, canTouch, aspectMatches, caption, mappedFrame, inferredFrame};
}

export function alarmFieldsValid(hour: string, minute: string): boolean {
  return /^\d{1,2}$/.test(hour) && /^\d{1,2}$/.test(minute) && Number(hour) <= 23 && Number(minute) <= 59;
}
