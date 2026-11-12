#!/bin/sh
# galeo's dnf repository (ADR-036): one rpm-md repository holding one galeo .rpm per architecture (x86_64,
# aarch64), all of one version, each signed by the release workflow. The Pages workflow runs it:
#   dnf-repo.sh has-key <rpm>           exit 0 if the .rpm ships the repository's public key
#   dnf-repo.sh build <dir> <rpm>...    write the unsigned repository into <dir> (which must not exist)
#   dnf-repo.sh sign <dir>              sign repodata/repomd.xml with gpg's default key (GNUPGHOME)
#   dnf-repo.sh check <dir> <key>       as root on Fedora: dnf installs galeo from <dir> trusting only <key>,
#                                       checking the repository's signature and the package's
# Needs rpm and createrepo_c to build, gpg to sign, dnf to check. Linux only.
set -eu

ARCHES='x86_64 aarch64'
# Where the .rpm carries the public key; its %post copies it to /etc/pki/rpm-gpg/RPM-GPG-KEY-galeo.
KEY_IN_RPM=/opt/galeo/resources/galeo-archive-keyring.asc

fail() {
  printf 'dnf-repo: %s\n' "$*" >&2
  exit 1
}

field() {
  rpm -qp --nosignature --qf "$1" "$2" 2>/dev/null
}

has_key() {
  rpm -qpl --nosignature "$1" 2>/dev/null | grep -qx "$KEY_IN_RPM"
}

build() {
  dir=$1
  shift
  [ ! -e "$dir" ] || fail "$dir already exists"
  # One .rpm per architecture, all of one version: checked before anything is written.
  version='' seen=''
  for package do
    [ -f "$package" ] || fail "no such .rpm: $package"
    name=$(field '%{NAME}' "$package") || fail "not an .rpm: $package"
    arch=$(field '%{ARCH}' "$package")
    this=$(field '%{VERSION}-%{RELEASE}' "$package")
    [ "$name" = galeo ] || fail "the .rpm is '$name', not galeo"
    case " $ARCHES " in *" $arch "*) ;; *) fail "the .rpm is for $arch, not $(echo "$ARCHES" | sed 's/ / or /')" ;; esac
    case " $seen " in *" $arch "*) fail "two .rpm files for $arch" ;; esac
    [ -z "$version" ] || [ "$this" = "$version" ] || fail "$package is $this, not $version"
    version=$this seen="${seen:+$seen }$arch"
  done

  mkdir -p "$dir/packages"
  for package do
    cp "$package" "$dir/packages/galeo-$version.$(field '%{ARCH}' "$package").rpm"
  done
  # SHA-256 throughout; the metadata files carry their hash in their names, so a cached repomd.xml is never
  # paired with newer metadata.
  createrepo_c --quiet --checksum sha256 --no-database "$dir" > /dev/null
  printf 'dnf-repo: galeo %s for %s in %s\n' "$version" "$seen" "$dir"
}

sign() {
  repomd=$1/repodata/repomd.xml
  [ -f "$repomd" ] || fail "no repodata/repomd.xml in $1"
  rm -f "$repomd.asc"
  gpg --batch --yes --armor --detach-sign --output "$repomd.asc" "$repomd"
}

check() {
  [ "$(id -u)" -eq 0 ] || fail 'check runs as root: it installs galeo'
  dir=$(cd "$1" && pwd)
  key=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
  [ -f "$dir/repodata/repomd.xml" ] || fail "no repodata/repomd.xml in $dir"
  # An installed galeo would make dnf succeed without reading the repository.
  ! rpm -q galeo > /dev/null 2>&1 || fail 'galeo is already installed: check needs a system without it'
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  # The repository as users add it (USAGE), beside the system's own, which carry galeo's dependencies.
  # An id of its own each run, so cached metadata of an earlier repository never stands in for this one's.
  id=galeo-check-$(basename "$work")
  cat > "$work/$id.repo" <<EOF
[$id]
name=galeo (check)
baseurl=file://$dir
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=file://$key
EOF
  dnf -y -q --setopt=reposdir="/etc/yum.repos.d,$work" install galeo > "$work/dnf.log" 2>&1 \
    || { cat "$work/dnf.log" >&2; fail 'dnf install galeo failed'; }
  [ "$(rpm -q --qf '%{NAME}' galeo)" = galeo ] || fail 'dnf exited 0, but galeo is not installed'
  printf 'dnf-repo: dnf installed %s\n' "$(rpm -q galeo)"
}

case ${1:-} in
  has-key) [ $# -eq 2 ] || fail 'usage: dnf-repo.sh has-key <rpm>'; has_key "$2" ;;
  build) [ $# -ge 3 ] || fail 'usage: dnf-repo.sh build <dir> <rpm>...'; shift; build "$@" ;;
  sign) [ $# -eq 2 ] || fail 'usage: dnf-repo.sh sign <dir>'; sign "$2" ;;
  check) [ $# -eq 3 ] || fail 'usage: dnf-repo.sh check <dir> <key>'; check "$2" "$3" ;;
  *) fail 'usage: dnf-repo.sh has-key|build|sign|check …' ;;
esac
