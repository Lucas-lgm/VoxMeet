import { createLogger } from "../logger";

export enum PermissionStatus {
    GRANTED = 0,
    DENIED = 1,
    NOT_REQUESTED = 2,
}

const logger = createLogger('permissions');

// Requesting all permissions
export async function requestAllPermissions(): Promise<{ microphone: PermissionStatus, systemAudio: PermissionStatus }> {
    return await window.electronAPI.permissions.requestAll();
}

// Checking permission status
export async function checkPermissions(): Promise<[boolean, boolean]> {
    try {
        const permissions = await window.electronAPI.permissions.getAll();
        
        // Checking system audio permission
        if (permissions.microphone !== PermissionStatus.GRANTED) {
            logger.warn('⚠️ Microphone permission not granted');
        }

        if (permissions.systemAudio !== PermissionStatus.GRANTED) {
            logger.warn('⚠️ System audio permission not granted');
        }
        
        return [permissions.microphone === PermissionStatus.GRANTED, permissions.systemAudio === PermissionStatus.GRANTED];
    } catch (error) {
        logger.error(`Permission check failed: ${error}`);
        return [false, false];
    }
}

// Show permission hint
export function showPermissionHint(type: 'microphone' | 'system'): void {
    // Create permission hint element
    const permissionHint = document.createElement('div');
    permissionHint.id = 'permission-hint';
    
    const title = type === 'microphone' ? 'Microphone Permission Required' : 'System Audio Permission Required';
    const description = type === 'microphone' 
        ? 'Grant microphone access to record your voice:'
        : 'Grant system audio access to record system output:';
    
    permissionHint.innerHTML = `
        <div class="permission-notice">
            <h3>⚠️ ${title}</h3>
            <p>${description}</p>
            <ol>
                <li>Click the button below to open System Preferences</li>
                <li>Select "${type === 'microphone' ? 'Microphone' : 'Screen Recording'}"</li>
                <li>Add this app and check it</li>
                <li>Restart the app</li>
            </ol>
            <div class="permission-actions">
                <button id="openPreferences" class="btn btn-primary">Opening System Preferences</button>
                <button id="dismissHint" class="btn btn-secondary">Later</button>
            </div>
        </div>
    `;
    
    // Add styles
    permissionHint.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    const notice = permissionHint.querySelector('.permission-notice') as HTMLElement;
    notice.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 20px;
        max-width: 500px;
        text-align: center;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    `;
    
    const actions = permissionHint.querySelector('.permission-actions') as HTMLElement;
    actions.style.cssText = `
        display: flex;
        gap: 15px;
        justify-content: center;
        margin-top: 20px;
    `;
    
    document.body.appendChild(permissionHint);
    
    // Bind events
    const openBtn = document.getElementById('openPreferences');
    const dismissBtn = document.getElementById('dismissHint');
    
    if (openBtn) {
        openBtn.addEventListener('click', async () => {
            await window.electronAPI.permissions.openSystemPreferences();
            permissionHint.remove();
        });
    }
    
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            permissionHint.remove();
        });
    }
} 