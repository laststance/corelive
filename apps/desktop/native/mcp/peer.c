// Darwin bindings for verified local sockets and atomic file publication.
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <node_api.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <uv.h>
#include "peer_identity.h"

typedef struct {
  uv_poll_t poll;
  napi_env env;
  napi_ref adopt;
  int fd;
  bool closed;
  bool released;
} Listener;

static napi_value fail(napi_env env, const char *code) {
  napi_throw_error(env, code, code);
  return NULL;
}

// Copy the complete UTF-8 path: a truncated or embedded-NUL name could publish to another file.
static int export_path(napi_env env, napi_value value, char path[PATH_MAX]) {
  size_t bytes;
  if (napi_get_value_string_utf8(env, value, NULL, 0, &bytes) != napi_ok || bytes == 0)
    return EINVAL;
  if (bytes >= PATH_MAX) return ENAMETOOLONG;
  if (napi_get_value_string_utf8(env, value, path, PATH_MAX, &bytes) != napi_ok ||
      path[0] != '/' || strlen(path) != bytes) return EINVAL;
  return 0;
}

// Publish a complete staged export only if the destination name is still vacant.
static napi_value rename_exclusive(napi_env env, napi_callback_info info) {
  napi_value args[2], result;
  size_t argc = 2;
  char from[PATH_MAX], to[PATH_MAX];
  if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok || argc != 2)
    return fail(env, "EINVAL");
  int error = export_path(env, args[0], from);
  if (!error) error = export_path(env, args[1], to);
  if (!error && renamex_np(from, to, RENAME_EXCL) < 0) error = errno;
  if (error) return fail(env, uv_err_name(uv_translate_sys_error(error)));
  napi_get_undefined(env, &result);
  return result;
}

static int prepare_fd(int fd) {
  if (fcntl(fd, F_SETFD, FD_CLOEXEC) < 0 || fcntl(fd, F_SETFL, O_NONBLOCK) < 0) {
    close(fd);
    return -1;
  }
  return fd;
}

// Until the callback returns a Socket, native owns the descriptor and closes it on every error.
static napi_value handoff(napi_env env, napi_value adopt, int fd) {
  napi_value jsfd, self, socket;
  napi_valuetype type;
  if (napi_create_int32(env, fd, &jsfd) == napi_ok &&
      napi_get_undefined(env, &self) == napi_ok &&
      napi_call_function(env, self, adopt, 1, &jsfd, &socket) == napi_ok &&
      napi_typeof(env, socket, &type) == napi_ok && type == napi_object) return socket;
  close(fd);
  return NULL;
}

static int arguments(napi_env env, napi_callback_info info, struct sockaddr_un *address, napi_value *adopt) {
  napi_value args[2];
  napi_valuetype type;
  size_t argc = 2, bytes;
  if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok || argc != 2 ||
      napi_typeof(env, args[1], &type) != napi_ok || type != napi_function ||
      napi_get_value_string_utf8(env, args[0], NULL, 0, &bytes) != napi_ok ||
      bytes == 0 || bytes >= sizeof(address->sun_path)) return -1;
  memset(address, 0, sizeof(*address));
  address->sun_family = AF_UNIX;
  address->sun_len = (unsigned char)sizeof(*address);
  if (napi_get_value_string_utf8(env, args[0], address->sun_path, sizeof(address->sun_path), &bytes) != napi_ok ||
      address->sun_path[0] != '/' || strlen(address->sun_path) != bytes) return -1;
  *adopt = args[1];
  return 0;
}

static napi_value connect_peer(napi_env env, napi_callback_info info) {
  struct sockaddr_un address;
  napi_value adopt;
  if (arguments(env, info, &address, &adopt)) return fail(env, "EINVAL");
  int fd = prepare_fd(socket(AF_UNIX, SOCK_STREAM, 0));
  if (fd < 0) return fail(env, "ESOCKET");
  if (connect(fd, (struct sockaddr *)&address, sizeof(address)) != 0) {
    int cause = errno;
    close(fd);
    if (cause == ENOENT) return fail(env, "ENOENT");
    if (cause == ECONNREFUSED) return fail(env, "ECONNREFUSED");
    if (cause == EAGAIN || cause == EINPROGRESS || cause == EINTR) return fail(env, "EAGAIN");
    return fail(env, "ECONNECT");
  }
  if (!peer_matches_user(fd, geteuid())) { close(fd); return fail(env, "EPEER"); }
  napi_value socket = handoff(env, adopt, fd);
  return socket ? socket : fail(env, "EHANDOFF");
}

static void accept_ready(uv_poll_t *poll, int status, int events) {
  Listener *listener = poll->data;
  if (status < 0 || !(events & UV_READABLE)) return;
  // Bound per-tick accepts so live editor work is not starved by a long connect queue.
  for (int i = 0; i < 32; i++) {
    int fd = accept(listener->fd, NULL, NULL);
    if (fd < 0) return;
    if (prepare_fd(fd) < 0) continue;
    if (!peer_matches_user(fd, geteuid())) { close(fd); continue; }
    napi_handle_scope scope;
    if (napi_open_handle_scope(listener->env, &scope) != napi_ok) { close(fd); continue; }
    napi_value adopt;
    if (napi_get_reference_value(listener->env, listener->adopt, &adopt) == napi_ok)
      handoff(listener->env, adopt, fd);
    else close(fd);
    napi_close_handle_scope(listener->env, scope);
  }
}

static void poll_closed(uv_handle_t *handle) {
  Listener *listener = handle->data;
  listener->closed = true;
  if (listener->released) free(listener);
}

static void stop_listener(Listener *listener) {
  // Explicit shutdown and the JS finalizer may both arrive, in either order relative to uv_close.
  if (listener->fd < 0) return;
  uv_poll_stop(&listener->poll);
  close(listener->fd);
  listener->fd = -1;
  napi_delete_reference(listener->env, listener->adopt);
  uv_close((uv_handle_t *)&listener->poll, poll_closed);
}

static void finalize_listener(napi_env env, void *data, void *hint) {
  (void)env; (void)hint;
  Listener *listener = data;
  listener->released = true;
  if (listener->closed) free(listener);
  else stop_listener(listener);
}

static napi_value close_listener(napi_env env, napi_callback_info info) {
  napi_value args[1], value;
  size_t argc = 1;
  Listener *listener;
  if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok || argc != 1 ||
      napi_get_value_external(env, args[0], (void **)&listener) != napi_ok) return fail(env, "EINVAL");
  stop_listener(listener);
  napi_get_undefined(env, &value);
  return value;
}

static napi_value listen_peers(napi_env env, napi_callback_info info) {
  struct sockaddr_un address;
  napi_value adopt, external;
  uv_loop_t *loop;
  if (arguments(env, info, &address, &adopt) || napi_get_uv_event_loop(env, &loop) != napi_ok)
    return fail(env, "EINVAL");
  int fd = prepare_fd(socket(AF_UNIX, SOCK_STREAM, 0));
  if (fd < 0) return fail(env, "ESOCKET");
  if (bind(fd, (struct sockaddr *)&address, sizeof(address)) != 0) { close(fd); return fail(env, "EBIND"); }
  Listener *listener = calloc(1, sizeof(*listener));
  if (!listener || listen(fd, 64) < 0 || napi_create_reference(env, adopt, 1, &listener->adopt) != napi_ok) {
    free(listener); close(fd); unlink(address.sun_path); return fail(env, "ELISTEN");
  }
  listener->env = env;
  listener->fd = fd;
  if (uv_poll_init(loop, &listener->poll, fd) < 0) {
    napi_delete_reference(env, listener->adopt);
    free(listener); close(fd); unlink(address.sun_path); return fail(env, "ELISTEN");
  }
  listener->poll.data = listener;
  if (uv_poll_start(&listener->poll, UV_READABLE, accept_ready) < 0 ||
      napi_create_external(env, listener, finalize_listener, NULL, &external) != napi_ok) {
    listener->released = true;
    stop_listener(listener); unlink(address.sun_path); return fail(env, "ELISTEN");
  }
  return external;
}

static napi_value init(napi_env env, napi_value exports) {
  const napi_property_descriptor api[] = {
    {"renameExclusive", NULL, rename_exclusive, NULL, NULL, NULL, napi_default, NULL},
    {"connect", NULL, connect_peer, NULL, NULL, NULL, napi_default, NULL},
    {"listen", NULL, listen_peers, NULL, NULL, NULL, napi_default, NULL},
    {"close", NULL, close_listener, NULL, NULL, NULL, napi_default, NULL}
  };
  napi_define_properties(env, exports, sizeof(api) / sizeof(api[0]), api);
  return exports;
}
NAPI_MODULE(corelive_peer, init)
