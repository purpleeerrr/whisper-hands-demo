export function parseDeviceLine(line) {
  const value = String(line).trim();
  if (value === 'MARK') {
    return { eventId: `evt_serial_${Date.now()}`, type: 'MARK_PRESSED' };
  }
  if (value === 'VOICE_START') {
    return { eventId: `evt_voice_start_${Date.now()}`, type: 'VOICE_CAPTURE_STARTED' };
  }
  if (value === 'VOICE_STOP') {
    return { eventId: `evt_voice_stop_${Date.now()}`, type: 'VOICE_CAPTURE_STOPPED' };
  }
  try {
    const event = JSON.parse(value);
    if (!['MARK_PRESSED', 'VOICE_CAPTURE_STARTED', 'VOICE_CAPTURE_STOPPED'].includes(event.type)) return null;
    return {
      eventId: event.event_id || event.eventId || `evt_serial_${Date.now()}`,
      type: event.type,
    };
  } catch {
    return null;
  }
}
