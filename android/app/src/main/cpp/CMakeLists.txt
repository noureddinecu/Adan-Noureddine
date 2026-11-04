cmake_minimum_required(VERSION 3.18.1)
project("lqgnative")

# nodejs-mobile (Node.js for Android) is downloaded by the build workflow into android/app/libnode:
#   libnode/include/node/node.h …   and   libnode/bin/<abi>/libnode.so
set(LIBNODE_DIR ${CMAKE_SOURCE_DIR}/../../../libnode)

include_directories(${LIBNODE_DIR}/include/node)

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES IMPORTED_LOCATION ${LIBNODE_DIR}/bin/${ANDROID_ABI}/libnode.so)

add_library(native-lib SHARED native-lib.cpp)
find_library(log-lib log)
target_link_libraries(native-lib libnode ${log-lib})
