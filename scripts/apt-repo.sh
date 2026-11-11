#!/bin/sh
# galeo's apt repository (ADR-029, ADR-035): one suite, `stable`, holding one galeo .deb per architecture
# (amd64, arm64), all of one version. The Pages workflow runs it:
#   apt-repo.sh has-key <deb>            exit 0 if the .deb ships the repository's public key
#   apt-repo.sh build <dir> <deb>...     write the unsigned repository into <dir> (which must not exist)
#   apt-repo.sh sign <dir>               sign dists/stable/Release with gpg's default key (GNUPGHOME)
#   apt-repo.sh check <dir> <key>        apt update + download against <dir> for each of its architectures,
#                                        trusting only <key>
# Needs dpkg-deb and apt-ftparchive (apt-utils), gpg to sign, apt-get to check. Linux only.
set -eu

SUITE=stable
COMPONENT=main
ARCHES='amd64 arm64'
# Where the .deb carries the public key (ADR-029); its after-install copies it to /usr/share/keyrings.
KEY_IN_DEB=./opt/galeo/resources/galeo-archive-keyring.asc

fail() {
  printf 'apt-repo: %s\n' "$*" >&2
  exit 1
}

has_key() {
  dpkg-deb -c "$1" | awk '{print $NF}' | grep -qx "$KEY_IN_DEB"
}

build() {
  dir=$1
  shift
  [ ! -e "$dir" ] || fail "$dir already exists"
  # One .deb per architecture, all of one version: checked before anything is written.
  version='' seen=''
  for deb do
    [ -f "$deb" ] || fail "no such .deb: $deb"
    package=$(dpkg-deb -f "$deb" Package)
    arch=$(dpkg-deb -f "$deb" Architecture)
    this=$(dpkg-deb -f "$deb" Version)
    [ "$package" = galeo ] || fail "the .deb is '$package', not galeo"
    case " $ARCHES " in *" $arch "*) ;; *) fail "the .deb is for $arch, not $(echo "$ARCHES" | sed 's/ / or /')" ;; esac
    case " $seen " in *" $arch "*) fail "two .deb files for $arch" ;; esac
    [ -z "$version" ] || [ "$this" = "$version" ] || fail "$deb is $this, not $version"
    version=$this seen="${seen:+$seen }$arch"
  done
  # In the order of ARCHES, so the Release lists them the same way every time.
  arches=''
  for arch in $ARCHES; do
    case " $seen " in *" $arch "*) arches="${arches:+$arches }$arch" ;; esac
  done

  pool=pool/$COMPONENT/g/galeo
  mkdir -p "$dir/$pool"
  for deb do
    cp "$deb" "$dir/$pool/galeo_${version}_$(dpkg-deb -f "$deb" Architecture).deb"
  done

  # SHA256 only: apt fetches by-hash with the strongest hash listed, and only SHA256 copies are written.
  hashes='-o APT::FTPArchive::MD5=false -o APT::FTPArchive::SHA1=false -o APT::FTPArchive::SHA512=false'
  for arch in $arches; do
    index=dists/$SUITE/$COMPONENT/binary-$arch
    mkdir -p "$dir/$index/by-hash/SHA256"
    # shellcheck disable=SC2086
    (cd "$dir" && apt-ftparchive $hashes --arch "$arch" packages "$pool" > "$index/Packages")
    gzip -9n < "$dir/$index/Packages" > "$dir/$index/Packages.gz"
    # By-hash copies, so a cached Release is never paired with a newer Packages (Acquire-By-Hash).
    for file in Packages Packages.gz; do
      sum=$(sha256sum "$dir/$index/$file" | cut -d' ' -f1)
      cp "$dir/$index/$file" "$dir/$index/by-hash/SHA256/$sum"
    done
  done

  # shellcheck disable=SC2086
  (cd "$dir" && apt-ftparchive $hashes \
    -o APT::FTPArchive::Release::Origin=galeo \
    -o APT::FTPArchive::Release::Label=galeo \
    -o APT::FTPArchive::Release::Suite=$SUITE \
    -o APT::FTPArchive::Release::Codename=$SUITE \
    -o "APT::FTPArchive::Release::Architectures=$arches" \
    -o APT::FTPArchive::Release::Components=$COMPONENT \
    -o APT::FTPArchive::Release::Acquire-By-Hash=yes \
    -o "APT::FTPArchive::Release::Description=galeo, a fast, private desktop viewer and editor" \
    release "dists/$SUITE" > "dists/$SUITE/Release.new")
  mv "$dir/dists/$SUITE/Release.new" "$dir/dists/$SUITE/Release"
  printf 'apt-repo: galeo %s for %s in %s\n' "$version" "$arches" "$dir"
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
  [ -f "$dir/dists/$SUITE/Release" ] || fail "no Release in $dir"
  arches=$(sed -n 's/^Architectures: //p' "$dir/dists/$SUITE/Release")
  [ -n "$arches" ] || fail 'the Release lists no architectures'
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  # The key's name must end in .asc for apt to read it armoured.
  cp "$key" "$work/galeo.asc"
  for arch in $arches; do
    check_arch "$dir" "$work/galeo.asc" "$arch" "$work/$arch"
  done
}

# apt update + download of galeo for one architecture, in a private apt under <apt>.
check_arch() {
  # Its own names: sh has no local variables, and check() still needs its own.
  repo=$1 trusted=$2 arch=$3 apt=$4
  mkdir -p "$apt/etc/sources.list.d" "$apt/etc/preferences.d" "$apt/state/lists/partial" \
    "$apt/cache/archives/partial" "$apt/get"
  : > "$apt/etc/sources.list"
  cat > "$apt/etc/sources.list.d/galeo.sources" <<EOF
Types: deb
URIs: file://$repo
Suites: $SUITE
Components: $COMPONENT
Architectures: $arch
Signed-By: $trusted
EOF
  # A private apt: its own sources, lists and cache, the system's dpkg status, no root.
  set -- -q -o "Dir::Etc=$apt/etc" -o "Dir::State=$apt/state" -o Dir::State::status=/var/lib/dpkg/status \
    -o "Dir::Cache=$apt/cache" -o Debug::NoLocking=1 -o "APT::Sandbox::User=$(id -un)" \
    -o "APT::Architecture=$arch" -o "APT::Architectures=$arch"
  # apt-get update exits 0 on some failures: treat any error or warning as one.
  apt-get "$@" update > "$apt/update.log" 2>&1 || { cat "$apt/update.log" >&2; fail "apt-get update failed ($arch)"; }
  if grep -qE '^(E|W|Err):' "$apt/update.log"; then
    cat "$apt/update.log" >&2
    fail "apt-get update reported a problem ($arch)"
  fi
  (cd "$apt/get" && apt-get "$@" download "galeo:$arch") > "$apt/download.log" 2>&1 \
    || { cat "$apt/download.log" >&2; fail "apt-get download galeo failed ($arch)"; }
  printf 'apt-repo: apt accepts %s\n' "$(ls "$apt/get")"
}

case ${1:-} in
  has-key) [ $# -eq 2 ] || fail 'usage: apt-repo.sh has-key <deb>'; has_key "$2" ;;
  build) [ $# -ge 3 ] || fail 'usage: apt-repo.sh build <dir> <deb>...'; shift; build "$@" ;;
  sign) [ $# -eq 2 ] || fail 'usage: apt-repo.sh sign <dir>'; sign "$2" ;;
  check) [ $# -eq 3 ] || fail 'usage: apt-repo.sh check <dir> <key>'; check "$2" "$3" ;;
  *) fail 'usage: apt-repo.sh has-key|build|sign|check …' ;;
esac
