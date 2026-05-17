// DOM element type definitions
export interface DOMElements {
    // Version info
    versionElement: HTMLSpanElement;
    
    // Recording mode selection
    microphoneRadio: HTMLInputElement;
    systemRadio: HTMLInputElement;
    mixedRadio: HTMLInputElement;
    
    // Recording control buttons
    startRecordBtn: HTMLButtonElement;
    stopRecordBtn: HTMLButtonElement;
    
    // Audio controls
    audioControls?: HTMLDivElement;
    micMuteBtn: HTMLButtonElement;
    systemMuteBtn: HTMLButtonElement;
    micGainSlider: HTMLInputElement;
    systemGainSlider: HTMLInputElement;
    
    // Recording status
    recordingStatus: HTMLSpanElement;
    recordTime: HTMLSpanElement;
    
    // Audio visualization
    visualizer: HTMLCanvasElement;
    
    // Recordings list
    recordingsList: HTMLDivElement;

    // Permission elements
    microphoneStatus: HTMLElement;
    systemAudioStatus: HTMLElement;
    requestMicrophonePermissionBtn: HTMLButtonElement;
    requestSystemAudioPermissionBtn: HTMLButtonElement;
}

// Get DOM elements
export function getDOMElements(): DOMElements {
    console.log('Getting DOM elements...')
    
    const elements = {
        startRecordBtn: document.getElementById('startRecord') as HTMLButtonElement,
        stopRecordBtn: document.getElementById('stopRecord') as HTMLButtonElement,
        recordingStatus: document.getElementById('recordingStatus') as HTMLSpanElement,
        recordTime: document.getElementById('recordTime') as HTMLSpanElement,
        versionElement: document.getElementById('version') as HTMLSpanElement,
        recordingsList: document.getElementById('recordingsList') as HTMLDivElement,
        visualizer: document.getElementById('visualizer') as HTMLCanvasElement,
        microphoneRadio: document.querySelector('input[value="microphone"]') as HTMLInputElement,
        systemRadio: document.querySelector('input[value="system"]') as HTMLInputElement,
        mixedRadio: document.querySelector('input[value="mixed"]') as HTMLInputElement,
        micMuteBtn: document.getElementById('micMuteBtn') as HTMLButtonElement,
        systemMuteBtn: document.getElementById('systemMuteBtn') as HTMLButtonElement,
        micGainSlider: document.getElementById('micGainSlider') as HTMLInputElement,
        systemGainSlider: document.getElementById('systemGainSlider') as HTMLInputElement,
        microphoneStatus: document.getElementById('microphoneStatus') as HTMLElement,
        systemAudioStatus: document.getElementById('systemAudioStatus') as HTMLElement,
        requestMicrophonePermissionBtn: document.getElementById('requestMicrophonePermission') as HTMLButtonElement,
        requestSystemAudioPermissionBtn: document.getElementById('requestSystemAudioPermission') as HTMLButtonElement
    }

    // Check required elements exist
    const missingElements = Object.entries(elements)
        .filter(([_, element]) => !element)
        .map(([name]) => name)

    if (missingElements.length > 0) {
        console.error('Missing required DOM elements:', missingElements.join(', '))
    } else {
        console.log('All DOM elements found')
    }

    return elements;
}