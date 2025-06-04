#pragma once

#ifdef __APPLE__
int CheckSystemAudioPermission();
bool RequestSystemAudioPermission();
#endif 