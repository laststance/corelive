#include <sys/socket.h>
#include "peer_identity.h"

// Exercise Darwin's real peer credentials with an incompatible expected UID without changing login or using sudo.
int main(void) {
  int pair[2];
  if (socketpair(AF_UNIX, SOCK_STREAM, 0, pair) != 0) return 1;
  int result = peer_matches_user(pair[0], geteuid()) && !peer_matches_user(pair[0], geteuid() + 1) &&
               peer_matches_user(pair[1], geteuid()) && !peer_matches_user(-1, geteuid()) ? 0 : 1;
  close(pair[0]);
  close(pair[1]);
  return result;
}
