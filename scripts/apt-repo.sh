#!/bin/sh
# galeo's apt repository (ADR-029): one suite, `stable`, holding one galeo .deb. The Pages workflow runs it:
#   apt-repo.sh has-key <deb>          exit 0 if the .deb ships the repository's public key
#   apt-repo.sh build <deb> <dir>      write the unsigned repository into <dir> (which must not exist)
#   apt-repo.sh sign <dir>             sign dists/stable/Release with gpg's default key (GNUPGHOME)
#   apt-repo.sh check <dir> <key>      apt update + download against <dir>, trusting only <key>
# Needs dpkg-deb and apt-ftparchive (apt-utils), gpg to sign, apt-get to check. Linux only.
set -eu

SUITE=stable
COMPONENT=main
ARCH=amd64
# Where the .deb puts the public key (ADR-029); the user's sources entry names it in Signed-By.
KEY_IN_DEB=./opt/galeo/resources/galeo-archive-keyring.asc

fail() {
  printf 'apt-repo: %s\n' "$*" >&2
  exit 1
}

has_key() {
  dpkg-deb -c "$1" | awk '{print $NF}' | grep -qx "$KEY_IN_DEB"
}

build() {
  deb=$1 dir=$2
  [ -f "$deb" ] || fail "no such .deb: $deb"
  [ ! -e "$dir" ] || fail "$dir already exists"
  package=$(dpkg-deb -f "$deb" Package)
  arch=$(dpkg-deb -f "$deb" Architecture)
  version=$(dpkg-deb -f "$deb" Version)
  [ "$package" = galeo ] || fail "the .deb is '$package', not galeo"
  [ "$arch" = "$ARCH" ] || fail "the .deb is for $arch, not $ARCH"

  pool=pool/$COMPONENT/g/galeo
  index=dists/$SUITE/$COMPONENT/binary-$ARCH
  mkdir -p "$dir/$pool" "$dir/$index/by-hash/SHA256"
  cp "$deb" "$dir/$pool/galeo_${version}_$ARCH.deb"

  # SHA256 only: apt fetches by-hash with the strongest hash listed, and only SHA256 copies are written.
  hashes='-o APT::FTPArchive::MD5=false -o APT::FTPArchive::SHA1=false -o APT::FTPArchive::SHA512=false'
  # shellcheck disable=SC2086
  (cd "$dir" && apt-ftparchive $hashes packages "$pool" > "$index/Packages")
  gzip -9n < "$dir/$index/Packages" > "$dir/$index/Packages.gz"
  # By-hash copies, so a cached Release is never paired with a newer Packages (Acquire-By-Hash).
  for file in Packages Packages.gz; do
    sum=$(sha256sum "$dir/$index/$file" | cut -d' ' -f1)
    cp "$dir/$index/$file" "$dir/$index/by-hash/SHA256/$sum"
  done

  # shellcheck disable=SC2086
  (cd "$dir" && apt-ftparchive $hashes \
    -o APT::FTPArchive::Release::Origin=galeo \
    -o APT::FTPArchive::Release::Label=galeo \
    -o APT::FTPArchive::Release::Suite=$SUITE \
    -o APT::FTPArchive::Release::Codename=$SUITE \
    -o APT::FTPArchive::Release::Architectures=$ARCH \
    -o APT::FTPArchive::Release::Components=$COMPONENT \
    -o APT::FTPArchive::Release::Acquire-By-Hash=yes \
    -o "APT::FTPArchive::Release::Description=galeo, a fast, private desktop viewer and editor" \
    release "dists/$SUITE" > "dists/$SUITE/Release.new")
  mv "$dir/dists/$SUITE/Release.new" "$dir/dists/$SUITE/Release"
  printf 'apt-repo: galeo %s in %s\n' "$version" "$dir"
}

sign() {
  release=$1/dists/$SUITE/Release
  [ -f "$release" ] || fail "no Release in $1"
  rm -f "$release.gpg" "$1/dists/$SUITE/InRelease"
  gpg --batch --yes --armor --detach-sign --output "$release.gpg" "$release"
  gpg --batch --yes --clearsign --output "$1/dists/$SUITE/InRelease" "$release"
}

check() {
  dir=$(cd "$1" && pwd)
  key=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  mkdir -p "$work/etc/sources.list.d" "$work/etc/preferences.d" "$work/state/lists/partial" \
    "$work/cache/archives/partial" "$work/get"
  : > "$work/etc/sources.list"
  # The key's name must end in .asc for apt to read it armoured.
  cp "$key" "$work/galeo.asc"
  cat > "$work/etc/sources.list.d/galeo.sources" <<EOF
Types: deb
URIs: file://$dir
Suites: $SUITE
Components: $COMPONENT
Architectures: $ARCH
Signed-By: $work/galeo.asc
EOF
  # A private apt: its own sources, lists and cache, the system's dpkg status, no root.
  set -- -q -o "Dir::Etc=$work/etc" -o "Dir::State=$work/state" -o Dir::State::status=/var/lib/dpkg/status \
    -o "Dir::Cache=$work/cache" -o Debug::NoLocking=1 -o "APT::Sandbox::User=$(id -un)" \
    -o APT::Architecture=$ARCH
  # apt-get update exits 0 on some failures: treat any error or warning as one.
  apt-get "$@" update > "$work/update.log" 2>&1 || { cat "$work/update.log" >&2; fail 'apt-get update failed'; }
  if grep -qE '^(E|W|Err):' "$work/update.log"; then
    cat "$work/update.log" >&2
    fail 'apt-get update reported a problem'
  fi
  (cd "$work/get" && apt-get "$@" download galeo) > "$work/download.log" 2>&1 \
    || { cat "$work/download.log" >&2; fail 'apt-get download galeo failed'; }
  printf 'apt-repo: apt accepts %s\n' "$(ls "$work/get")"
}

case ${1:-} in
  has-key) [ $# -eq 2 ] || fail 'usage: apt-repo.sh has-key <deb>'; has_key "$2" ;;
  build) [ $# -eq 3 ] || fail 'usage: apt-repo.sh build <deb> <dir>'; build "$2" "$3" ;;
  sign) [ $# -eq 2 ] || fail 'usage: apt-repo.sh sign <dir>'; sign "$2" ;;
  check) [ $# -eq 3 ] || fail 'usage: apt-repo.sh check <dir> <key>'; check "$2" "$3" ;;
  *) fail 'usage: apt-repo.sh has-key|build|sign|check …' ;;
esac
