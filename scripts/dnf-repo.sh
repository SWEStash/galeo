#!/bin/sh
# galeo's dnf repository (ADR-036): one rpm-md repository holding one galeo .rpm per architecture (x86_64,
# aarch64), all of one version, each signed by the release workflow. The Pages workflow runs it:
#   dnf-repo.sh has-key <rpm>           exit 0 if the .rpm ships the repository's public key
#   dnf-repo.sh sign-packages <key> <rpm>...
#                                       sign each .rpm with gpg's default key (GNUPGHOME), then check every
#                                       signature against <key> alone (the release workflow, before attestation)
#   dnf-repo.sh build <dir> <rpm>...    write the unsigned repository into <dir> (which must not exist)
#   dnf-repo.sh sign <dir>              sign repodata/repomd.xml with gpg's default key (GNUPGHOME)
#   dnf-repo.sh check <dir> <key>       as root on Fedora: dnf installs galeo from <dir> trusting only <key>,
#                                       checking the repository's signature and the package's
# Needs rpm and createrepo_c to build, gpg and rpmsign to sign, dnf to check. Linux only.
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

sign_packages() {
  key=$1
  shift
  # The key whose secret part GNUPGHOME holds; gpg signs with its signing subkey.
  signer=$(gpg --batch --with-colons --list-secret-keys | awk -F: '$1 == "fpr" { print $10; exit }')
  [ -n "$signer" ] || fail 'no secret key in GNUPGHOME'
  for package do
    [ -f "$package" ] || fail "no such .rpm: $package"
    # Ubuntu's rpm looks for /usr/bin/gpg2, which Ubuntu doesn't ship: name the gpg on PATH.
    rpmsign --addsign --define "__gpg $(command -v gpg)" --define "_gpg_path ${GNUPGHOME:?}" --define "_gpg_name $signer" \
      "$package" > /dev/null \
      || fail "rpmsign failed: $package"
  done
  # Checked against the public key alone, in a keyring of its own.
  db=$(mktemp -d)
  trap 'rm -rf "$db"' EXIT
  rpmkeys --dbpath "$db" --import "$key" || fail "can't import $key"
  for package do
    rpmkeys --dbpath "$db" --checksig "$package" | grep -q ': digests signatures OK$' \
      || { rpmkeys --dbpath "$db" --checksig -v "$package" >&2 || true; fail "$package: not signed by $key"; }
    printf 'dnf-repo: signed %s\n' "$(basename "$package")"
  done
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
  # The repository as users add it (USAGE): a file in /etc/yum.repos.d, beside the system's own repositories,
  # which carry galeo's dependencies wherever the system keeps them (Fedora 45: /usr/share/dnf5/repos.d).
  # An id of its own each run, so cached metadata of an earlier repository never stands in for this one's.
  id=galeo-check-$(basename "$work")
  repo=/etc/yum.repos.d/$id.repo
  trap 'rm -rf "$work" "$repo"' EXIT
  cat > "$repo" <<EOF
[$id]
name=galeo (check)
baseurl=file://$dir
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=file://$key
EOF
  dnf -y -q install galeo > "$work/dnf.log" 2>&1 \
    || { cat "$work/dnf.log" >&2; fail 'dnf install galeo failed'; }
  [ "$(rpm -q --qf '%{NAME}' galeo)" = galeo ] || fail 'dnf exited 0, but galeo is not installed'
  printf 'dnf-repo: dnf installed %s\n' "$(rpm -q galeo)"
}

case ${1:-} in
  has-key) [ $# -eq 2 ] || fail 'usage: dnf-repo.sh has-key <rpm>'; has_key "$2" ;;
  sign-packages) [ $# -ge 3 ] || fail 'usage: dnf-repo.sh sign-packages <key> <rpm>...'; shift; sign_packages "$@" ;;
  build) [ $# -ge 3 ] || fail 'usage: dnf-repo.sh build <dir> <rpm>...'; shift; build "$@" ;;
  sign) [ $# -eq 2 ] || fail 'usage: dnf-repo.sh sign <dir>'; sign "$2" ;;
  check) [ $# -eq 3 ] || fail 'usage: dnf-repo.sh check <dir> <key>'; check "$2" "$3" ;;
  *) fail 'usage: dnf-repo.sh has-key|sign-packages|build|sign|check …' ;;
esac
