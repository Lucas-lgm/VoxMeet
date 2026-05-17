#include <iostream>
#include <string>
#include <regex>
#include <memory>
#include <array>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <thread>
#include <atomic>
#include <csignal>
#include <filesystem>
#include <vector>
#include <libproc.h>
#include <CoreFoundation/CoreFoundation.h>

namespace fs = std::filesystem;

// Color definitions
const std::string RED = "\033[0;31m";
const std::string GREEN = "\033[0;32m";
const std::string YELLOW = "\033[1;33m";
const std::string BLUE = "\033[0;34m";
const std::string NC = "\033[0m"; // No Color

std::atomic<bool> g_running(true);

void signalHandler(int signum) {
    g_running = false;
}

std::string getCurrentTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&time), "%Y-%m-%d %H:%M:%S");
    return ss.str();
}

std::string executeCommand(const std::string& cmd) {
    std::array<char, 128> buffer;
    std::string result;
    std::unique_ptr<FILE, decltype(&pclose)> pipe(popen(cmd.c_str(), "r"), pclose);
    
    if (!pipe) {
        throw std::runtime_error("popen() failed!");
    }
    
    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr) {
        result += buffer.data();
    }
    
    return result;
}

std::string parseJsonValue(const std::string& json, const std::string& key) {
    // Remove ANSI color codes
    std::string cleanJson = json;
    std::regex colorRegex("\\x1b\\[[0-9;]*m");
    cleanJson = std::regex_replace(cleanJson, colorRegex, "");
    
    std::string pattern = "\"" + key + "\":\\s*([^,\\s}]+)";
    std::regex valueRegex(pattern);
    std::smatch matches;
    if (std::regex_search(cleanJson, matches, valueRegex)) {
        std::string value = matches[1].str();
        // Remove possible quotes
        if (value.front() == '"' && value.back() == '"') {
            value = value.substr(1, value.length() - 2);
        }
        return value;
    }
    return "";
}

class AppInfo {
public:
    std::string bundleId;
    std::string displayName;
    std::string executablePath;
    bool isSystemProcess;
    
    AppInfo() : isSystemProcess(false) {}
    AppInfo(const std::string& bid, const std::string& name, const std::string& path, bool isSystem = false)
        : bundleId(bid), displayName(name), executablePath(path), isSystemProcess(isSystem) {}
};

bool isSystemProcess(const std::string& processName) {
    static const std::vector<std::string> systemProcesses = {
        "corespeechd",
        "coreaudiod",
        "system_profiler",
        "launchd",
        "kernel_task"
    };
    
    for (const auto& sysProc : systemProcesses) {
        if (processName.find(sysProc) != std::string::npos) {
            return true;
        }
    }
    return false;
}

std::string getExecutablePath(pid_t pid) {
    std::cerr << YELLOW << "[DEBUG] Getting executable path for PID: " << pid << NC << std::endl;
    std::string cmd = "ps -p " + std::to_string(pid) + " -o command=";
    std::string result = executeCommand(cmd);
    
    std::cerr << YELLOW << "[DEBUG] PS command result: " << result << NC << std::endl;
    
    std::istringstream iss(result);
    std::string path;
    iss >> path;
    
    std::cerr << YELLOW << "[DEBUG] Extracted path: " << path << NC << std::endl;
    return path;
}

std::string getBundlePath(const std::string& execPath) {
    std::cerr << YELLOW << "[DEBUG] Getting bundle path for: " << execPath << NC << std::endl;
    if (execPath.find(".app/Contents/") != std::string::npos) {
        std::regex appRegex("(.*\\.app).*");
        std::smatch matches;
        if (std::regex_search(execPath, matches, appRegex)) {
            std::string bundlePath = matches[1].str();
            std::cerr << YELLOW << "[DEBUG] Found bundle path: " << bundlePath << NC << std::endl;
            return bundlePath;
        }
    }
    std::cerr << YELLOW << "[DEBUG] No bundle path found, returning original path" << NC << std::endl;
    return execPath;
}

std::string getMetadataValue(const std::string& path, const std::string& key) {
    std::cerr << YELLOW << "[DEBUG] Getting metadata value for path: " << path << ", key: " << key << NC << std::endl;
    std::string cmd = "mdls -name " + key + " \"" + path + "\" 2>/dev/null";
    std::string result = executeCommand(cmd);
    
    std::cerr << YELLOW << "[DEBUG] MDLS command result: " << result << NC << std::endl;
    
    std::regex valueRegex("\"([^\"]+)\"");
    std::smatch matches;
    if (std::regex_search(result, matches, valueRegex)) {
        std::string value = matches[1].str();
        std::cerr << YELLOW << "[DEBUG] Extracted value: " << value << NC << std::endl;
        return value;
    }
    std::cerr << YELLOW << "[DEBUG] No value found for key: " << key << NC << std::endl;
    return "";
}

// Get parent process ID via libproc API
pid_t getParentPid(pid_t pid) {
    std::cout << YELLOW << "[DEBUG] Getting parent PID for: " << pid << NC << std::endl;
    
    struct proc_bsdinfo proc_info;
    if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &proc_info, sizeof(proc_info)) <= 0) {
        std::cerr << RED << "[ERROR] Failed to get process info for PID: " << pid << NC << std::endl;
        return -1;
    }
    
    pid_t ppid = proc_info.pbi_ppid;
    std::cout << YELLOW << "[DEBUG] Parent PID result: " << ppid << NC << std::endl;
    return ppid;
}

// Get complete process info
struct ProcessInfo {
    pid_t pid;
    pid_t ppid;
    std::string name;
    std::string path;
    bool isSystem;
};

ProcessInfo getProcessInfo(pid_t pid) {
    ProcessInfo info;
    info.pid = pid;
    info.isSystem = false;
    
    // Get process basic info
    struct proc_bsdinfo proc_info;
    if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &proc_info, sizeof(proc_info)) <= 0) {
        throw std::runtime_error("Cannot get process info");
    }
    
    info.ppid = proc_info.pbi_ppid;
    info.name = proc_info.pbi_name;
    
    // Get process path
    char pathbuf[PROC_PIDPATHINFO_MAXSIZE];
    if (proc_pidpath(pid, pathbuf, sizeof(pathbuf)) <= 0) {
        throw std::runtime_error("Cannot get process path");
    }
    info.path = pathbuf;
    
    // Check if system process
    info.isSystem = isSystemProcess(info.name);
    
    return info;
}

// Get process info via libproc API
AppInfo getAppInfoUsingLibProc(pid_t pid) {
    char pathbuf[PROC_PIDPATHINFO_MAXSIZE];
    char namebuf[PROC_PIDPATHINFO_MAXSIZE];
    
    // Get process path
    if (proc_pidpath(pid, pathbuf, sizeof(pathbuf)) <= 0) {
        std::cerr << RED << "[ERROR] Cannot get process path for PID: " << pid << NC << std::endl;
        throw std::runtime_error("Cannot get process path");
    }
    
    std::cout << YELLOW << "[DEBUG] Process path: " << pathbuf << NC << std::endl;
    
    // Get process name
    if (proc_name(pid, namebuf, sizeof(namebuf)) <= 0) {
        std::cerr << RED << "[ERROR] Cannot get process name for PID: " << pid << NC << std::endl;
        throw std::runtime_error("Cannot get process name");
    }
    
    std::string execPath(pathbuf);
    std::string processName(namebuf);
    
    std::cout << YELLOW << "[DEBUG] Process name: " << processName << NC << std::endl;
    
    // Check if system process
    if (isSystemProcess(processName)) {
        return AppInfo("com.apple." + processName, processName, execPath, true);
    }
    
    // Try to extract Bundle ID from path
    std::string bundleId;
    if (execPath.find(".app/Contents/") != std::string::npos) {
        // Extract .app path
        size_t appPos = execPath.find(".app");
        if (appPos != std::string::npos) {
            std::string appPath = execPath.substr(0, appPos + 4);
            std::cout << YELLOW << "[DEBUG] Found app path: " << appPath << NC << std::endl;
            
            // Get Bundle info
            CFURLRef bundleURL = CFURLCreateFromFileSystemRepresentation(
                kCFAllocatorDefault,
                (const UInt8*)appPath.c_str(),
                appPath.length(),
                true
            );
            
            if (bundleURL) {
                CFBundleRef bundle = CFBundleCreate(kCFAllocatorDefault, bundleURL);
                if (bundle) {
                    // Get Bundle ID
                    CFStringRef bundleIdRef = CFBundleGetIdentifier(bundle);
                    if (bundleIdRef) {
                        char bundleIdStr[256];
                        if (CFStringGetCString(bundleIdRef, bundleIdStr, sizeof(bundleIdStr), kCFStringEncodingUTF8)) {
                            bundleId = bundleIdStr;
                            std::cout << YELLOW << "[DEBUG] Found Bundle ID: " << bundleId << NC << std::endl;
                        }
                    } else {
                        std::cerr << YELLOW << "[DEBUG] No Bundle ID found in bundle" << NC << std::endl;
                    }
                    
                    // Get display name
                    CFStringRef displayName = (CFStringRef)CFBundleGetValueForInfoDictionaryKey(
                        bundle,
                        CFSTR("CFBundleDisplayName")
                    );
                    
                    std::string displayNameStr;
                    if (displayName) {
                        char displayNameBuf[256];
                        if (CFStringGetCString(displayName, displayNameBuf, sizeof(displayNameBuf), kCFStringEncodingUTF8)) {
                            displayNameStr = displayNameBuf;
                        }
                    }
                    
                    if (displayNameStr.empty()) {
                        // Try to get CFBundleName
                        CFStringRef bundleName = (CFStringRef)CFBundleGetValueForInfoDictionaryKey(
                            bundle,
                            CFSTR("CFBundleName")
                        );
                        if (bundleName) {
                            char bundleNameBuf[256];
                            if (CFStringGetCString(bundleName, bundleNameBuf, sizeof(bundleNameBuf), kCFStringEncodingUTF8)) {
                                displayNameStr = bundleNameBuf;
                            }
                        }
                    }
                    
                    if (displayNameStr.empty()) {
                        // If still no display name, use process name
                        displayNameStr = processName;
                    }
                    
                    CFRelease(bundle);
                    CFRelease(bundleURL);
                    
                    if (!bundleId.empty()) {
                        return AppInfo(bundleId, displayNameStr, execPath);
                    }
                } else {
                    std::cerr << YELLOW << "[DEBUG] Failed to create bundle from URL" << NC << std::endl;
                }
                CFRelease(bundleURL);
            } else {
                std::cerr << YELLOW << "[DEBUG] Failed to create URL from path" << NC << std::endl;
            }
        }
    }
    
    // If Bundle ID unavailable, try generating one from process name
    if (processName == "MSTeams") {
        return AppInfo("com.microsoft.teams", "Microsoft Teams", execPath);
    }
    
    // For other processes, use process name as part of Bundle ID
    std::string generatedBundleId = "com.unknown." + processName;
    std::cout << YELLOW << "[DEBUG] Using generated Bundle ID: " << generatedBundleId << NC << std::endl;
    return AppInfo(generatedBundleId, processName, execPath, true);
}

// Recursively search process tree until root process
std::vector<ProcessInfo> getProcessTree(pid_t pid) {
    std::vector<ProcessInfo> processTree;
    pid_t currentPid = pid;
    
    while (currentPid > 1) {  // Until init process (PID 1)
        try {
            ProcessInfo info = getProcessInfo(currentPid);
            processTree.push_back(info);
            currentPid = info.ppid;
        } catch (const std::exception& e) {
            std::cerr << YELLOW << "[DEBUG] Error getting process info for PID " << currentPid 
                     << ": " << e.what() << NC << std::endl;
            break;
        }
    }
    
    return processTree;
}

// Find first valid app info from process tree
AppInfo findAppInfoFromProcessTree(const std::vector<ProcessInfo>& processTree) {
    for (const auto& proc : processTree) {
        std::cout << YELLOW << "[DEBUG] Checking process: " << proc.name 
                 << " (PID: " << proc.pid << ")" << NC << std::endl;
        
        // If system process, skip
        if (proc.isSystem) {
            std::cout << YELLOW << "[DEBUG] Skipping system process: " << proc.name << NC << std::endl;
            continue;
        }
        
        try {
            // Try to get app info
            AppInfo appInfo = getAppInfoUsingLibProc(proc.pid);
            if (!appInfo.bundleId.empty() && appInfo.bundleId.find("unknown.") == std::string::npos) {
                std::cout << YELLOW << "[DEBUG] Found valid app info for process: " << proc.name 
                         << " (Bundle ID: " << appInfo.bundleId << ")" << NC << std::endl;
                return appInfo;
            }
        } catch (const std::exception& e) {
            std::cerr << YELLOW << "[DEBUG] Failed to get app info for process " << proc.name 
                     << ": " << e.what() << NC << std::endl;
        }
    }
    
    // If no valid app info found, return last non-system process
    for (auto it = processTree.rbegin(); it != processTree.rend(); ++it) {
        if (!it->isSystem) {
            std::string bundleId = "com.unknown." + it->name;
            return AppInfo(bundleId, it->name, it->path, false);
        }
    }
    
    // If all processes are system, return first process info
    if (!processTree.empty()) {
        const auto& proc = processTree.front();
        return AppInfo("com.apple." + proc.name, proc.name, proc.path, true);
    }
    
    // If process tree is empty, return unknown process info
    return AppInfo("com.unknown.process", "Unknown Process", "", true);
}

// Update findAppInfoRecursively function
AppInfo findAppInfoRecursively(pid_t pid, int depth = 0) {
    if (depth > 0) {  // Only get process tree on first call
        return AppInfo("com.unknown.process", "Unknown Process", "", true);
    }
    
    std::cout << YELLOW << "[DEBUG] Getting process tree for PID: " << pid << NC << std::endl;
    
    try {
        // Get full process tree
        std::vector<ProcessInfo> processTree = getProcessTree(pid);
        
        // Print process tree info
        std::cout << YELLOW << "[DEBUG] Process tree:" << NC << std::endl;
        for (const auto& proc : processTree) {
            std::cout << YELLOW << "  PID: " << proc.pid 
                     << ", Name: " << proc.name 
                     << ", PPID: " << proc.ppid 
                     << (proc.isSystem ? " (System)" : "") << NC << std::endl;
        }
        
        // Find app info from process tree
        return findAppInfoFromProcessTree(processTree);
    } catch (const std::exception& e) {
        std::cerr << RED << "[ERROR] Error processing PID " << pid << ": " << e.what() << NC << std::endl;
        return AppInfo("com.unknown.process", "Unknown Process", "", true);
    }
}

// Update existing getAppNameFromPid function
AppInfo getAppNameFromPid(pid_t pid) {
    if (pid <= 0) {
        std::cerr << RED << "[ERROR] Invalid process ID: " << pid << NC << std::endl;
        throw std::runtime_error("Invalid process ID");
    }
    
    return findAppInfoRecursively(pid);
}

void processLogLine(const std::string& line) {
    // Look up JSON data
    std::regex jsonRegex("\\{[^\\}]+\\}");
    std::smatch jsonMatches;
    if (!std::regex_search(line, jsonMatches, jsonRegex)) {
        std::cerr << YELLOW << "[DEBUG] No JSON data found in line: " << line << NC << std::endl;
        return;
    }
    
    // Get full JSON data
    size_t start = line.find('{');
    size_t end = line.rfind('}');
    if (start == std::string::npos || end == std::string::npos) {
        std::cerr << YELLOW << "[DEBUG] Invalid JSON format in line: " << line << NC << std::endl;
        return;
    }
    std::string jsonData = line.substr(start, end - start + 1);
    
    // Check if status update
    if (jsonData.find("\"action\":\"update_running_state\"") == std::string::npos) {
        std::cerr << YELLOW << "[DEBUG] Not a state update message: " << jsonData << NC << std::endl;
        return;
    }
    
    // Get current timestamp
    std::string timestamp = getCurrentTimestamp();
    
    // Extract process info
    std::regex nameRegex("\"name\":\"([^\"]+)\"");
    std::smatch nameMatches;
    std::string processInfo;
    if (std::regex_search(jsonData, nameMatches, nameRegex)) {
        processInfo = nameMatches[1].str();
        std::cerr << YELLOW << "[DEBUG] Process info: " << processInfo << NC << std::endl;
    } else {
        std::cerr << YELLOW << "[DEBUG] No process info found in: " << jsonData << NC << std::endl;
        return;
    }
    
    // Extract PID
    std::regex pidRegex("\\(([0-9]+)\\)");
    std::smatch pidMatches;
    std::string pid;
    if (std::regex_search(processInfo, pidMatches, pidRegex)) {
        pid = pidMatches[1].str();
        std::cerr << YELLOW << "[DEBUG] Found PID: " << pid << NC << std::endl;
    } else {
        std::cerr << YELLOW << "[DEBUG] No PID found in process info: " << processInfo << NC << std::endl;
        return;
    }
    
    // Extract process name
    std::string processName = processInfo.substr(0, processInfo.find("("));
    std::cerr << YELLOW << "[DEBUG] Process name: " << processName << NC << std::endl;
    
    // Get status
    std::string inputRunning = parseJsonValue(jsonData, "input_running");
    std::string outputRunning = parseJsonValue(jsonData, "output_running");
    std::string category = parseJsonValue(jsonData, "implicit_category");
    
    std::cerr << YELLOW << "[DEBUG] Status - Input: " << inputRunning 
              << ", Output: " << outputRunning 
              << ", Category: " << category << NC << std::endl;
    
    try {
        AppInfo appInfo = getAppNameFromPid(std::stoi(pid));
        
        // Build output JSON
        std::stringstream outputJson;
        outputJson << "###JSON_START###";
        outputJson << "{";
        outputJson << "\"type\":\"mic_status\",";
        outputJson << "\"timestamp\":\"" << timestamp << "\",";
        outputJson << "\"status\":\"" << (inputRunning == "true" ? "ON" : "OFF") << "\",";
        outputJson << "\"app\":{";
        outputJson << "\"name\":\"" << appInfo.displayName << "\",";
        outputJson << "\"bundleId\":\"" << appInfo.bundleId << "\",";
        outputJson << "\"process\":\"" << processName << "\",";
        outputJson << "\"pid\":" << pid << ",";
        outputJson << "\"path\":\"" << appInfo.executablePath << "\",";
        outputJson << "\"isSystemProcess\":" << (appInfo.isSystemProcess ? "true" : "false");
        outputJson << "},";
        outputJson << "\"audio\":{";
        outputJson << "\"category\":\"" << category << "\",";
        outputJson << "\"outputRunning\":" << outputRunning;
        outputJson << "}";
        outputJson << "}";
        outputJson << "###JSON_END###";
        
        // Output JSON to stdout
        std::cout << outputJson.str() << std::endl;
        
    } catch (const std::exception& e) {
        // Error info in JSON format too
        std::stringstream errorJson;
        errorJson << "###JSON_START###";
        errorJson << "{";
        errorJson << "\"type\":\"error\",";
        errorJson << "\"timestamp\":\"" << timestamp << "\",";
        errorJson << "\"error\":\"" << e.what() << "\",";
        errorJson << "\"pid\":" << pid << ",";
        errorJson << "\"rawData\":" << jsonData;
        errorJson << "}";
        errorJson << "###JSON_END###";
        
        // Error info output to stderr
        std::cerr << errorJson.str() << std::endl;
    }
}

int main() {
    signal(SIGINT, signalHandler);
    
    std::cout << "Starting microphone usage monitoring..." << std::endl;
    std::cout << "Press Ctrl+C to stop monitoring" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    std::string cmd = "log stream --predicate 'subsystem == \"com.apple.coreaudio\" AND eventMessage CONTAINS \"input\"'";
    std::unique_ptr<FILE, decltype(&pclose)> pipe(popen(cmd.c_str(), "r"), pclose);
    
    if (!pipe) {
        std::cerr << "Failed to start log stream" << std::endl;
        return 1;
    }
    
    std::array<char, 4096> buffer;
    while (g_running) {
        if (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr) {
            processLogLine(buffer.data());
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    
    return 0;
} 