#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🔍 Checking recording app permission status...\n');

// App identifier
const appId = 'com.voxmeet.app';

// Check permission function
function checkPermission(service, description) {
    try {
        const result = execSync(`tccutil list | grep "${service}" | grep "${appId}" || echo "Permission record not found"`).toString().trim();

        if (result.includes('ALLOWED')) {
            console.log(`✅ ${description}: Granted`);
            return true;
        } else if (result.includes('DENIED')) {
            console.log(`❌ ${description}: Denied`);
            return false;
        } else {
            console.log(`⚠️  ${description}: Not set (requires first request from app)`);
            return null;
        }
    } catch (error) {
        console.log(`❓ ${description}: Unable to check (${error.message.split('\n')[0]})`);
        return null;
    }
}

// Check all permissions
console.log('📋 Permission check results:');
console.log('─'.repeat(50));

const micPermission = checkPermission('kTCCServiceMicrophone', 'Microphone permission');

console.log('─'.repeat(50));

// Suggestions
console.log('\n💡 Permission recommendations:');

if (micPermission === false) {
    console.log('🎤 Microphone permission denied - re-authorize in System Settings');
} else if (micPermission === null) {
    console.log('🎤 Microphone permission not set - app will prompt on launch');
} else {
    console.log('✅ Microphone permission configured correctly');
}

console.log('\n🔧 Manual setup path:');
console.log('System Settings → Privacy & Security → Privacy → Microphone');

console.log('\n🚀 Reset all permissions (if needed):');
console.log(`tccutil reset All ${appId}`);

console.log('\n📖 See PERMISSIONS.md for details');