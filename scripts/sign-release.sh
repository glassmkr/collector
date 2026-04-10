#!/bin/bash
# Sign a Crucible release
# Usage: ./scripts/sign-release.sh <version>

VERSION=$1
DIST_DIR="dist"

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/sign-release.sh <version>"
  echo "Example: ./scripts/sign-release.sh v0.2.0"
  exit 1
fi

echo "Signing Crucible $VERSION"

# Generate checksums
cd "$DIST_DIR" || exit 1
sha256sum *.tar.gz *.deb 2>/dev/null > SHA256SUMS || sha256sum *.js > SHA256SUMS

# Sign the checksums file
gpg --armor --detach-sign --local-user security@glassmkr.com SHA256SUMS

echo ""
echo "Release artifacts:"
ls -la SHA256SUMS SHA256SUMS.asc
echo ""
echo "Verify with:"
echo "  gpg --verify SHA256SUMS.asc SHA256SUMS"
echo "  sha256sum -c SHA256SUMS"
