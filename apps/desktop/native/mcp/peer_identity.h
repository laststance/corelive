#include <stdbool.h>
#include <unistd.h>

// Query the connected peer, not the owner of the socket pathname.
static bool peer_matches_user(int fd, uid_t expected) {
  uid_t uid;
  gid_t gid;
  return getpeereid(fd, &uid, &gid) == 0 && uid == expected;
}
