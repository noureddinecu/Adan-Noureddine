// Starts the embedded Node.js runtime (nodejs-mobile) that runs the LIVE QUIZ GAME server.
#include <jni.h>
#include <string>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <pthread.h>
#include <android/log.h>

#include "node.h"

static const char *TAG = "LQGNode";
static int pipe_out[2];
static int pipe_err[2];
static FILE *log_file = nullptr;

// Forward Node's stdout/stderr to logcat and to a log file the app can show.
static void *pump(void *arg) {
    int fd = *(int *) arg;
    int prio = (fd == pipe_err[0]) ? ANDROID_LOG_ERROR : ANDROID_LOG_INFO;
    char buf[2048];
    ssize_t n;
    while ((n = read(fd, buf, sizeof buf - 1)) > 0) {
        buf[n] = 0;
        __android_log_write(prio, TAG, buf);
        if (log_file) { fwrite(buf, 1, (size_t) n, log_file); fflush(log_file); }
    }
    return nullptr;
}

static void redirect_output() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    pipe(pipe_out);
    pipe(pipe_err);
    dup2(pipe_out[1], STDOUT_FILENO);
    dup2(pipe_err[1], STDERR_FILENO);
    pthread_t t1, t2;
    pthread_create(&t1, nullptr, pump, &pipe_out[0]);
    pthread_create(&t2, nullptr, pump, &pipe_err[0]);
    pthread_detach(t1);
    pthread_detach(t2);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_livequizgame_app_NodeService_startNode(JNIEnv *env, jclass, jobjectArray arguments, jobjectArray environment, jstring logPath) {
    // Environment variables (KEY=VALUE) for the server: DATA_DIR, PORT, LQG_SETUP_CODE, …
    jsize ne = env->GetArrayLength(environment);
    for (jsize i = 0; i < ne; i++) {
        auto js = (jstring) env->GetObjectArrayElement(environment, i);
        const char *kv = env->GetStringUTFChars(js, nullptr);
        std::string s(kv);
        size_t eq = s.find('=');
        if (eq != std::string::npos) setenv(s.substr(0, eq).c_str(), s.substr(eq + 1).c_str(), 1);
        env->ReleaseStringUTFChars(js, kv);
        env->DeleteLocalRef(js);
    }

    const char *lp = env->GetStringUTFChars(logPath, nullptr);
    log_file = fopen(lp, "w");
    env->ReleaseStringUTFChars(logPath, lp);
    redirect_output();

    // node::Start needs argv in one contiguous memory block (libuv requirement).
    jsize argc = env->GetArrayLength(arguments);
    size_t total = 0;
    for (jsize i = 0; i < argc; i++) {
        auto js = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *a = env->GetStringUTFChars(js, nullptr);
        total += strlen(a) + 1;
        env->ReleaseStringUTFChars(js, a);
        env->DeleteLocalRef(js);
    }
    char *block = (char *) calloc(total, sizeof(char));
    char **argv = (char **) calloc((size_t) argc + 1, sizeof(char *));
    char *p = block;
    for (jsize i = 0; i < argc; i++) {
        auto js = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *a = env->GetStringUTFChars(js, nullptr);
        strcpy(p, a);
        argv[i] = p;
        p += strlen(p) + 1;
        env->ReleaseStringUTFChars(js, a);
        env->DeleteLocalRef(js);
    }
    return jint(node::Start(argc, argv));
}
