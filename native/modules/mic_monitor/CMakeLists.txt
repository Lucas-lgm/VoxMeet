cmake_minimum_required(VERSION 3.10)
project(mic_monitor)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../output)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CMAKE_CURRENT_SOURCE_DIR}/../output)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_CURRENT_SOURCE_DIR}/../output)

# Add all source files
set(SOURCES
    monitor_mic_usage.cpp
)

# Add single executable
add_executable(mic_monitor ${SOURCES})

# Set compile options
if(APPLE)
    target_compile_options(mic_monitor PRIVATE -Wall -Wextra)
endif()

# Install target
install(TARGETS mic_monitor
        RUNTIME DESTINATION bin)

# Add CoreFoundation framework
find_library(COREFOUNDATION_LIBRARY CoreFoundation)
if(NOT COREFOUNDATION_LIBRARY)
    message(FATAL_ERROR "CoreFoundation framework not found")
endif()

# Link CoreFoundation
target_link_libraries(mic_monitor ${COREFOUNDATION_LIBRARY}) 