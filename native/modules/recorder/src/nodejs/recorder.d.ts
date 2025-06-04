declare module 'recorder' {
  interface MixedPCMData {
    data: Buffer;
    frames: number;
    sampleRate: number;
  }

  type MixedPCMCallback = (data: MixedPCMData) => void;

  class Recorder {
    constructor();
    prepare(): boolean;
    startCapture(): boolean;
    stopCapture(): void;
    setMixedPCMCallback(callback: MixedPCMCallback): void;
    setOutputFile(path: string): void;
    setMicGain(gain: number): void;
    setSystemGain(gain: number): void;
    setAECEnabled(enabled: boolean): void;
    static checkSystemAudioPermission(): number;
    static requestSystemAudioPermission(): boolean;
  }

  export { Recorder, MixedPCMData, MixedPCMCallback };
  export default Recorder;
}
